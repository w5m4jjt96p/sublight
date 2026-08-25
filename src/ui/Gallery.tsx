// The gallery — "the wall of arriving light". Every live frame the fleet has
// sent, newest first, each stamped with how old its light already is. Not a
// generic photo grid: the age is the point.
import { useMemo } from 'react';
import type { FramesData } from '../types.ts';
import { registry } from '../data/registry.ts';
import { fmtSince } from '../data/format.ts';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;
const nameById = new Map(registry.map((c) => [c.id, c.name]));

interface Tile {
  craftId: string;
  craftName: string;
  index: number; // position within that craft's recent[]
  file: string;
  instrument: string;
  capturedUtc: string;
}

interface GalleryProps {
  frames: FramesData;
  now: number;
  onOpen: (craftId: string, index: number) => void;
  onBack: () => void;
}

export function Gallery({ frames, now, onOpen, onBack }: GalleryProps) {
  const tiles = useMemo(() => {
    const out: Tile[] = [];
    for (const [craftId, f] of Object.entries(frames)) {
      const list = f.recent?.length ? f.recent : [f];
      list.forEach((t, index) => {
        out.push({
          craftId,
          craftName: nameById.get(craftId) ?? craftId,
          index,
          file: t.file,
          instrument: t.instrument,
          capturedUtc: t.capturedUtc,
        });
      });
    }
    // freshest light first
    return out.sort((a, b) => Date.parse(b.capturedUtc) - Date.parse(a.capturedUtc));
  }, [frames]);

  const oldest = tiles.length ? tiles[tiles.length - 1] : null;

  return (
    <div className="gallery-overlay">
      <div className="gallery">
        <a
          className="back"
          href="#map"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ← Back to the map
        </a>
        <h1>The wall of arriving light</h1>
        <p className="gallery-lede">
          Every frame the fleet has sent home, newest first. None of it is happening now; each
          image left its camera hours or days ago and is only just here.
          {oldest && (
            <>
              {' '}
              The oldest light on this wall left {oldest.craftName} {fmtSince(oldest.capturedUtc, now)}{' '}
              ago.
            </>
          )}
        </p>

        <div className="gallery-grid">
          {tiles.map((t) => (
            <button
              key={`${t.craftId}-${t.index}`}
              className="gallery-tile"
              onClick={() => onOpen(t.craftId, t.index)}
              aria-label={`${t.craftName}, ${t.instrument}, light ${fmtSince(t.capturedUtc, now)} old`}
            >
              <img src={asset(t.file)} alt={`${t.craftName} — ${t.instrument}`} loading="lazy" />
              <div className="gallery-tile-meta">
                <span className="gallery-craft">{t.craftName}</span>
                <span className="gallery-age">left {fmtSince(t.capturedUtc, now)} ago</span>
              </div>
            </button>
          ))}
        </div>
        {tiles.length === 0 && <p className="gallery-lede">No frames available right now.</p>}
      </div>
    </div>
  );
}
