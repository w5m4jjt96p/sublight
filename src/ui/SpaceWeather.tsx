// A small live space-weather readout for the map. Ties to the Sun, which the
// map already centres. Data is measured (NOAA SWPC) or a dash — never invented.
import { useState } from 'react';
import type { SpaceWeather as SW } from '../types.ts';
import { stormLabel } from '../data/spaceWeather.ts';
import { EMDASH } from '../data/format.ts';

export function SpaceWeather({ w }: { w: SW | null }) {
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const { text, level } = stormLabel(w);
  const dot = level >= 3 ? 'sw-hot' : level >= 1 ? 'sw-warm' : 'sw-calm';

  return (
    <button
      className={`spaceweather ${open ? 'open' : ''}`}
      onClick={() => setOpen((v) => !v)}
      aria-label="Space weather"
      title="Space weather (NOAA SWPC)"
    >
      <span className="sw-head">
        <span className={`sw-dot ${dot}`} />
        <span className="sw-title">{text}</span>
        <span className="sw-kp">Kp {w.kp != null ? w.kp.toFixed(1).replace(/\.0$/, '') : EMDASH}</span>
      </span>
      {open && (
        <span className="sw-grid">
          <span>
            <b>G{w.gScale ?? 0}</b>
            <i>storm</i>
          </span>
          <span>
            <b>{w.windSpeed != null ? Math.round(w.windSpeed) : EMDASH}</b>
            <i>km/s wind</i>
          </span>
          <span>
            <b>{w.bz != null ? `${w.bz > 0 ? '+' : ''}${w.bz}` : EMDASH}</b>
            <i>nT Bz</i>
          </span>
          <span>
            <b>R{w.rScale ?? 0}·S{w.sScale ?? 0}</b>
            <i>blackout · radiation</i>
          </span>
        </span>
      )}
    </button>
  );
}
