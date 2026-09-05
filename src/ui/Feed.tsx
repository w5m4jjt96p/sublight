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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FramesData, FrameThumb } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { fetchSolImages, fetchLatestFrames } from '../data/roverImages.ts';
import { fmtSince, fmtDuration } from '../data/format.ts';
import { owltAt } from '../data/lightTime.ts';
import { Avatar } from './Avatar.tsx';

const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`);
// Some feeds (mars2020) omit the timezone; those times are UTC, so append Z
// instead of letting Date.parse read them as local time.
const capMs = (utc: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(utc) ? utc : `${utc}Z`) || 0;

const PAGE = 3;       // publications revealed per step
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
        lightLine: owlt > 0 ? `Its light took ${fmtDuration(owlt)} to cross the void` : null,
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

  // Live-first, in two steps per rover: the newest published frames land first,
  // then that sol is pulled whole — a publication must be complete before the
  // reader can scroll past it, or loading older would grow it in place.
  const roverIds = useMemo(
    () => Object.entries(frames).filter(([, f]) => f.sol != null).map(([id]) => id),
    [frames],
  );
  useEffect(() => {
    if (!roverIds.length) return;
    let cancelled = false;
    for (const id of roverIds) {
      (async () => {
        try {
          const fresh = await fetchLatestFrames(id, 48);
          if (cancelled || !fresh.length) return;
          setByCraft((prev) => ({ ...prev, [id]: fresh }));
          const top = fresh.reduce((mx, f) => Math.max(mx, f.sol ?? 0), 0);
          if (!top) return;
          const full = await fetchSolImages(id, top, 600);
          if (cancelled || !full.frames.length) return;
          setByCraft((prev) => ({ ...prev, [id]: full.frames }));
          cursors.current[id] = { nextSol: top - 1, topSolComplete: true, done: false };
        } catch {
          /* offline or feed down: keep the bundled frames */
        }
      })();
    }
    return () => { cancelled = true; };
  }, [roverIds]);

  // Flatten the fleet, sort by arrival, then fold each craft's sol into one post.
  const pubs = useMemo(() => {
    const flat: { f: FrameThumb; craftId: string; arr: number }[] = [];
    for (const [id, list] of Object.entries(byCraft)) {
      const m = meta[id];
      if (!m) continue;
      for (const f of list) flat.push({ f, craftId: id, arr: capMs(f.capturedUtc) + m.owlt * 1000 });
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
      return {
        key, craftId: b.craftId, craftName: m.name, location: m.location,
        owlt: m.owlt, lightLine: m.lightLine,
        sol: b.photos[0]!.sol ?? null, arrivalMs: b.arr, photos: b.photos,
      } as Publication;
    });
  }, [byCraft, meta]);

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

  return (
    <div className="feed">
      {shown.map((pub) => (
        <PublicationCard key={pub.key} pub={pub} now={now} onOpenList={onOpenList} />
      ))}
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
  pub, now, onOpenList,
}: {
  pub: Publication;
  now: number;
  onOpenList: (frames: FrameThumb[], index: number, craftName: string, owlt: number) => void;
}) {
  const count = pub.photos.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; i: number } | null>(null);
  const scrubbing = useRef(false);

  const clamp = (i: number) => Math.min(Math.max(i, 0), count - 1);
  const current = pub.photos[clamp(index)]!;

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
      if (p) { const im = new Image(); im.src = asset(p.file); }
    }
  }, [pub, index, count]);

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
        <span className="post-when">arrived {fmtSince(new Date(pub.arrivalMs).toISOString(), now)} ago</span>
      </header>

      <div
        className="pub-stage"
        onPointerDown={onStageDown}
        onPointerMove={onStageMove}
        onPointerUp={onStageUp}
        onPointerCancel={onStageUp}
      >
        <img
          className="pub-img"
          src={asset(current.file)}
          alt={`${pub.craftName} — ${current.instrument}`}
          draggable={false}
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
              onClick={() => setPlaying((p) => !p)}
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
              <img src={asset(p.file)} alt="" loading="lazy" decoding="async" draggable={false} />
            </span>
          ))}
        </div>
      )}

      <div className="post-foot">
        <div className="post-caption">
          {pub.sol != null ? `Sol ${pub.sol.toLocaleString()} · ` : ''}{current.instrument.replace(/_/g, ' ')}
          {count > 1 && <span className="post-of"> · {count.toLocaleString()} frames</span>}
        </div>
        {pub.lightLine && <div className="post-light">↗ {pub.lightLine}</div>}
      </div>
    </article>
  );
}
