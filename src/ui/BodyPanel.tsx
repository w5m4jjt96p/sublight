import { useEffect, useRef } from 'react';
import { BODIES } from '../data/bodies.ts';

const asset = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

export interface BodyPhoto {
  file: string;
  full: string;
  sourceUrl: string;
  title: string;
  credit: string;
  /** True for the live SDO Sun / DSCOVR Earth images. */
  live: boolean;
}

interface BodyPanelProps {
  bodyId: string;
  photo: BodyPhoto | null;
  onOpenPhoto: () => void;
  onClose: () => void;
}

export function BodyPanel({ bodyId, photo, onOpenPhoto, onClose }: BodyPanelProps) {
  const info = BODIES[bodyId];

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!info) return null;

  return (
    <aside className="detail" aria-label={`${info.name} details`}>
      <div className="detail-head">
        <div>
          <div className="detail-name">{info.name}</div>
          <div className="detail-sub">{info.kind}</div>
        </div>
        <button className="detail-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {photo && (
        <div>
          <button
            className="detail-hero"
            onClick={onOpenPhoto}
            aria-label={`View ${info.name} image full screen`}
          >
            <img src={asset(photo.file)} alt={`${info.name} — ${photo.title}`} />
            <span className="detail-hero-cap">
              <span>{photo.live ? 'Latest · NASA' : 'NASA archive'}</span>
              <span aria-hidden="true">⤢</span>
            </span>
          </button>
          <div className="detail-hero-foot">
            <span>{photo.title}</span>
          </div>
          <div className="thumb-credit">{photo.credit}</div>
        </div>
      )}

      <p className="detail-note">{info.blurb}</p>

      <div className="detail-grid">
        {info.facts.map((f) => (
          <div key={f.label}>
            <div className="stat-l">{f.label}</div>
            <div className="v">{f.value}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
