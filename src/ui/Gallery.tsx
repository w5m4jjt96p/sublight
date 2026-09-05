// The gallery — "the wall of arriving light". One chronological stream for the
// whole fleet: publications from different craft interleave by when their light
// reached Earth, newest first, each carrying its author. Retired craft have no
// live arrival and would sink out of a dated feed forever, so they get their own
// shelf at the end.
import type { FramesData, ArchiveData, FrameThumb } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { fmtSince } from '../data/format.ts';
import { Feed } from './Feed.tsx';
import { Avatar } from './Avatar.tsx';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

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

export function Gallery({ frames, archive, model, generatedAt, now, onOpenArchive, onOpenList, onBack }: GalleryProps) {
  const archiveCraft = (model?.craft ?? []).filter((c) => !frames[c.entry.id] && archive[c.entry.id]);

  // The freshest arrival across the fleet, for the lede.
  let freshest: { name: string; ms: number } | null = null;
  for (const c of model?.craft ?? []) {
    const f = frames[c.entry.id];
    if (!f?.capturedUtc) continue;
    const ms = Date.parse(f.capturedUtc) || 0;
    if (ms && (!freshest || ms > freshest.ms)) freshest = { name: c.entry.name, ms };
  }

  return (
    <div className="gallery-overlay">
      <div className="gallery">
        <a className="back" href="#map" onClick={(e) => { e.preventDefault(); onBack(); }}>
          ← Back to the map
        </a>
        <h1>The wall of arriving light</h1>
        <p className="gallery-lede">
          Every frame the fleet has sent home, in one stream ordered by when its light actually
          reached Earth — most recent arrivals first. None of it is happening now.
          {freshest && (
            <> The freshest light here reached us from {freshest.name} {fmtSince(new Date(freshest.ms).toISOString(), now)} ago.</>
          )}
        </p>

        <Feed frames={frames} model={model} generatedAt={generatedAt} now={now} onOpenList={onOpenList} />

        {archiveCraft.length > 0 && (
          <section className="archive-shelf">
            <h2>From the mission archives</h2>
            <div className="shelf">
              {archiveCraft.map((c) => {
                const a = archive[c.entry.id]!;
                return (
                  <button key={c.entry.id} className="shelf-item" onClick={() => onOpenArchive(c.entry.id)}>
                    <img src={asset(a.file)} alt={`${c.entry.name} — ${a.title}`} loading="lazy" />
                    <span className="shelf-craft">
                      <Avatar craftId={c.entry.id} name={c.entry.name} />
                      {c.entry.name}
                    </span>
                    <span className="shelf-title">{a.title}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
