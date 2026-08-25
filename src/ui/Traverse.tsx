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
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinched = useRef(false);
  const tapId = useRef<number | null>(null);
  const tapStart = useRef({ x: 0, y: 0 });

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
    const contain = Math.min(vp.w / w, vp.h / h);
    const cover = Math.max(vp.w / w, vp.h / h);
    // On phones, fill the screen and let the user pan, instead of a thin
    // letterboxed strip. Cap so it isn't over-zoomed on square-ish crops.
    const s = vp.w < 560 ? Math.min(cover, contain * 4) : contain;
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

  // Keep the image from being panned off-screen (at least `m` px stay visible),
  // so a stray touch can never make it "disappear".
  const clampXY = (x: number, y: number, s: number) => {
    if (!vp.w || !vp.h) return { x, y };
    const iw = w * s, ih = h * s;
    const mx = Math.min(90, vp.w * 0.5), my = Math.min(90, vp.h * 0.5);
    return {
      x: Math.max(Math.min(x, vp.w - mx), mx - iw),
      y: Math.max(Math.min(y, vp.h - my), my - ih),
    };
  };

  // Pan (1 finger) / pinch-zoom (2 fingers) / tap-to-select.
  const onPointerDown = (e: React.PointerEvent) => {
    try { viewportRef.current?.setPointerCapture?.(e.pointerId); } catch { /* not an active pointer */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      pinched.current = false;
      tapId.current = e.pointerId;
      tapStart.current = { x: e.clientX, y: e.clientY };
    } else {
      tapId.current = null; // multi-touch is never a tap
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pts = pointers.current;
    if (!pts.has(e.pointerId)) return;
    const rect = viewportRef.current!.getBoundingClientRect();

    if (pts.size >= 2) {
      const before = [...pts.values()];
      const oldMidX = (before[0]!.x + before[1]!.x) / 2, oldMidY = (before[0]!.y + before[1]!.y) / 2;
      const oldDist = Math.hypot(before[0]!.x - before[1]!.x, before[0]!.y - before[1]!.y);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = [...pts.values()];
      const newMidX = (after[0]!.x + after[1]!.x) / 2, newMidY = (after[0]!.y + after[1]!.y) / 2;
      const newDist = Math.hypot(after[0]!.x - after[1]!.x, after[0]!.y - after[1]!.y);
      const cx = newMidX - rect.left, cy = newMidY - rect.top;
      const ratio = oldDist > 0 ? newDist / oldDist : 1;
      pinched.current = true;
      setT((p) => {
        const s = Math.min(maxS, Math.max(minS, p.s * ratio));
        const k = s / p.s;
        const x = cx - (cx - p.x) * k + (newMidX - oldMidX);
        const y = cy - (cy - p.y) * k + (newMidY - oldMidY);
        const c = clampXY(x, y, s);
        return { s, x: c.x, y: c.y };
      });
      return;
    }

    const old = pts.get(e.pointerId)!;
    const dx = e.clientX - old.x, dy = e.clientY - old.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setT((p) => {
      const c = clampXY(p.x + dx, p.y + dy, p.s);
      return { ...p, x: c.x, y: c.y };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    // A tap is a single pointer that barely moved (tolerant of finger jitter).
    const near = Math.hypot(e.clientX - tapStart.current.x, e.clientY - tapStart.current.y) < 8;
    const wasTap = pointers.current.size === 1 && tapId.current === e.pointerId && !pinched.current && near;
    pointers.current.delete(e.pointerId);
    if (viewportRef.current?.hasPointerCapture?.(e.pointerId)) {
      viewportRef.current.releasePointerCapture(e.pointerId);
    }
    if (!wasTap) return;
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
    if (best && Math.sqrt(bd) * t.s < 46) pick(best);
    else { setSel(null); setSol(null); }
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    setT((prev) => {
      const s = Math.min(maxS, Math.max(minS, prev.s * factor));
      const k = s / prev.s;
      const c = clampXY(cx - (cx - prev.x) * k, cy - (cy - prev.y) * k, s);
      return { s, x: c.x, y: c.y };
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
        onPointerCancel={onPointerUp}
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
