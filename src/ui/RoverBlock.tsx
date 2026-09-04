// One craft's section on the wall. Its frames are folded into publications —
// everything from the same sol is one swipeable post, the way the rover
// actually works: it doesn't post 48 times a day, it posts a day of looking
// around. Publications reveal a page at a time as you scroll, and "Load older
// photos" pulls the next sol from the archive when you reach the end.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FrameThumb } from '../types.ts';
import { fetchSolImages, fetchLatestFrames } from '../data/roverImages.ts';
import { fmtSince } from '../data/format.ts';

const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`);
// Some feeds (mars2020) omit the timezone; those times are UTC, so append Z
// instead of letting Date.parse read them as local time.
const capMs = (utc: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(utc) ? utc : `${utc}Z`) || 0;
const byArrivalDesc = (a: FrameThumb, b: FrameThumb) => capMs(b.capturedUtc) - capMs(a.capturedUtc);

const PAGE = 3; // publications revealed per step

interface Publication {
  key: string;
  sol: number | null;
  newestMs: number;
  photos: FrameThumb[];
}

/** Fold frames (newest first) into one publication per sol. */
function intoPublications(frames: FrameThumb[]): Publication[] {
  const buckets = new Map<string, FrameThumb[]>();
  const order: string[] = [];
  for (const f of frames) {
    // The sol is the rover's own day, and grouping on it keeps a single batch
    // from being split in two by an arbitrary UTC midnight. Craft without a sol
    // (EPIC) fall back to the calendar day.
    const key = f.sol != null ? `sol${f.sol}` : new Date(capMs(f.capturedUtc)).toISOString().slice(0, 10);
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(f);
  }
  return order.map((key) => {
    const photos = buckets.get(key)!;
    return { key, sol: photos[0]!.sol ?? null, newestMs: capMs(photos[0]!.capturedUtc), photos };
  });
}

interface RoverBlockProps {
  craftId: string;
  craftName: string;
  location: string;
  owlt: number;
  lightLine: string | null;
  isLive: boolean;
  latestSol: number | null;
  initial: FrameThumb[];
  now: number;
  avatar: ReactNode;
  onOpenList: (frames: FrameThumb[], index: number, craftName: string, owlt: number) => void;
}

export function RoverBlock({
  craftId, craftName, location, owlt, lightLine, isLive, latestSol, initial, now, avatar, onOpenList,
}: RoverBlockProps) {
  const [buffer, setBuffer] = useState<FrameThumb[]>(initial);
  const [visible, setVisible] = useState(PAGE);
  const [topSol, setTopSol] = useState(latestSol);
  const [nextSol, setNextSol] = useState(latestSol ?? 0);
  const [fetchedLatest, setFetchedLatest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const pubs = useMemo(() => intoPublications(buffer), [buffer]);

  // Live-first: the bundled snapshot is only as fresh as the last data refresh
  // and NASA publishes in bursts all day, so on open we swap in the frames it
  // has published most recently. The bundle stays the instant/offline paint.
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    fetchLatestFrames(craftId, 48)
      .then((fresh) => {
        if (cancelled || !fresh.length) return;
        setBuffer(fresh.slice().sort(byArrivalDesc));
        setTopSol(fresh.reduce((m, f) => Math.max(m, f.sol ?? 0), 0) || latestSol);
      })
      .catch(() => { /* offline or feed down: keep the bundled frames */ });
    return () => { cancelled = true; };
  }, [craftId, isLive, latestSol]);

  // Reveal more publications as the end scrolls into view — bounded by what's
  // loaded, so the section never grows past it and the next craft stays reachable.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisible((v) => Math.min(v + PAGE, pubs.length));
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [pubs.length]);

  async function loadOlder() {
    if (loading || done || !isLive || topSol == null) return;
    setLoading(true);
    try {
      // Page back from the newest sol we've actually seen (live), not the one
      // the bundled snapshot happened to capture.
      let sol = fetchedLatest ? nextSol : topSol;
      let added: FrameThumb[] = [];
      // Descend past the occasional empty sol so a gap never dead-ends the feed.
      for (let tries = 0; tries < 8 && sol >= 0; tries++, sol--) {
        const d = await fetchSolImages(craftId, sol, 600);
        if (d.frames.length) { added = d.frames; break; }
      }
      // The first pull completes the newest sol; the rest append the previous one.
      setBuffer((prev) => [...(fetchedLatest ? prev : []), ...added].sort(byArrivalDesc));
      setFetchedLatest(true);
      setNextSol(sol - 1);
      if (sol - 1 < 0) setDone(true);
      setVisible((v) => v + PAGE);
    } catch {
      /* keep what we have; a later tap retries */
    } finally {
      setLoading(false);
    }
  }

  const arrivedAgo = (utc: string) => fmtSince(new Date(capMs(utc) + owlt * 1000).toISOString(), now);
  const shown = pubs.slice(0, visible);

  return (
    <section className="craft-block">
      <header className="cb-head">
        {avatar}
        <div className="cb-who">
          <span className="cb-name">{craftName}</span>
          <span className="cb-loc">{location}</span>
        </div>
        {lightLine && <span className="cb-light">↗ {lightLine}</span>}
      </header>

      <div className="cb-feed">
        {shown.map((pub) => (
          <PublicationCard
            key={pub.key}
            pub={pub}
            craftName={craftName}
            owlt={owlt}
            arrivedAgo={arrivedAgo}
            onOpenList={onOpenList}
          />
        ))}
        <div ref={sentinel} className="cb-sentinel" aria-hidden />
      </div>

      {(visible < pubs.length || (isLive && !done)) && (
        <button
          className="cb-more"
          onClick={() => (visible < pubs.length ? setVisible((v) => v + PAGE) : loadOlder())}
          disabled={loading}
        >
          {loading ? 'Loading…' : visible < pubs.length ? 'Load more' : 'Load older photos'}
        </button>
      )}
    </section>
  );
}

/**
 * One sol as a filmstrip. These frames are usually a real sequence — EPIC
 * watching the Earth turn through a day, a rover camera sweeping a scene — so
 * the frame is swapped in place with no transition at all: run through them and
 * they read as motion, the way a flipbook does. Scrub the thumbnail strip to
 * move fast, or hit play to let it run.
 */
function PublicationCard({
  pub, craftName, owlt, arrivedAgo, onOpenList,
}: {
  pub: Publication;
  craftName: string;
  owlt: number;
  arrivedAgo: (utc: string) => string;
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

  // Preload a window around the current frame so scrubbing stays smooth. Doing
  // the *whole* sequence up front meant every visible publication fired all its
  // frames at once — over a hundred full-size JPEGs racing the one image you're
  // actually looking at, which is enough to leave the stage blank on a slow link.
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

  // Scrub: map the pointer's position along the strip straight to a frame.
  const scrub = (clientX: number) => {
    const el = strip.current;
    if (!el || count < 2) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + el.scrollLeft;
    setIndex(clamp(Math.round((x / el.scrollWidth) * (count - 1))));
  };
  // Gate the drag on our own flag rather than pointer capture: capture can be
  // refused (synthetic pointers, some browsers) and scrubbing would go dead.
  const onStripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setPlaying(false);
    scrubbing.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    scrub(e.clientX);
  };
  const onStripMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    scrub(e.clientX);
  };
  const endScrub = () => { scrubbing.current = false; };

  // Dragging across the photo itself scrubs too; a tap opens the viewer.
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
    if (d && Math.abs(e.clientX - d.x) < 5) onOpenList(pub.photos, clamp(index), craftName, owlt);
  };

  return (
    <article className="pub">
      <header className="pub-head">
        <span className="pub-sol">
          {pub.sol != null
            ? `Sol ${pub.sol.toLocaleString()}`
            : new Date(pub.newestMs).toISOString().slice(0, 10)}
        </span>
        <span className="pub-when">arrived {arrivedAgo(current.capturedUtc)} ago</span>
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
          alt={`${craftName} — ${current.instrument}`}
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
          {pub.photos.map((p, i) => (
            <span key={`${p.file}-${i}`} className={`pub-thumb${i === clamp(index) ? ' is-on' : ''}`}>
              <img src={asset(p.file)} alt="" loading="lazy" decoding="async" draggable={false} />
            </span>
          ))}
        </div>
      )}

      <div className="pub-foot">
        <span className="pub-cap">{current.instrument.replace(/_/g, ' ')}</span>
        {count > 1 && <span className="pub-of">{count.toLocaleString()} frames</span>}
      </div>
    </article>
  );
}
