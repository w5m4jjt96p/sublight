// One craft's block on the wall. It opens with the bundled recent frames (fast,
// offline), then — this is the point of Sublight — lets you pull the entire
// archive: "Show all photos" loads the full latest sol live from mars.nasa.gov,
// and each further tap pages back a sol, appending. Everything stays ordered by
// when its light reached Earth (capture + light-time), newest arrival first.
import { useState, type ReactNode } from 'react';
import type { FrameThumb } from '../types.ts';
import { fetchSolImages } from '../data/roverImages.ts';
import { fmtSince } from '../data/format.ts';

const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`);
// Some feeds (mars2020) omit the timezone; those times are UTC, so append Z
// instead of letting Date.parse read them as local time.
const capMs = (utc: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(utc) ? utc : `${utc}Z`) || 0;
const byArrivalDesc = (a: FrameThumb, b: FrameThumb) => capMs(b.capturedUtc) - capMs(a.capturedUtc);

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
  const [live, setLive] = useState<FrameThumb[] | null>(null);
  const [nextSol, setNextSol] = useState(latestSol ?? 0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const photos = live ?? initial;

  async function loadMore() {
    if (loading || done || latestSol == null) return;
    setLoading(true);
    try {
      let sol = live === null ? latestSol : nextSol;
      let added: FrameThumb[] = [];
      // Descend past the occasional empty sol so a gap never dead-ends the block.
      for (let tries = 0; tries < 8 && sol >= 0; tries++, sol--) {
        const d = await fetchSolImages(craftId, sol, 600);
        if (d.frames.length) { added = d.frames; break; }
      }
      const merged = (live === null ? added : [...live, ...added]).sort(byArrivalDesc);
      setLive(merged);
      setNextSol(sol - 1);
      if (sol - 1 < 0) setDone(true);
    } catch {
      /* keep what we have; a later tap retries */
    } finally {
      setLoading(false);
    }
  }

  const arrivedAgo = (utc: string) => fmtSince(new Date(capMs(utc) + owlt * 1000).toISOString(), now);

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
      <div className="cb-grid">
        {photos.map((p, i) => (
          <button
            key={`${p.file}-${i}`}
            className="cb-tile"
            onClick={() => onOpenList(photos, i, craftName, owlt)}
            aria-label={`${craftName} — ${p.instrument}`}
          >
            <img src={asset(p.file)} alt={`${craftName} — ${p.instrument}`} loading="lazy" />
            <div className="cb-tile-meta">
              <span className="cb-cap">{p.sol != null ? `Sol ${p.sol} · ${p.instrument}` : p.instrument}</span>
              <span className="cb-arr">arrived {arrivedAgo(p.capturedUtc)} ago</span>
            </div>
          </button>
        ))}
      </div>
      {isLive && !done && (
        <button className="cb-more" onClick={loadMore} disabled={loading}>
          {loading ? 'Loading…' : live === null ? 'Show all photos' : 'Load earlier sols'}
          {live !== null && !loading && <span className="cb-more-n"> · {photos.length.toLocaleString()} loaded</span>}
        </button>
      )}
    </section>
  );
}
