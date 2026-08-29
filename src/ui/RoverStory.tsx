// A rover "story": the full firehose of a rover's raw frames, full-screen and
// swipeable like an Instagram story. The bundled gallery shows only a curated
// handful; here we live-fetch a whole sol at a time (all of it, thumbnails
// filtered) straight from mars.nasa.gov, and when the viewer reaches the end we
// load the previous sol — so the entire archive is reachable, newest first.
// Every frame still carries the honest twist: the light is already hours old.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameThumb } from '../types.ts';
import { fetchSolImages } from '../data/roverImages.ts';
import { fmtDuration, fmtSince } from '../data/format.ts';

interface RoverStoryProps {
  roverId: string;
  roverName: string;
  avatarSrc: string;
  location: string;
  startSol: number;
  owltSeconds: number;
  now: number;
  onClose: () => void;
}

const STORY_LIMIT = 600; // fetch a whole sol at once (a busy sol tops ~550 frames)
const SOL_FLOOR = 0;

export function RoverStory({
  roverId, roverName, avatarSrc, location, startSol, owltSeconds, now, onClose,
}: RoverStoryProps) {
  const [frames, setFrames] = useState<FrameThumb[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const nextSol = useRef(startSol);
  const loadingRef = useRef(false);
  const pending = useRef(false); // a "next" tap that ran past the loaded end

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      let sol = nextSol.current;
      let added: FrameThumb[] = [];
      // Descend past the occasional empty sol so a gap never dead-ends the story.
      for (let tries = 0; tries < 8 && sol >= SOL_FLOOR; tries++, sol--) {
        const d = await fetchSolImages(roverId, sol, STORY_LIMIT);
        if (d.frames.length) { added = d.frames; break; }
      }
      nextSol.current = sol - 1;
      if (added.length) setFrames((prev) => [...prev, ...added]);
      if (nextSol.current < SOL_FLOOR || (!added.length && sol < SOL_FLOOR)) setDone(true);
    } catch {
      /* keep what we have; a later advance retries */
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [roverId, done]);

  useEffect(() => { loadMore(); /* first sol */ }, [loadMore]);

  // When a "next" tap outran the loaded frames, resume once more arrive.
  useEffect(() => {
    if (pending.current && frames.length > 0) {
      pending.current = false;
      setIndex((i) => Math.min(i + 1, frames.length - 1));
    }
  }, [frames.length]);

  // Prefetch the next sol a few frames before the end for a seamless advance.
  useEffect(() => {
    if (frames.length && index >= frames.length - 5) loadMore();
  }, [index, frames.length, loadMore]);

  const advance = useCallback((dir: number) => {
    setIndex((i) => {
      const ni = i + dir;
      if (ni < 0) return 0;
      if (ni >= frames.length) { if (!done) { pending.current = true; loadMore(); } return i; }
      return ni;
    });
  }, [frames.length, done, loadMore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') advance(-1);
      else if (e.key === 'ArrowRight' || e.key === ' ') advance(1);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [advance, onClose]);

  // Preload the neighbouring full images so a tap shows instantly.
  useEffect(() => {
    for (const j of [index + 1, index + 2]) {
      const f = frames[j];
      if (f) { const im = new Image(); im.src = f.full; }
    }
  }, [index, frames]);

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1);
  };

  const frame = frames[index];
  const total = frames.length;

  return (
    <div className="story" role="dialog" aria-modal="true" aria-label={`${roverName} story`}>
      {/* progress + header */}
      <div className="story-top">
        <div className="story-progress">
          <span style={{ width: total ? `${((index + 1) / total) * 100}%` : '0%' }} />
        </div>
        <div className="story-head">
          {avatarFailed
            ? <div className="story-avatar story-avatar-mono">{roverName.charAt(0)}</div>
            : <img className="story-avatar" src={avatarSrc} alt={roverName} onError={() => setAvatarFailed(true)} />}
          <div className="story-who">
            <span className="story-name">{roverName}</span>
            <span className="story-loc">{location}</span>
          </div>
          <button className="story-close" onClick={onClose} aria-label="Close story">✕</button>
        </div>
      </div>

      {/* stage: tap left = back, tap right = forward */}
      <div className="story-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="story-zone story-zone-prev" onClick={() => advance(-1)} aria-label="Previous" />
        <button className="story-zone story-zone-next" onClick={() => advance(1)} aria-label="Next" />
        {frame ? (
          <img
            className="story-img"
            src={frame.full}
            alt={`${roverName} raw frame — ${frame.instrument}${frame.sol != null ? `, sol ${frame.sol}` : ''}`}
            onError={(e) => { const el = e.currentTarget; if (el.src !== frame.file) el.src = frame.file; }}
          />
        ) : (
          <div className="story-msg">{loading ? 'Tuning in to the feed…' : 'No frames catalogued.'}</div>
        )}
        {loading && frame && <div className="story-spinner" aria-hidden />}
      </div>

      {/* caption + the honest twist */}
      {frame && (
        <div className="story-foot">
          <div className="story-caption">
            {frame.sol != null ? `Sol ${frame.sol.toLocaleString()} · ` : ''}{frame.instrument.replace(/_/g, ' ')}
            <span className="story-count"> · {index + 1} of {total.toLocaleString()}{done ? '' : '+'}</span>
          </div>
          {owltSeconds > 0 && (
            <div className="story-light">
              ↗ Its light took {fmtDuration(owltSeconds)} to cross the void
              {frame.capturedUtc ? ` · left ${fmtSince(frame.capturedUtc, now)} ago` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
