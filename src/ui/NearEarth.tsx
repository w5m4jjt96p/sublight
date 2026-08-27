// Near-Earth view — a geocentric, log-radial "radar" of a curated set of
// satellites, propagated live in the browser (src/data/orbits.ts). The point is
// the other end of the light-time ladder: the ISS is ~1.4 ms away, GEO ~0.12 s,
// the Moon ~1.3 s — against Voyager's 23 hours on the deep map.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SatelliteRecord } from '../types.ts';
import { propagate, perigeeAltitude, R_EARTH, type OrbitState } from '../data/orbits.ts';
import { PAL } from '../map/palette.ts';
import { fmtLight, fmtKm } from '../data/format.ts';

const MOON_MEAN_KM = 384_400; // nominal mean distance, labelled as such
const GEO_KM = 42_164;
const C_KM_S = 299_792.458;

// Log-radial screen mapping: surface (R_EARTH) at the disc edge, out to a hair
// beyond GEO. LEO naturally hugs Earth — that thin dense shell is the truth.
const DENOM = Math.log10((GEO_KM * 1.18) / R_EARTH);
function rNorm(rKm: number): number {
  return Math.min(1.06, Math.max(0, Math.log10(rKm / R_EARTH) / DENOM));
}

const BAND_COLOR: Record<string, string> = {
  LEO: PAL.signal,
  MEO: '#7FB9C8',
  GEO: '#9AA6B8',
  HEO: '#C6A2D8',
};

interface NearEarthProps {
  satellites: SatelliteRecord[];
  onBack: () => void;
  onGoDeep: () => void;
}

export function NearEarth({ satellites, onBack, onGoDeep }: NearEarthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Live orbit state of the selected object, refreshed each second for the panel.
  const [selState, setSelState] = useState<OrbitState | null>(null);

  const byId = useMemo(() => new Map(satellites.map((s) => [s.norad, s])), [satellites]);
  const selSat = selected != null ? byId.get(selected) ?? null : null;
  const heroes = useMemo(() => satellites.filter((s) => s.group === 'hero'), [satellites]);

  // Lowest-perigee objects: the decay watch (feature 3), computed from the same
  // mean elements, sorted by how close their perigee already is to the surface.
  const decayWatch = useMemo(
    () =>
      [...satellites]
        .map((s) => ({ s, perigee: perigeeAltitude(s) }))
        .filter((d) => d.perigee < 400 && d.perigee > 0)
        .sort((a, b) => a.perigee - b.perigee)
        .slice(0, 6),
    [satellites],
  );

  // Live panel numbers for the selected object.
  useEffect(() => {
    if (!selSat) {
      setSelState(null);
      return;
    }
    const tick = () => setSelState(propagate(selSat, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [selSat]);

  // Canvas render loop + picking. Screen positions are recomputed here and
  // cached in a ref so a click can hit-test against exactly what is drawn.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = 0;
    const screen = new Map<number, { x: number; y: number; band: string }>();

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return; // ~30fps is plenty
      last = t;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) / 2 - 46;
      const innerR = 24; // Earth disc radius = the surface
      const toScreenR = (rKm: number) => innerR + rNorm(rKm) * (maxR - innerR);

      // Reference rings: LEO edge, GPS/MEO, GEO, and the off-scale Moon.
      const rings: Array<{ rKm: number; label: string; lt: string; dash?: boolean }> = [
        { rKm: R_EARTH + 2000, label: 'LEO', lt: fmtLight(2000 / C_KM_S) },
        { rKm: 26_560, label: 'MEO · GPS', lt: fmtLight((26_560 - R_EARTH) / C_KM_S) },
        { rKm: GEO_KM, label: 'GEO', lt: fmtLight((GEO_KM - R_EARTH) / C_KM_S) },
      ];
      ctx.textAlign = 'left';
      for (const ring of rings) {
        const sr = toScreenR(ring.rKm);
        ctx.beginPath();
        ctx.arc(cx, cy, sr, 0, Math.PI * 2);
        ctx.strokeStyle = PAL.faint;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.fillStyle = PAL.dim;
        ctx.fillText(ring.label, cx + 6, cy - sr - 5);
        ctx.fillStyle = PAL.delay; // light-time values are amber
        ctx.fillText(ring.lt, cx + 6 + ctx.measureText(ring.label).width + 8, cy - sr - 5);
      }

      // Earth disc.
      const grd = ctx.createRadialGradient(cx - innerR * 0.4, cy - innerR * 0.4, 1, cx, cy, innerR);
      grd.addColorStop(0, '#3E5A78');
      grd.addColorStop(1, '#16283C');
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Satellites, propagated to now.
      const now = Date.now();
      screen.clear();
      for (const s of satellites) {
        const st = propagate(s, now);
        const ang = Math.atan2(st.y, st.x);
        const sr = toScreenR(st.r);
        const x = cx + Math.cos(ang) * sr;
        const y = cy + Math.sin(ang) * sr;
        screen.set(s.norad, { x, y, band: s.band });
        const isHero = s.group === 'hero';
        const isSel = s.norad === selected;
        ctx.beginPath();
        ctx.arc(x, y, isSel ? 4.5 : isHero ? 3 : 1.9, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? PAL.txt : BAND_COLOR[s.band] ?? PAL.signal;
        ctx.globalAlpha = isSel || isHero ? 1 : 0.72;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (isSel) {
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.strokeStyle = PAL.signal;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        if (isSel) {
          // Only the selected object is labelled — the LEO shell is far too
          // dense for permanent labels to be legible.
          ctx.font = '10px "Roboto Mono", monospace';
          ctx.fillStyle = PAL.txt;
          ctx.textAlign = 'left';
          ctx.fillText(s.name, x + 12, y + 3);
        }
      }

      // Moon reference (off-scale, pinned just inside the rim), light-time amber.
      const moonR = maxR + 20;
      const mx = cx + Math.cos(-0.6) * moonR;
      const my = cy + Math.sin(-0.6) * moonR;
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = PAL.dim;
      ctx.fill();
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = PAL.dim;
      ctx.fillText('Moon · not to scale', mx - 8, my - 2);
      ctx.fillStyle = PAL.delay;
      ctx.fillText(`${fmtLight(MOON_MEAN_KM / C_KM_S)} (mean)`, mx - 8, my + 11);
    };

    raf = requestAnimationFrame(draw);

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      let best: number | null = null;
      let bestD = 15 * 15;
      for (const [norad, p] of screen) {
        const d = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d < bestD) {
          bestD = d;
          best = norad;
        }
      }
      setSelected(best);
    };
    canvas.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('click', onClick);
    };
  }, [satellites, selected]);

  const empty = satellites.length === 0;

  return (
    <div className="nearearth">
      <div className="ne-bar">
        <button className="back" onClick={onBack}>
          ← Back
        </button>
        <div className="ne-title">
          <span className="ne-name">Near-Earth</span>
          <span className="ne-sub">{satellites.length} objects · live orbits · tap a dot</span>
        </div>
        <button className="ne-deep" onClick={onGoDeep}>
          Deep fleet →
        </button>
      </div>

      <div className="ne-body">
        <div className="ne-viewport" ref={wrapRef}>
          <canvas ref={canvasRef} />
          {empty && <div className="ne-empty">No satellite data loaded.</div>}
        </div>

        <aside className="ne-panel">
          {selSat && selState ? (
            <div className="ne-detail">
              <div className="ne-detail-name">{selSat.name}</div>
              <div className="ne-detail-sub">
                NORAD {selSat.norad} · {selSat.band}
                {selSat.group !== 'hero' ? ` · ${selSat.group}` : ''}
              </div>
              <dl className="ne-stats">
                <div className="ne-lt">
                  <dt>Light-time to the ground below</dt>
                  <dd>{fmtLight(selState.lightSeconds)}</dd>
                </div>
                <div>
                  <dt>Altitude</dt>
                  <dd>{fmtKm(selState.altitude)}</dd>
                </div>
                <div>
                  <dt>Orbital speed</dt>
                  <dd>{selState.speed.toFixed(2)} km/s</dd>
                </div>
                <div>
                  <dt>Period</dt>
                  <dd>{selState.periodMin.toFixed(1)} min</dd>
                </div>
              </dl>
              {selSat.note && <p className="ne-note">{selSat.note}</p>}
              <button className="ne-clear" onClick={() => setSelected(null)}>
                Clear selection
              </button>
            </div>
          ) : (
            <div className="ne-intro">
              <p>
                A curated slice of the objects circling Earth, their positions propagated live from
                today's orbital elements. Tap any dot for its numbers.
              </p>
              {heroes.length > 0 && (
                <div className="ne-heroes">
                  {heroes.map((h) => (
                    <button key={h.norad} onClick={() => setSelected(h.norad)}>
                      {h.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="ne-ladder-lead">The near end of the light-time ladder:</p>
              <ul className="ne-ladder">
                <li>
                  <span>ISS · LEO</span>
                  <b>{fmtLight(420 / C_KM_S)}</b>
                </li>
                <li>
                  <span>GPS · MEO</span>
                  <b>{fmtLight((26_560 - R_EARTH) / C_KM_S)}</b>
                </li>
                <li>
                  <span>GEO</span>
                  <b>{fmtLight((GEO_KM - R_EARTH) / C_KM_S)}</b>
                </li>
                <li>
                  <span>Moon (mean)</span>
                  <b>{fmtLight(MOON_MEAN_KM / C_KM_S)}</b>
                </li>
                <li className="ne-ladder-deep" onClick={onGoDeep}>
                  <span>Voyager 1 →</span>
                  <b>~23 h</b>
                </li>
              </ul>
            </div>
          )}

          {decayWatch.length > 0 && (
            <div className="ne-decay">
              <h3>Decay watch</h3>
              <p className="ne-decay-lead">Lowest perigees in the set, closest to re-entry.</p>
              <ul>
                {decayWatch.map(({ s, perigee }) => (
                  <li key={s.norad} onClick={() => setSelected(s.norad)}>
                    <span>{s.name}</span>
                    <b>{Math.round(perigee)} km</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
