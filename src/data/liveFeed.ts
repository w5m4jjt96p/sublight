// The live rover feed, loaded once for the whole app and shared. It starts as
// soon as the code runs, before the bundled JSON has even arrived, so the
// newest photos are usually in hand by the time the first post can paint. The
// last stream is kept in localStorage, so a returning reader starts from it.
//
// Each rover loads on its own, in two steps: its newest frames (a fraction of a
// second), then its latest sols whole, because a publication has to be complete
// before the reader can scroll past it. A poll keeps what is on screen until
// the whole sols are in, so nothing shrinks while it runs.
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
  /** 'cache' is the last visit; 'live' means at least one rover has answered. */
  stage: 'none' | 'cache' | 'live';
  /** When the live data was fetched. */
  at: number;
}

// The two rovers with a live feed; the fetchers above know no others.
const ROVERS = ['perseverance', 'curiosity'];
const STORE_KEY = 'sublight.feed.v2'; // v2: frames carry a score
const CACHE_PER_CRAFT = 150;
const SOLS_PER_ROVER = 3;
const MIN_GAP_MS = 2 * 60 * 1000;   // never twice within two minutes
const POLL_MS = 15 * 60 * 1000;     // and at most four times an hour: NASA publishes every 4 to 7 h

const listeners = new Set<() => void>();
let state: LiveFeedState = hydrate();
/** Rovers whose whole sols have landed at least once this visit. */
const complete = new Set<string>();
let started = false;
let loading = false;
let lastLoad = 0;

if (import.meta.env.DEV) (window as unknown as { __sublightLive?: () => LiveFeedState }).__sublightLive = () => state;

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

function publish(id: string, frames: FrameThumb[], cursor: LiveCursor): void {
  state = {
    byCraft: { ...state.byCraft, [id]: frames },
    cursors: { ...state.cursors, [id]: cursor },
    stage: 'live',
    at: Date.now(),
  };
  for (const l of listeners) l();
  persist(state);
}

export function subscribeLiveFeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getLiveFeed(): LiveFeedState {
  return state;
}

/** Start the live load and the polling. Idempotent. */
export function startLiveFeed(): void {
  if (started) return;
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

async function load(force: boolean): Promise<void> {
  if (loading) return;
  loading = true;
  lastLoad = Date.now();
  try {
    await Promise.all(ROVERS.map((id) => loadRover(id, force)));
  } finally {
    loading = false;
  }
}

async function loadRover(id: string, force: boolean): Promise<void> {
  let fresh: FrameThumb[];
  try {
    fresh = await fetchLatestFrames(id, 100, force);
  } catch {
    return; // offline or feed down: this rover keeps what it had
  }
  if (!fresh.length) return;

  // Every sol in the newest downlink, then back from there, so the stream opens
  // with several posts and not one. Capped, so an unusual batch can't fan out.
  const seen = [...new Set(fresh.map((f) => f.sol).filter((x): x is number => x != null))].sort((a, b) => b - a);
  if (!seen.length) return;
  const sols = seen.slice(0, SOLS_PER_ROVER);
  while (sols.length < SOLS_PER_ROVER && sols[sols.length - 1]! > 0) sols.push(sols[sols.length - 1]! - 1);
  const oldest = sols[sols.length - 1]!;

  if (!complete.has(id)) publish(id, fresh, { nextSol: oldest, topSolComplete: false, done: false });

  const parts = await Promise.all(
    sols.map((sol) => fetchSolImages(id, sol, 600, force).then((r) => r.frames).catch(() => [] as FrameThumb[])),
  );
  const whole = parts.flat();
  if (!whole.length) return;
  complete.add(id);
  publish(id, whole, { nextSol: oldest - 1, topSolComplete: true, done: oldest - 1 < 0 });
}
