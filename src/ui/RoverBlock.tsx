// One craft's section on the wall: a vertical feed of posts (one card per
// photo), newest arrival first. Cards reveal a page at a time as you scroll —
// no bulk load — and "Load older photos" pulls the next sol from the archive
// when you reach the end. Every card is stamped with when its light arrived.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FrameThumb } from '../types.ts';
import { fetchSolImages, fetchLatestFrames } from '../data/roverImages.ts';
import { fmtSince } from '../data/format.ts';

const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`);
// Some feeds (mars2020) omit the timezone; those times are UTC, so append Z
// instead of letting Date.parse read them as local time.
const capMs = (utc: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(utc) ? utc : `${utc}Z`) || 0;
const byArrivalDesc = (a: FrameThumb, b: FrameThumb) => capMs(b.capturedUtc) - capMs(a.capturedUtc);

const PAGE = 8;

interface RoverBlockProps {
  craftId: string;
  craftName: string;
  location: string;
  owlt: number;
  lightLine: string | null;
  isLive: boolean; // a rover with a per-sol feed we can page back through
  latestSol: number | null;
  initial: FrameThumb[]; // bundled recent frames, already arrival-sorted
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

  // Reveal more of what's already loaded as the end scrolls into view — bounded
  // by the buffer, so the section never grows on its own past what's fetched
  // (and the next craft below stays reachable).
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisible((v) => Math.min(v + PAGE, buffer.length));
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [buffer.length]);

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
      // The first pull swaps the bundled recent for the complete latest sol; the
      // rest append the previous sol.
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
  const shown = buffer.slice(0, visible);

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
        {shown.map((p, i) => (
          <article key={`${p.file}-${i}`} className="cbf-post">
            <button className="cbf-photo" onClick={() => onOpenList(buffer, i, craftName, owlt)} aria-label={`${craftName} — ${p.instrument}`}>
              <img src={asset(p.file)} alt={`${craftName} — ${p.instrument}`} loading="lazy" />
            </button>
            <div className="cbf-meta">
              <span className="cbf-cap">{p.sol != null ? `Sol ${p.sol} · ${p.instrument}` : p.instrument}</span>
              <span className="cbf-arr">arrived {arrivedAgo(p.capturedUtc)} ago</span>
            </div>
          </article>
        ))}
        <div ref={sentinel} className="cb-sentinel" aria-hidden />
      </div>

      {(visible < buffer.length || (isLive && !done)) && (
        <button
          className="cb-more"
          onClick={() => (visible < buffer.length ? setVisible((v) => v + PAGE) : loadOlder())}
          disabled={loading}
        >
          {loading ? 'Loading…' : visible < buffer.length ? 'Load more' : 'Load older photos'}
        </button>
      )}
    </section>
  );
}
