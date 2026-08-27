// Deep Sky — the far end of the light-time ladder. A curated set of galaxies
// and nebulae, each captioned not by where it is but by how old its light is.
// Ordered by distance, so scrolling down is travelling back through time.
import { useState } from 'react';
import type { DeepSkyObject } from '../types.ts';
import { fmtLightYears } from '../data/format.ts';

interface DeepSkyProps {
  objects: DeepSkyObject[];
  onBack: () => void;
}

export function DeepSky({ objects, onBack }: DeepSkyProps) {
  const [open, setOpen] = useState<DeepSkyObject | null>(null);
  const sorted = [...objects].sort((a, b) => a.distanceLy - b.distanceLy);
  const base = import.meta.env.BASE_URL;

  return (
    <div className="deepsky-overlay">
      <div className="deepsky">
        <button className="back" onClick={onBack}>← Back to the map</button>
        <h1>Nothing here is new.</h1>
        <p className="deepsky-lede">
          Beyond the fleet, the light-time stops being minutes and starts being millennia. Every
          object below is labelled by the age of the light reaching you now. The farthest set out
          when the universe was young.
        </p>

        <div className="deepsky-list">
          {sorted.map((o) => (
            <button key={o.id} className="ds-card" onClick={() => setOpen(o)}>
              <div className="ds-img">
                <img src={`${base}${o.file.replace(/^\//, '')}`} alt={o.name} loading="lazy" />
              </div>
              <div className="ds-meta">
                <div className="ds-top">
                  <span className="ds-name">{o.name}</span>
                  <span className="ds-cat">{o.catalog}</span>
                </div>
                <div className="ds-lt">{fmtLightYears(o.distanceLy)} old</div>
                <p className="ds-note">{o.note}</p>
                <div className="ds-credit">{o.credit}</div>
              </div>
            </button>
          ))}
          {sorted.length === 0 && <p className="ds-empty">Deep-sky imagery is still loading.</p>}
        </div>
      </div>

      {open && (
        <div className="ds-viewer" onClick={() => setOpen(null)}>
          <img src={`${base}${open.full.replace(/^\//, '')}`} alt={open.name} onClick={(e) => e.stopPropagation()} />
          <div className="ds-viewer-meta" onClick={(e) => e.stopPropagation()}>
            <div className="ds-viewer-name">{open.name} <span>{open.catalog}</span></div>
            <div className="ds-viewer-lt">Its light is {fmtLightYears(open.distanceLy)} old</div>
            <p>{open.note}</p>
            <div className="ds-viewer-credit">
              {open.credit} ·{' '}
              <a href={open.sourceUrl} target="_blank" rel="noreferrer">view original</a>
            </div>
          </div>
          <button className="ds-viewer-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
        </div>
      )}
    </div>
  );
}
