import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoverTrack, FrameThumb } from '../types.ts';
import { fetchSolImages, type SolImages } from '../data/roverImages.ts';
import { fmtUtcHm } from '../data/format.ts';

interface TraverseProps {
  track: RoverTrack;
  craftName: string;
  onOpenImages: (frames: FrameThumb[], index: number, credit: string) => void;
  onBack: () => void;
}

// Web-Mercator slippy coords (must match scripts/fetch-mars-tracks.ts).
const wxLon = (lon: number) => (lon + 180) / 360;
const wyLat = (lat: number) =>
  0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);

interface Sel { lon: number; lat: number; sol: number }

export function Traverse({ track, craftName, onOpenImages, onBack }: TraverseProps) {
  const { w, h, frame: fr } = track;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [t, setT] = useState({ x: 0, y: 0, s: 1 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const [sel, setSel] = useState<Sel | null>(null);
  const [sol, setSol] = useState<SolImages | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const px = (lon: number) => ((wxLon(lon) - fr.wxWest) / (fr.wxEast - fr.wxWest)) * w;
  const py = (lat: number) => ((wyLat(lat) - fr.wyNorth) / (fr.wySouth - fr.wyNorth)) * h;

  const fitScale = vp.w && vp.h ? Math.min(vp.w / w, vp.h / h) : 1;
  const minS = fitScale * 0.9;
  const maxS = Math.max(fitScale * 8, 3);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setVp({ w: r.width, h: r.height }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!vp.w || !vp.h) return;
    const s = Math.min(vp.w / w, vp.h / h);
    setT({ x: (vp.w - w * s) / 2, y: (vp.h - h * s) / 2, s });
  }, [vp.w, vp.h, w, h]);

  const pathPoints = useMemo(
    () => track.waypoints.map((p) => `${px(p.lon).toFixed(1)},${py(p.lat).toFixed(1)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track],
  );
  const sparse = useMemo(() => track.waypoints.filter((_, i) => i % 10 === 0), [track]);

  const start = track.waypoints[0];
  const cur = track.current;
  const region = track.id === 'curiosity' ? 'Gale Crater' : 'Jezero Crater';

  const r = (screenPx: number) => screenPx / t.s;
  const fs = (screenPx: number) => screenPx / t.s;

  // Load a sol's images when a drive stop is picked.
  function pick(wp: Sel) {
    setSel(wp);
    setSol(null);
    setError(false);
    setLoading(true);
    fetchSolImages(track.id, wp.sol)
      .then((d) => { setSol(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }

  // Pan / zoom / tap.
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    setT((prev) => ({ ...prev, x: drag.current!.tx + dx, y: drag.current!.ty + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return; // was a drag, not a tap
    const rect = viewportRef.current!.getBoundingClientRect();
    const ix = (e.clientX - rect.left - t.x) / t.s;
    const iy = (e.clientY - rect.top - t.y) / t.s;
    let best: Sel | null = null;
    let bd = Infinity;
    for (const wp of track.waypoints) {
      if (wp.sol == null) continue;
      const dx = px(wp.lon) - ix, dy = py(wp.lat) - iy;
      const dist = dx * dx + dy * dy;
      if (dist < bd) { bd = dist; best = { lon: wp.lon, lat: wp.lat, sol: wp.sol }; }
    }
    // Only select if the tap landed near the path (in screen pixels).
    if (best && Math.sqrt(bd) * t.s < 46) pick(best);
    else { setSel(null); setSol(null); }
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    setT((prev) => {
      const s = Math.min(maxS, Math.max(minS, prev.s * factor));
      const k = s / prev.s;
      return { s, x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k };
    });
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };
  const zoomButton = (factor: number) => zoomAt(vp.w / 2, vp.h / 2, factor);

  const metersPerScreenPx = track.metersPerPixel / t.s;
  const targetM = 120 * metersPerScreenPx;
  const niceM = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].reduce((a, b) =>
    Math.abs(b - targetM) < Math.abs(a - targetM) ? b : a, 100);
  const barPx = niceM / metersPerScreenPx;
  const barLabel = niceM >= 1000 ? `${niceM / 1000} km` : `${niceM} m`;

  return (
    <div className="traverse">
      <header className="traverse-bar">
        <button className="back" onClick={onBack}>← Back</button>
        <div className="traverse-title">
          <span className="tv-name">{craftName}</span>
          <span className="tv-sub">Surface traverse · {region}, in real coordinates</span>
        </div>
        <div className="traverse-stats">
          {track.distanceKm != null && <div><b>{track.distanceKm.toFixed(1)} km</b><span>driven</span></div>}
          {track.solLast != null && <div><b>{track.solLast.toLocaleString()}</b><span>sols</span></div>}
          <div><b>{track.waypoints.length}</b><span>stops</span></div>
        </div>
      </header>

      <div
        className={`traverse-viewport${sel ? ' has-sol' : ''}`}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { drag.current = null; }}
        onWheel={onWheel}
      >
        <div className="traverse-world" style={{ width: w, height: h, transform: `translate(${t.x}px,${t.y}px) scale(${t.s})` }}>
          <img src={track.image} width={w} height={h} alt={`${craftName} traverse basemap`} draggable={false} />
          <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="traverse-svg">
            <polyline points={pathPoints} className="tv-path-halo" vectorEffect="non-scaling-stroke" />
            <polyline points={pathPoints} className="tv-path" vectorEffect="non-scaling-stroke" />

            {sparse.map((p, i) => (
              <circle key={i} cx={px(p.lon)} cy={py(p.lat)} r={r(1.6)} className="tv-wp" />
            ))}

            {start && (
              <g>
                <circle cx={px(start.lon)} cy={py(start.lat)} r={r(5)} className="tv-land" />
                <text x={px(start.lon)} y={py(start.lat) - r(9)} fontSize={fs(11)} className="tv-label" textAnchor="middle">Landing</text>
              </g>
            )}

            {/* selected drive stop */}
            {sel && (
              <g>
                <circle cx={px(sel.lon)} cy={py(sel.lat)} r={r(8)} className="tv-sel-ring" vectorEffect="non-scaling-stroke" />
                <circle cx={px(sel.lon)} cy={py(sel.lat)} r={r(3)} className="tv-sel-dot" />
              </g>
            )}

            {/* current position */}
            <g>
              <circle cx={px(cur.lon)} cy={py(cur.lat)} r={r(11)} className="tv-cur-pulse" />
              <circle cx={px(cur.lon)} cy={py(cur.lat)} r={r(5)} className="tv-cur" />
              <text x={px(cur.lon)} y={py(cur.lat) - r(14)} fontSize={fs(12)} className="tv-label tv-label-cur" textAnchor="middle">
                {craftName}{cur.sol != null ? ` · sol ${cur.sol.toLocaleString()}` : ''}
              </text>
            </g>
          </svg>
        </div>

        <div className="traverse-controls" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <button onClick={() => zoomButton(1 / 1.5)} aria-label="Zoom out">−</button>
          <button onClick={() => zoomButton(1.5)} aria-label="Zoom in">+</button>
        </div>

        <div className="traverse-scale">
          <div className="tv-scalebar" style={{ width: `${barPx}px` }} />
          <span>{barLabel}</span>
        </div>

        <div className="traverse-legend">
          <span><i className="lg-path" />Drive path</span>
          <span><i className="lg-cur" />Now</span>
          <span className="lg-hint">Tap the path for that sol's photos</span>
        </div>

        <div className="traverse-credit">Basemap: HiRISE / CTX · NASA / JPL-Caltech / UArizona · positions from JPL localisation</div>

        {sel && (
          <div className="sol-panel" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
            <div className="sol-panel-head">
              <div>
                <b>Sol {sel.sol.toLocaleString()}</b>
                <span>
                  {loading ? 'loading frames…'
                    : error ? 'could not load frames'
                      : sol ? `${sol.count.toLocaleString()} raw frame${sol.count === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              {sol && sol.count > 0 && (
                <a className="sol-all" href={sol.more} target="_blank" rel="noreferrer">See all {sol.count.toLocaleString()} ↗</a>
              )}
              <button className="sol-close" onClick={() => { setSel(null); setSol(null); }} aria-label="Close">✕</button>
            </div>
            <div className="sol-strip">
              {loading && <div className="sol-msg">Fetching this sol's raw images…</div>}
              {error && <div className="sol-msg">The image feed didn't respond. Try again in a moment.</div>}
              {!loading && !error && sol && sol.frames.length === 0 && (
                <div className="sol-msg">No public raw frames catalogued for this sol.</div>
              )}
              {sol && sol.frames.map((f, i) => (
                <button key={f.file + i} className="sol-thumb" onClick={() => onOpenImages(sol.frames, i, 'NASA/JPL-Caltech')}
                  title={`${f.instrument.replace(/_/g, ' ')}${f.capturedUtc ? ` · ${fmtUtcHm(f.capturedUtc)} UTC` : ''}`}>
                  <img src={f.file} alt={`${craftName} raw frame, ${f.instrument}, sol ${f.sol}`} loading="lazy" />
                  <span>{f.instrument.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
