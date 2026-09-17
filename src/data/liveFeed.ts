// The live rover feed, loaded once for the whole app and shared. It starts the
// moment the site opens, on the map, not when the gallery is first shown: the
// mars2020 endpoint answers in eleven to sixteen seconds, and a reader who
// opened the gallery used to sit through two of those in a row before a
// single live post appeared. Now those seconds pass while they look at the
// map, and the last visit's stream is kept in localStorage so even the first
// paint is the newest thing we had, not the daily bundle.
//
// Two publications per load, neither of which reshuffles the top of the
// stream: first the newest frames of every rover (one slow request each, in
// parallel), then those sols pulled whole, which only grows posts and appends
// older ones below.
import type { FrameThumb } from '../types.ts';
import { fetchLatestFrames, fetchSolImages } from './roverImages.ts';

export interface LiveCursor {
  nextSol: number;
  topSolComplete: boolean;
  done: boolean;
}

export interface LiveFeedState {
  byCraft: Record<string, FrameThumb[]>;
  cursors: Record<string, LiveCursor>;
  /** Where the frames came from: the last visit, the newest-frames pass, or whole sols. */
  stage: 'none' | 'cache' | 'latest' | 'complete';
  /** When the live data was fetched. */
  at: number;
}

const STORE_KEY = 'sublight.feed.live';
const CACHE_PER_CRAFT = 150;
const MIN_GAP_MS = 2 * 60 * 1000;   // never twice within two minutes
const POLL_MS = 15 * 60 * 1000;     // and at most four times an hour: NASA publishes every 4–7 h

const listeners = new Set<() => void>();
let state: LiveFeedState = hydrate();

if (import.meta.env.DEV) (window as unknown as { __sublightLive?: () => LiveFeedState }).__sublightLive = () => state;
let ids: string[] = [];
let started = false;
let loading = false;
let lastLoad = 0;

function hydrate(): LiveFeedState {
  const empty: LiveFeedState = { byCraft: {}, cursors: {}, stage: 'none', at: 0 };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<LiveFeedState>;
    if (!saved.byCraft || !saved.cursors || !saved.at) return empty;
    return { byCraft: saved.byCraft, cursors: saved.cursors, stage: 'cache', at: saved.at };
  } catch {
    return empty;
  }
}

function persist(s: LiveFeedState): void {
  try {
    const byCraft: Record<string, FrameThumb[]> = {};
    for (const [id, list] of Object.entries(s.byCraft)) byCraft[id] = list.slice(0, CACHE_PER_CRAFT);
    localStorage.setItem(STORE_KEY, JSON.stringify({ byCraft, cursors: s.cursors, at: s.at }));
  } catch {
    /* storage full or unavailable: the next visit seeds from the bundle */
  }
}

function emit(next: LiveFeedState): void {
  state = next;
  for (const l of listeners) l();
}

export function subscribeLiveFeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getLiveFeed(): LiveFeedState {
  return state;
}

/** Kick off the live load and the polling. Idempotent; called as soon as the bundle names the rovers. */
export function startLiveFeed(roverIds: string[]): void {
  ids = roverIds;
  if (started || !ids.length) return;
  started = true;
  void load(false);
  const maybe = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastLoad < MIN_GAP_MS) return;
    void load(true);
  };
  document.addEventListener('visibilitychange', maybe);
  window.setInterval(maybe, POLL_MS);
}

/** A reload on demand (pull to refresh), paced like the poll. */
export function refreshLiveFeed(): void {
  if (Date.now() - lastLoad < MIN_GAP_MS) return;
  void load(true);
}

async function load(force: boolean): Promise<void> {
  if (loading || !ids.length) return;
  loading = true;
  lastLoad = Date.now();
  try {
    // Stage one: the newest frames of every rover, published together once
    // all are in, so the top of the stream lands in one piece.
    const latest = await Promise.all(
      ids.map(async (id) => {
        try {
          const fresh = await fetchLatestFrames(id, 48, force);
          return fresh.length ? { id, fresh } : null;
        } catch {
          return null; // offline or feed down: this rover keeps what it had
        }
      }),
    );
    const byCraft = { ...state.byCraft };
    const cursors = { ...state.cursors };
    const plans: { id: string; sols: number[] }[] = [];
    for (const r of latest) {
      if (!r) continue;
      byCraft[r.id] = r.fresh;
      // Every sol in the newest downlink, not just the highest one. A rover can
      // send an older sol home after a newer one, and the stream is ordered by
      // arrival, so that older sol belongs at the top. Capped, so an unusual
      // batch can't fan out into requests.
      const sols = [...new Set(r.fresh.map((f) => f.sol).filter((x): x is number => x != null))]
        .sort((a, b) => b - a)
        .slice(0, 3);
      if (sols.length) {
        cursors[r.id] = { nextSol: Math.min(...sols), topSolComplete: false, done: false };
        plans.push({ id: r.id, sols });
      }
    }
    if (plans.length) {
      const at = Date.now();
      emit({ byCraft, cursors, stage: 'latest', at });
      persist(state);
    }

    // Stage two: those sols whole. A publication must be complete before the
    // reader can scroll past it, or loading older would grow it in place.
    const whole = await Promise.all(
      plans.map(async ({ id, sols }) => {
        const parts = await Promise.all(
          sols.map((sn) => fetchSolImages(id, sn, 600, force).then((r) => r.frames).catch(() => [])),
        );
        const merged = parts.flat();
        return merged.length ? { id, frames: merged, nextSol: Math.min(...sols) - 1 } : null;
      }),
    );
    const byCraft2 = { ...state.byCraft };
    const cursors2 = { ...state.cursors };
    let any = false;
    for (const r of whole) {
      if (!r) continue;
      byCraft2[r.id] = r.frames;
      cursors2[r.id] = { nextSol: r.nextSol, topSolComplete: true, done: false };
      any = true;
    }
    if (any) {
      emit({ byCraft: byCraft2, cursors: cursors2, stage: 'complete', at: Date.now() });
      persist(state);
    }
  } finally {
    loading = false;
  }
}
