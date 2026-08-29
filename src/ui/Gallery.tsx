// The gallery — "the wall of arriving light". One block per craft, ordered by
// when its light reached Earth (capture + light-travel delay), newest arrival
// first. Each rover block can pull its entire archive, sol by sol, not just the
// day's frames — that reach is the point of Sublight.
import { useMemo } from 'react';
import type { FramesData, ArchiveData, FrameThumb } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { fmtSince, fmtDuration } from '../data/format.ts';
import { owltAt } from '../data/lightTime.ts';
import { RoverBlock } from './RoverBlock.tsx';
import { Avatar } from './Avatar.tsx';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

interface Block {
  craftId: string;
  craftName: string;
  location: string;
  owlt: number;
  lightLine: string | null;
  newestArrivalMs: number;
  kind: 'frames' | 'archive';
  isLive: boolean;
  latestSol: number | null;
  initial: FrameThumb[];
  archiveFile?: string;
  archiveTitle?: string;
}

interface GalleryProps {
  frames: FramesData;
  archive: ArchiveData;
  model: MapModel | null;
  generatedAt: string | null;
  now: number;
  onOpenArchive: (craftId: string) => void;
  onOpenList: (frames: FrameThumb[], index: number, craftName: string, owlt: number) => void;
  onBack: () => void;
}

const byArrivalDesc = (a: FrameThumb, b: FrameThumb) => (Date.parse(b.capturedUtc) || 0) - (Date.parse(a.capturedUtc) || 0);

export function Gallery({ frames, archive, model, generatedAt, now, onOpenArchive, onOpenList, onBack }: GalleryProps) {
  // One block per craft; live frames ordered by arrival, blocks by freshest.
  const blocks = useMemo(() => {
    const out: Block[] = [];
    for (const c of model?.craft ?? []) {
      const id = c.entry.id;
      const owlt = generatedAt ? (owltAt(c.eph, generatedAt, now) ?? 0) : 0;
      const lightLine = owlt > 0 ? `Its light took ${fmtDuration(owlt)} to cross the void` : null;
      const f = frames[id];
      if (f) {
        const initial = (f.recent?.length
          ? [...f.recent]
          : [{ file: f.file, full: f.full, sourceUrl: f.sourceUrl, instrument: f.instrument, capturedUtc: f.capturedUtc, sol: f.sol }]
        ).sort(byArrivalDesc);
        const newest = initial[0] ? (Date.parse(initial[0].capturedUtc) || 0) + owlt * 1000 : -Infinity;
        out.push({
          craftId: id, craftName: c.entry.name, location: c.entry.location, owlt, lightLine,
          newestArrivalMs: newest, kind: 'frames', isLive: f.sol != null, latestSol: f.sol ?? null, initial,
        });
      } else if (archive[id]) {
        out.push({
          craftId: id, craftName: c.entry.name, location: c.entry.location, owlt, lightLine,
          newestArrivalMs: -Infinity, kind: 'archive', isLive: false, latestSol: null, initial: [],
          archiveFile: archive[id]!.file, archiveTitle: archive[id]!.title,
        });
      }
    }
    return out.sort((a, b) => b.newestArrivalMs - a.newestArrivalMs);
  }, [frames, archive, model, generatedAt, now]);

  const freshest = blocks.find((b) => b.newestArrivalMs > 0);

  return (
    <div className="gallery-overlay">
      <div className="gallery">
        <a className="back" href="#map" onClick={(e) => { e.preventDefault(); onBack(); }}>
          ← Back to the map
        </a>
        <h1>The wall of arriving light</h1>
        <p className="gallery-lede">
          Every frame the fleet has sent home, one block per craft, ordered by when its light
          actually reached Earth — most recent arrivals first. None of it is happening now.
          {freshest && (
            <> The freshest light here reached us from {freshest.craftName} {fmtSince(new Date(freshest.newestArrivalMs).toISOString(), now)} ago.</>
          )}
        </p>

        {blocks.map((b) =>
          b.kind === 'archive' ? (
            <section className="craft-block" key={b.craftId}>
              <header className="cb-head">
                <Avatar craftId={b.craftId} name={b.craftName} />
                <div className="cb-who">
                  <span className="cb-name">{b.craftName}</span>
                  <span className="cb-loc">{b.location}</span>
                </div>
                {b.lightLine && <span className="cb-light">↗ {b.lightLine}</span>}
              </header>
              <div className="cb-grid">
                <button className="cb-tile" onClick={() => onOpenArchive(b.craftId)} aria-label={`${b.craftName} — ${b.archiveTitle}`}>
                  <img src={asset(b.archiveFile!)} alt={`${b.craftName} — ${b.archiveTitle}`} loading="lazy" />
                  <div className="cb-tile-meta">
                    <span className="cb-cap">{b.archiveTitle}</span>
                    <span className="cb-arr">mission archive</span>
                  </div>
                </button>
              </div>
            </section>
          ) : (
            <RoverBlock
              key={b.craftId}
              craftId={b.craftId}
              craftName={b.craftName}
              location={b.location}
              owlt={b.owlt}
              lightLine={b.lightLine}
              isLive={b.isLive}
              latestSol={b.latestSol}
              initial={b.initial}
              now={now}
              avatar={<Avatar craftId={b.craftId} name={b.craftName} />}
              onOpenList={onOpenList}
            />
          ),
        )}

        {blocks.length === 0 && <p className="gallery-lede">No frames available right now.</p>}
      </div>
    </div>
  );
}
