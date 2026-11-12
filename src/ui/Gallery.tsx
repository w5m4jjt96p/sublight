// The home of the product: open the site and this is what you see. One
// chronological stream for the whole fleet: publications from different craft
// interleave by when their light reached Earth, newest first, each carrying its
// author. The photo comes first, so the thesis is one line and not an essay; the
// post itself carries the rest ("arrived 2h ago", "its light took 4m"). Retired
// craft have no live arrival and would sink out of a dated feed forever, so they
// get their own shelf at the end.
import type { FramesData, ArchiveData, FrameThumb } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { Feed } from './Feed.tsx';
import { Avatar } from './Avatar.tsx';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

interface GalleryProps {
  hidden: boolean;
  frames: FramesData;
  archive: ArchiveData;
  model: MapModel | null;
  generatedAt: string | null;
  now: number;
  onOpenArchive: (craftId: string) => void;
  onOpenList: (frames: FrameThumb[], index: number, craftName: string, owlt: number) => void;
}

export function Gallery({ hidden, frames, archive, model, generatedAt, now, onOpenArchive, onOpenList }: GalleryProps) {
  const archiveCraft = (model?.craft ?? []).filter((c) => !frames[c.entry.id] && archive[c.entry.id]);

  return (
    <div className="gallery-overlay" hidden={hidden}>
      <div className="gallery">
        <h1 className="gallery-lede">Just arrived from Mars. <span>None of it is happening now.</span></h1>

        <Feed frames={frames} model={model} generatedAt={generatedAt} now={now} onOpenList={onOpenList} />

        {archiveCraft.length > 0 && (
          <section className="archive-shelf">
            <h2>From the mission archives</h2>
            <div className="shelf">
              {archiveCraft.map((c) => {
                const a = archive[c.entry.id]!;
                return (
                  <button key={c.entry.id} className="shelf-item" onClick={() => onOpenArchive(c.entry.id)}>
                    <img src={asset(a.file)} alt={`${c.entry.name}, ${a.title}`} loading="lazy" />
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
