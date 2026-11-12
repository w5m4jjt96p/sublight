// The feed — one chronological stream for the whole fleet, the way a social
// timeline reads. Publications from different craft interleave by arrival:
//
//   Perseverance · sol 1970 · arrived 10 min ago
//   Perseverance · sol 1969 · arrived 30 min ago
//   Curiosity    · sol 5005 · arrived 40 min ago
//
// A publication is one craft on one sol, whole, swiped like a carousel. Older
// sols load as you scroll — every rover steps back a sol and the stream is
// re-merged, so date order holds across craft.
//
// "Arrived" means the feed's `date_received`: the moment the frame reached
// Earth. It is deliberately not capture time plus light-time, which would put a
// batch downlinked 90 minutes ago 28 hours down the stream.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FramesData, FrameThumb } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { fetchSolImages, openingFrame } from '../data/roverImages.ts';
import { visibleFrames, cameraName } from '../data/frameScore.ts';
import { subscribeLiveFeed, getLiveFeed, type LiveFeedState } from '../data/liveFeed.ts';
import { fmtSince, fmtDuration } from '../data/format.ts';
import { owltAt } from '../data/lightTime.ts';
import { Avatar } from './Avatar.tsx';

const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`);
// Some feeds (mars2020) omit the timezone; those times are UTC, so append Z
// instead of letting Date.parse read them as local time.
const capMs = (utc: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(utc) ? utc : `${utc}Z`) || 0;

// When a frame actually reached Earth. The feed's `date_received` is the
// measured answer and is what the stream is ordered and dated by. Capture time
// plus light-time is only a fallback for bundles written before we carried it:
// it assumes the rover beams every frame the instant it takes it, when in fact
// frames wait in memory for a relay pass, sometimes for days.
const arrivedMs = (f: FrameThumb, owlt: number) =>
  (f.receivedUtc ? capMs(f.receivedUtc) : 0) || capMs(f.capturedUtc) + owlt * 1000;

const PAGE = 3;       // publications revealed per step
/** How long the first paint waits for NASA before settling for the bundle. */
const FIRST_PAINT_WAIT_MS = 500;
/** A new post that lands this soon after opening is simply the top of the feed. */
const SETTLE_MS = 5000;
const STRIP_MAX = 40; // sampled scrub strip; scrubbing still covers every frame

interface CraftMeta {
  name: string;
  location: string;
  owlt: number;
  lightLine: string | null;
}

interface Publication {
  key: string;
  craftId: string;
  craftName: string;
  location: string;
  owlt: number;
  lightLine: string | null;
  sol: number | null;
  arrivalMs: number;
  photos: FrameThumb[];
}

interface Cursor { nextSol: number; topSolComplete: boolean; done: boolean }

interface FeedProps {
  frames: FramesData;
  model: MapModel | null;
  generatedAt: string | null;
  now: number;
  onOpenList: (frames: FrameThumb[], index: number, craftName: string, owlt: number) => void;
}

const sinceLabel = (ms: number, now: number) => {
  const since = fmtSince(new Date(ms).toISOString(), now);
  return since === 'just now' ? since : `${since} ago`;
};

/** Same picture, whichever source described it: bundle and live differ in URLs. */
const frameKey = (f: FrameThumb) => `${capMs(f.capturedUtc)}|${f.instrument}`;

export function Feed({ frames, model, generatedAt, now, onOpenList }: FeedProps) {
  const [byCraft, setByCraft] = useState<Record<string, FrameThumb[]>>({});
  const [visible, setVisible] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const cursors = useRef<Record<string, Cursor>>({});
  const loadingRef = useRef(false);
  const seeded = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // Craft identity + light-time, recomputed as the clock ticks.
  const meta = useMemo(() => {
    const m: Record<string, CraftMeta> = {};
    for (const c of model?.craft ?? []) {
      const owlt = generatedAt ? (owltAt(c.eph, generatedAt, now) ?? 0) : 0;
      m[c.entry.id] = {
        name: c.entry.name,
        location: c.entry.location,
        owlt,
        lightLine: owlt > 0 ? fmtDuration(owlt) : null,
      };
    }
    return m;
  }, [model, generatedAt, now]);

  // Instant first paint from the bundled snapshot.
  useEffect(() => {
    if (seeded.current || !Object.keys(frames).length) return;
    seeded.current = true;
    const seed: Record<string, FrameThumb[]> = {};
    for (const [id, f] of Object.entries(frames)) {
      seed[id] = f.recent?.length
        ? [...f.recent]
        : [{ file: f.file, full: f.full, sourceUrl: f.sourceUrl, instrument: f.instrument, capturedUtc: f.capturedUtc, sol: f.sol }];
      if (f.sol != null) cursors.current[id] = { nextSol: f.sol, topSolComplete: false, done: false };
    }
    setByCraft(seed);
  }, [frames]);

  // The live stream is loaded app-wide (see data/liveFeed.ts), from the moment
  // the code runs. This component folds whatever the store holds into the
  // stream. Sols the reader has already scrolled back to stay: a poll carries
  // only the latest sols, and dropping the rest would pull the feed out from
  // under them. A cache from the last visit is kept per craft only where it is
  // newer than the bundle, since a bundle refreshed since then is the fresher.
  const live = useSyncExternalStore(subscribeLiveFeed, getLiveFeed);
  const applyLive = useCallback((s: LiveFeedState) => {
    const newest = (list: FrameThumb[]) => Math.max(0, ...list.map((f) => capMs(f.receivedUtc || f.capturedUtc)));
    setByCraft((prev) => {
      const next = { ...prev };
      for (const [id, list] of Object.entries(s.byCraft)) {
        if (s.stage === 'cache' && newest(list) < newest(prev[id] ?? [])) continue;
        const sols = list.map((f) => f.sol ?? 0);
        const lowest = sols.length ? Math.min(...sols) : 0;
        const c = cursors.current[id];
        const older = c?.topSolComplete ? (prev[id] ?? []).filter((f) => (f.sol ?? 0) < lowest) : [];
        next[id] = [...list, ...older];
        const incoming = s.cursors[id];
        if (incoming && !older.length) cursors.current[id] = { ...incoming };
      }
      return next;
    });
    setHeld(null);
  }, []);

  // The first paint waits a beat for NASA, which usually answers inside it, so
  // the reader does not watch a post get replaced a moment after it appears.
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (live.stage === 'live') { setPainted(true); return; }
    const t = window.setTimeout(() => setPainted(true), FIRST_PAINT_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [live.stage]);

  // Anything that would change the top of the stream once the reader has
  // settled waits behind a "New photos" pill: a picture must not swap while it
  // is being looked at.
  const [held, setHeld] = useState<LiveFeedState | null>(null);
  const openedAt = useRef(performance.now());
  const topArrival = useRef(0);
  // Coming back to the tab counts as opening: they were not looking at anything.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') openedAt.current = performance.now(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    if (live.stage === 'none' || !seeded.current) return;
    const newestLive = Math.max(
      0,
      ...Object.values(live.byCraft).flat().filter((f) => (f.score ?? 0) >= 0).map((f) => capMs(f.receivedUtc || f.capturedUtc)),
    );
    const settled = performance.now() - openedAt.current > SETTLE_MS;
    const scrolled = (sentinel.current?.closest('.gallery-overlay')?.scrollTop ?? 0) > 200;
    if ((settled || scrolled) && topArrival.current && newestLive > topArrival.current) setHeld(live);
    else applyLive(live);
    // `frames` too: the store can land before the bundle has seeded the stream.
  }, [live, frames, applyLive]);

  // Flatten the fleet, sort by arrival, then fold each craft's sol into one post.
  const pubs = useMemo(() => {
    const flat: { f: FrameThumb; craftId: string; arr: number }[] = [];
    for (const [id, list] of Object.entries(byCraft)) {
      const m = meta[id];
      if (!m) continue;
      for (const f of list) {
        if ((f.score ?? 0) < 0) continue; // night noise, flat sky, sun-finding crops
        flat.push({ f, craftId: id, arr: arrivedMs(f, m.owlt) });
      }
    }
    flat.sort((a, b) => b.arr - a.arr);

    const buckets = new Map<string, { photos: FrameThumb[]; craftId: string; arr: number }>();
    const order: string[] = [];
    for (const x of flat) {
      // The sol is the rover's own day; craft without one (EPIC) fall back to
      // the calendar day. Either way a batch is never split by a UTC midnight.
      const day = x.f.sol != null ? `sol${x.f.sol}` : new Date(capMs(x.f.capturedUtc)).toISOString().slice(0, 10);
      const key = `${x.craftId}|${day}`;
      let b = buckets.get(key);
      if (!b) { b = { photos: [], craftId: x.craftId, arr: x.arr }; buckets.set(key, b); order.push(key); }
      b.photos.push(x.f);
    }
    return order.map((key) => {
      const b = buckets.get(key)!;
      const m = meta[b.craftId]!;
      // Order *within* a publication stays capture order, newest first. These
      // frames are usually one sequence, and the flipbook only reads as motion
      // if they run in the order the camera shot them — a whole downlink shares
      // one arrival time, so sorting the post by arrival would scramble it.
      b.photos.sort((x, y) => capMs(y.capturedUtc) - capMs(x.capturedUtc));
      b.photos = visibleFrames(b.photos);
      return {
        key, craftId: b.craftId, craftName: m.name, location: m.location,
        owlt: m.owlt, lightLine: m.lightLine,
        sol: b.photos[0]!.sol ?? null, arrivalMs: b.arr, photos: b.photos,
      } as Publication;
    });
  }, [byCraft, meta]);

  topArrival.current = pubs[0]?.arrivalMs ?? 0;

  // Step every rover back one sol and re-merge, so the stream stays in date
  // order across craft rather than exhausting one rover first.
  const loadOlder = useCallback(async () => {
    if (loadingRef.current) return;
    const live = Object.entries(cursors.current).filter(([, c]) => !c.done);
    if (!live.length) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const results = await Promise.all(live.map(async ([id, cur]) => {
        let sol = cur.topSolComplete ? cur.nextSol : cur.nextSol;
        let added: FrameThumb[] = [];
        // Descend past the occasional empty sol so a gap never dead-ends the feed.
        for (let tries = 0; tries < 8 && sol >= 0; tries++, sol--) {
          const d = await fetchSolImages(id, sol, 600);
          if (d.frames.length) { added = d.frames; break; }
        }
        return { id, added, sol, replace: !cur.topSolComplete };
      }));
      setByCraft((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (!r.added.length) continue;
          next[r.id] = r.replace ? r.added : [...(next[r.id] ?? []), ...r.added];
        }
        return next;
      });
      for (const r of results) {
        cursors.current[r.id] = { nextSol: r.sol - 1, topSolComplete: true, done: r.sol - 1 < 0 };
      }
      setVisible((v) => v + PAGE);
    } catch {
      /* keep what we have; scrolling again retries */
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Infinite scroll: reveal what's loaded, then pull older sols. No button.
  const advance = useCallback(() => {
    if (visible < pubs.length) setVisible((v) => Math.min(v + PAGE, pubs.length));
    else void loadOlder();
  }, [visible, pubs.length, loadOlder]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) advance();
    }, { rootMargin: '600px' });
    obs.observe(el);

    // Belt and braces: with no button left, the observer failing to fire would
    // dead-end the feed, so a plain scroll listener also advances near the end.
    const scroller = el.closest('.gallery-overlay') as HTMLElement | null;
    const onScroll = () => {
      const s = scroller;
      if (!s) return;
      if (s.scrollTop + s.clientHeight >= s.scrollHeight - 800) advance();
    };
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      obs.disconnect();
      scroller?.removeEventListener('scroll', onScroll);
    };
  }, [advance]);

  const shown = pubs.slice(0, visible);
  const exhausted = Object.values(cursors.current).every((c) => c.done);

  const showHeld = () => {
    if (held) applyLive(held);
    sentinel.current?.closest('.gallery-overlay')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="feed">
      {held && (
        <button className="feed-new" onClick={showHeld}>↑ New photos</button>
      )}
      {!painted || shown.length === 0 ? (
        <article className="post post-skeleton" aria-busy="true" aria-label="Loading the latest photos">
          <div className="post-head"><span className="ga-avatar" /></div>
          <div className="pub-stage" />
        </article>
      ) : (
        shown.map((pub, i) => (
          <PublicationCard key={pub.key} pub={pub} now={now} first={i === 0} onOpenList={onOpenList} />
        ))
      )}
      <div ref={sentinel} className="feed-sentinel" aria-hidden />
      {loading && <p className="feed-status">Reaching further back…</p>}
      {!loading && exhausted && shown.length > 0 && <p className="feed-status">That is the whole archive.</p>}
    </div>
  );
}

/**
 * One publication: a craft's frames from a single sol. These are usually a real
 * sequence — EPIC watching the Earth turn, a rover camera sweeping a ridge — so
 * the frame is swapped in place with no transition at all: run through them and
 * they read as motion, the way a flipbook does. Scrub the strip, or hit play.
 */
function PublicationCard({
  pub, now, first, onOpenList,
}: {
  pub: Publication;
  now: number;
  first: boolean;
  onOpenList: (frames: FrameThumb[], index: number, craftName: string, owlt: number) => void;
}) {
  const count = pub.photos.length;
  // Open on the best-scored frame rather than on whatever the sequence happens
  // to start with. The array stays in capture order so the flipbook still reads
  // as motion; only the frame you land on changes. Picked during the first
  // render, so the wrong frame is never requested at all.
  const [index, setIndex] = useState(() => openingFrame(pub.photos));
  /** Set as soon as the reader scrubs or plays, so we stop moving the frame. */
  const touched = useRef(false);
  // When more frames land, the picture on screen stays the picture on screen:
  // follow it to its new position. Only if it has gone does the post re-open.
  // The exception is the first moments after mount, when the whole sol lands a
  // beat after a partial answer: nobody has looked yet, and a frame chosen from
  // a handful must not outlive the sol's real best.
  const shownKey = useRef<string | null>(null);
  const mountedAt = useRef(performance.now());
  useEffect(() => {
    const fresh = performance.now() - mountedAt.current < 1500;
    const at = shownKey.current ? pub.photos.findIndex((p) => frameKey(p) === shownKey.current) : -1;
    if (at >= 0 && (touched.current || !fresh)) setIndex(at);
    else if (!touched.current) setIndex(openingFrame(pub.photos));
  }, [pub.photos]);
  const [playing, setPlaying] = useState(false);
  /** The sharp source that has finished loading, if it is the one on screen. */
  const [sharp, setSharp] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; i: number } | null>(null);
  const scrubbing = useRef(false);

  const clamp = (i: number) => Math.min(Math.max(i, 0), count - 1);
  const current = pub.photos[clamp(index)]!;
  shownKey.current = frameKey(current);
  // The stage is 380px tall, so it takes the mid size; the strip takes the
  // smallest. Bundled frames have no mid size — their `file` is already a local
  // 720px render, which serves the stage fine.
  const stageSrc = (p: FrameThumb) => asset(p.view ?? p.file);
  // The sharp size, for a frame the reader has stopped on. The mid size is
  // 500px (MSL) or 800px (M20) against a 618px stage that doubles on a retina
  // screen, so on its own it reads as soft.
  const sharpSrc = (p: FrameThumb) => asset(p.full);

  // Evenly spaced sample of the sequence, always including first and last: at a
  // couple of hundred frames every thumbnail is under 2px and costs a request.
  const stripFrames = useMemo(() => {
    if (count <= STRIP_MAX) return pub.photos.map((p, i) => ({ p, i }));
    return Array.from({ length: STRIP_MAX }, (_, k) => {
      const i = Math.round((k * (count - 1)) / (STRIP_MAX - 1));
      return { p: pub.photos[i]!, i };
    });
  }, [pub, count]);
  const activeThumb = stripFrames.reduce(
    (best, s, k) => (Math.abs(s.i - clamp(index)) < Math.abs(stripFrames[best]!.i - clamp(index)) ? k : best),
    0,
  );

  // Preload a window around the current frame so scrubbing stays smooth without
  // racing the whole sequence against the image actually on screen.
  useEffect(() => {
    const here = clamp(index);
    for (let i = Math.max(0, here - 5); i <= Math.min(count - 1, here + 5); i++) {
      const p = pub.photos[i];
      if (p) { const im = new Image(); im.src = stageSrc(p); }
    }
  }, [pub, index, count]);

  // Motion doesn't need detail; a still does. The stage keeps the light mid
  // size while the sequence plays or the reader scrubs — `current` changes on
  // every step, so this timer keeps resetting and nothing heavy is fetched —
  // and once they settle on a frame the sharp one is loaded off-screen and
  // swapped in already decoded, so the picture resolves rather than staying
  // soft. It is the same file the full-screen viewer opens, so that is warm too.
  useEffect(() => {
    if (playing) return;
    const want = sharpSrc(current);
    if (want === stageSrc(current)) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { if (!cancelled) setSharp(want); };
      im.src = want;
    }, 180);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [current, playing]);

  useEffect(() => {
    if (!playing || count < 2) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), 110);
    return () => window.clearInterval(t);
  }, [playing, count]);

  const scrub = (clientX: number) => {
    const el = strip.current;
    if (!el || count < 2) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + el.scrollLeft;
    setIndex(clamp(Math.round((x / el.scrollWidth) * (count - 1))));
  };
  // Gate the drag on our own flag rather than pointer capture: capture can be
  // refused and scrubbing would go silently dead.
  const onStripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setPlaying(false);
    touched.current = true;
    scrubbing.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    scrub(e.clientX);
  };
  const onStripMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) scrub(e.clientX);
  };
  const endScrub = () => { scrubbing.current = false; };

  const onStageDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setPlaying(false);
    touched.current = true;
    drag.current = { x: e.clientX, i: clamp(index) };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
  };
  const onStageMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setIndex(clamp(d.i + Math.round((d.x - e.clientX) / 26)));
  };
  const onStageUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d && Math.abs(e.clientX - d.x) < 5) onOpenList(pub.photos, clamp(index), pub.craftName, pub.owlt);
  };

  return (
    <article className="post">
      <header className="post-head">
        <Avatar craftId={pub.craftId} name={pub.craftName} />
        <div className="post-who">
          <span className="post-craft">{pub.craftName}</span>
          <span className="post-loc">{pub.location}</span>
        </div>
        <span className="post-when">arrived {sinceLabel(pub.arrivalMs, now)}</span>
      </header>

      <div
        className="pub-stage"
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={onStageUp}
        style={{ backgroundImage: `url(${asset(current.file)})` }}
      >
        <img
          className="pub-img"
          src={sharp === sharpSrc(current) ? sharp : stageSrc(current)}
          alt={`${pub.craftName}, ${current.instrument}`}
          draggable={false}
          decoding="async"
          /* The frame on screen must win the connection pool. Every image on the
             page comes from one host, and a post fires up to 40 strip requests,
             so without this the picture the reader is looking at queues behind
             its own filmstrip and the stage stays black. */
          {...({ fetchpriority: first ? 'high' : 'auto' } as object)}
          onError={(e) => {
            // A dropped frame leaves the stage blank; give it one retry.
            const el = e.currentTarget;
            if (el.dataset.retried) return;
            el.dataset.retried = '1';
            const src = el.src;
            window.setTimeout(() => { el.src = src; }, 600);
          }}
        />
        {count > 1 && (
          <>
            <span className="pub-count">{index + 1}/{count}</span>
            <button
              className="pub-play"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { touched.current = true; setPlaying((p) => !p); }}
              aria-label={playing ? 'Pause sequence' : 'Play sequence'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div
          className="pub-strip"
          ref={strip}
          onPointerDown={onStripDown}
          onPointerMove={onStripMove}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onPointerLeave={endScrub}
        >
          {stripFrames.map(({ p, i }, k) => (
            <span key={`${p.file}-${i}`} className={`pub-thumb${k === activeThumb ? ' is-on' : ''}`}>
              <img src={asset(p.file)} alt="" loading="lazy" decoding="async" {...({ fetchpriority: 'low' } as object)} draggable={false} />
            </span>
          ))}
        </div>
      )}

      <div className="post-foot">
        <div className="post-caption">
          {pub.sol != null ? `Sol ${pub.sol} · ` : ''}{cameraName(current.instrument)}
          {count > 1 && <span className="post-of"> · {count.toLocaleString()} frames</span>}
        </div>
        {pub.lightLine && (
          <div className="post-light" title="How long this light took to reach Earth">
            <span className="post-light-l">Light-time</span>
            {pub.lightLine}
          </div>
        )}
      </div>
    </article>
  );
}
