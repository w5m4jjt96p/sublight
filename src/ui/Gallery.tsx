// The gallery — "the wall of arriving light". Every live frame the fleet has
// sent, grouped into a block per craft. Within a block the photos run by the
// moment their light reached Earth (capture time + light-travel delay), newest
// arrival first; the blocks themselves are ordered by their freshest arrival.
// The age is the point: none of it is happening now.
import { useMemo, useState } from 'react';
import type { FramesData, ArchiveData } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { registry } from '../data/registry.ts';
import { fmtSince, fmtDuration } from '../data/format.ts';
import { owltAt } from '../data/lightTime.ts';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;
const craftById = new Map(registry.map((c) => [c.id, c]));

interface BlockPhoto {
  key: string;
  index: number; // position in frames.recent, for the lightbox (-1 for archive stills)
  file: string;
  caption: string;
  arrivalMs: number;
  isArchive: boolean;
}

interface CraftBlock {
  craftId: string;
  craftName: string;
  location: string;
  lightLine: string | null;
  newestArrivalMs: number;
  photos: BlockPhoto[];
}

interface GalleryProps {
  frames: FramesData;
  archive: ArchiveData;
  model: MapModel | null;
  generatedAt: string | null;
  now: number;
  onOpen: (craftId: string, index: number) => void;
  onOpenArchive: (craftId: string) => void;
  onOpenStory: (craftId: string, startSol: number) => void;
  onBack: () => void;
}

/** Circular craft avatar; falls back to a monogram if the image is missing. */
function Avatar({ craftId, name }: { craftId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="ga-avatar ga-avatar-mono">{name.charAt(0)}</div>;
  }
  return (
    <img
      className="ga-avatar"
      src={asset(`/avatars/${craftId}.jpg`)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function Gallery({ frames, archive, model, generatedAt, now, onOpen, onOpenArchive, onOpenStory, onBack }: GalleryProps) {
  // Craft with a live per-sol firehose (the Mars rovers): a captured sol number
  // is the tell. Each opens a full-screen "story" of all its raw frames.
  const stories = useMemo(() => {
    return Object.entries(frames)
      .filter(([, f]) => f.sol != null)
      .map(([id, f]) => ({ id, name: craftById.get(id)?.name ?? id, sol: f.sol as number }));
  }, [frames]);

  // One block per craft; photos ordered by arrival (capture + light-time),
  // newest first; blocks ordered by their freshest arrival.
  const blocks = useMemo(() => {
    const out: CraftBlock[] = [];
    for (const c of model?.craft ?? []) {
      const id = c.entry.id;
      const owlt = generatedAt ? (owltAt(c.eph, generatedAt, now) ?? 0) : 0;
      const lightLine = owlt > 0 ? `Its light took ${fmtDuration(owlt)} to cross the void` : null;
      const f = frames[id];
      if (f) {
        const list = f.recent?.length
          ? f.recent
          : [{ file: f.file, instrument: f.instrument, capturedUtc: f.capturedUtc, sol: f.sol }];
        const photos: BlockPhoto[] = list.map((t, index) => ({
          key: `${id}-${index}`,
          index,
          file: t.file,
          caption: t.sol != null ? `Sol ${t.sol} · ${t.instrument}` : t.instrument,
          arrivalMs: (Date.parse(t.capturedUtc) || 0) + owlt * 1000,
          isArchive: false,
        }));
        photos.sort((a, b) => b.arrivalMs - a.arrivalMs);
        out.push({
          craftId: id, craftName: c.entry.name, location: c.entry.location, lightLine,
          newestArrivalMs: photos[0]?.arrivalMs ?? -Infinity, photos,
        });
      } else if (archive[id]) {
        out.push({
          craftId: id, craftName: c.entry.name, location: c.entry.location, lightLine,
          newestArrivalMs: -Infinity,
          photos: [{ key: `${id}-arch`, index: -1, file: archive[id]!.file, caption: archive[id]!.title, arrivalMs: -Infinity, isArchive: true }],
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

        {/* Stories rail — tap a rover to browse its full live stream */}
        {stories.length > 0 && (
          <div className="stories-rail">
            {stories.map((s) => (
              <button key={s.id} className="story-ring" onClick={() => onOpenStory(s.id, s.sol)}
                aria-label={`Open ${s.name} story — all raw frames`}>
                <span className="story-ring-img">
                  <Avatar craftId={s.id} name={s.name} />
                </span>
                <span className="story-ring-name">{s.name}</span>
              </button>
            ))}
          </div>
        )}

        {blocks.map((b) => (
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
              {b.photos.map((p) => (
                <button
                  key={p.key}
                  className="cb-tile"
                  onClick={() => (p.isArchive ? onOpenArchive(b.craftId) : onOpen(b.craftId, p.index))}
                  aria-label={`${b.craftName} — ${p.caption}`}
                >
                  <img src={asset(p.file)} alt={`${b.craftName} — ${p.caption}`} loading="lazy" />
                  <div className="cb-tile-meta">
                    <span className="cb-cap">{p.caption}</span>
                    <span className="cb-arr">
                      {p.isArchive ? 'mission archive' : `arrived ${fmtSince(new Date(p.arrivalMs).toISOString(), now)} ago`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}

        {blocks.length === 0 && <p className="gallery-lede">No frames available right now.</p>}
      </div>
    </div>
  );
}
