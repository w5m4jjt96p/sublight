// The gallery — "the wall of arriving light". Every live frame the fleet has
// sent, newest first, each stamped with how old its light already is. On desktop
// it's a grid; on mobile it becomes a social feed (the craft is the author, its
// location the place, the capture time the posted time, the light-travel delay
// the honest twist). The age is the point either way.
import { useMemo, useState } from 'react';
import type { FramesData, ArchiveData } from '../types.ts';
import type { MapModel } from '../map/model.ts';
import { registry } from '../data/registry.ts';
import { fmtSince, fmtDuration } from '../data/format.ts';
import { owltAt } from '../data/lightTime.ts';
import { RoverStory } from './RoverStory.tsx';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;
const craftById = new Map(registry.map((c) => [c.id, c]));

interface Tile {
  craftId: string;
  craftName: string;
  index: number;
  file: string;
  instrument: string;
  capturedUtc: string;
}

interface FeedPost {
  key: string;
  craftId: string;
  craftName: string;
  location: string;
  file: string;
  caption: string;
  timeAgo: string;
  lightLine: string | null;
  lightSeconds: number;
  seq: number;
  open: () => void;
}

interface GalleryProps {
  frames: FramesData;
  archive: ArchiveData;
  model: MapModel | null;
  generatedAt: string | null;
  now: number;
  onOpen: (craftId: string, index: number) => void;
  onOpenArchive: (craftId: string) => void;
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

export function Gallery({ frames, archive, model, generatedAt, now, onOpen, onOpenArchive, onBack }: GalleryProps) {
  const [storyId, setStoryId] = useState<string | null>(null);

  // Craft with a live per-sol firehose (the Mars rovers): a captured sol number
  // is the tell. Each opens a full-screen "story" of all its raw frames.
  const stories = useMemo(() => {
    const byId = new Map((model?.craft ?? []).map((c) => [c.entry.id, c]));
    return Object.entries(frames)
      .filter(([, f]) => f.sol != null)
      .map(([id, f]) => {
        const c = byId.get(id);
        const owlt = c && generatedAt ? owltAt(c.eph, generatedAt, now) : 0;
        return {
          id,
          name: c?.entry.name ?? craftById.get(id)?.name ?? id,
          location: c?.entry.location ?? craftById.get(id)?.location ?? '',
          sol: f.sol as number,
          owlt: owlt ?? 0,
        };
      });
  }, [frames, model, generatedAt, now]);
  const story = stories.find((s) => s.id === storyId) ?? null;

  // Grid tiles (desktop), newest light first.
  const tiles = useMemo(() => {
    const out: Tile[] = [];
    for (const [craftId, f] of Object.entries(frames)) {
      const list = f.recent?.length ? f.recent : [f];
      list.forEach((t, index) => {
        out.push({
          craftId,
          craftName: craftById.get(craftId)?.name ?? craftId,
          index,
          file: t.file,
          instrument: t.instrument,
          capturedUtc: t.capturedUtc,
        });
      });
    }
    return out.sort((a, b) => Date.parse(b.capturedUtc) - Date.parse(a.capturedUtc));
  }, [frames]);

  const oldest = tiles.length ? tiles[tiles.length - 1] : null;

  // Feed posts (mobile): frames + archive stills, interleaved craft by craft.
  const feed = useMemo(() => {
    const out: FeedPost[] = [];
    let seq = 0;
    for (const c of model?.craft ?? []) {
      const id = c.entry.id;
      const owlt = generatedAt ? owltAt(c.eph, generatedAt, now) : 0;
      const light = owlt > 0 ? `Its light took ${fmtDuration(owlt)} to cross the void` : null;
      const f = frames[id];
      if (f) {
        const list = f.recent?.length ? f.recent : [{ file: f.file, instrument: f.instrument, capturedUtc: f.capturedUtc, sol: f.sol }];
        list.forEach((t, index) => {
          out.push({
            key: `${id}-${index}`, craftId: id, craftName: c.entry.name, location: c.entry.location,
            file: t.file, caption: t.sol != null ? `Sol ${t.sol} · ${t.instrument}` : t.instrument,
            timeAgo: fmtSince(t.capturedUtc, now), lightLine: light, lightSeconds: owlt ?? 0,
            seq: seq++, open: () => onOpen(id, index),
          });
        });
      } else if (archive[id]) {
        out.push({
          key: `${id}-arch`, craftId: id, craftName: c.entry.name, location: c.entry.location,
          file: archive[id]!.file, caption: archive[id]!.title, timeAgo: 'mission archive',
          lightLine: light, lightSeconds: owlt ?? 0, seq: seq++, open: () => onOpenArchive(id),
        });
      }
    }
    // By the age of the arriving light: most distant / oldest light first
    // (Voyager down to DSCOVR). Within a craft, keep the curated round-robin
    // order from frames.json (varied cameras) rather than re-grouping by time.
    return out.sort((a, b) => (b.lightSeconds - a.lightSeconds) || (a.seq - b.seq));
  }, [frames, archive, model, generatedAt, now, onOpen, onOpenArchive]);

  return (
    <div className="gallery-overlay">
      <div className="gallery">
        <a className="back" href="#map" onClick={(e) => { e.preventDefault(); onBack(); }}>
          ← Back to the map
        </a>
        <h1>The wall of arriving light</h1>
        <p className="gallery-lede">
          Every frame the fleet has sent home, newest first. None of it is happening now; each
          image left its camera hours or days ago and is only just here.
          {oldest && (
            <> The oldest light on this wall left {oldest.craftName} {fmtSince(oldest.capturedUtc, now)} ago.</>
          )}
        </p>

        {/* Stories rail — tap a rover to browse its full live stream */}
        {stories.length > 0 && (
          <div className="stories-rail">
            {stories.map((s) => (
              <button key={s.id} className="story-ring" onClick={() => setStoryId(s.id)}
                aria-label={`Open ${s.name} story — all raw frames`}>
                <span className="story-ring-img">
                  <Avatar craftId={s.id} name={s.name} />
                </span>
                <span className="story-ring-name">{s.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Desktop grid */}
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

        {/* Mobile feed */}
        <div className="gallery-feed">
          {feed.map((p) => (
            <article key={p.key} className="ga-post">
              <header className="ga-head">
                <Avatar craftId={p.craftId} name={p.craftName} />
                <div className="ga-who">
                  <span className="ga-name">{p.craftName}</span>
                  <span className="ga-loc">{p.location}</span>
                </div>
                <span className="ga-time">{p.timeAgo}</span>
              </header>
              <button className="ga-photo" onClick={p.open} aria-label={`${p.craftName} — ${p.caption}`}>
                <img src={asset(p.file)} alt={`${p.craftName} — ${p.caption}`} loading="lazy" />
              </button>
              <div className="ga-foot">
                <div className="ga-caption">{p.caption}</div>
                {p.lightLine && <div className="ga-light">↗ {p.lightLine}</div>}
              </div>
            </article>
          ))}
        </div>

        {tiles.length === 0 && feed.length === 0 && <p className="gallery-lede">No frames available right now.</p>}
      </div>

      {story && (
        <RoverStory
          roverId={story.id}
          roverName={story.name}
          avatarSrc={asset(`/avatars/${story.id}.jpg`)}
          location={story.location}
          startSol={story.sol}
          owltSeconds={story.owlt}
          now={now}
          onClose={() => setStoryId(null)}
        />
      )}
    </div>
  );
}
