// Mars globe — a rotating, textured 3D Mars rendered in pure Canvas 2D
// (orthographic projection of an equirectangular map, no 3D library, no runtime
// dependency), with the rovers and landing sites plotted on the surface. Tapping
// a rover opens its live surface traverse. It carries the thesis: the Mars you
// are looking at is already several light-minutes old.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MARS_SITES, type MarsSite } from '../data/marsSites.ts';
import type { RoverTrack } from '../types.ts';
import { PAL } from '../map/palette.ts';
import { fmtDuration } from '../data/format.ts';

const LON0 = 180; // texture longitude offset: left edge = 180°W (calibrated)
const DEG = Math.PI / 180;

interface MarsGlobeProps {
  tracks: Record<string, RoverTrack>;
  marsLightSeconds: number | null;
  onOpenTraverse: (craftId: string) => void;
  onBack: () => void;
}

interface PlacedSite extends MarsSite {
  // live-resolved position (rover position overrides the landing site)
  plat: number;
  plon: number;
}

export function MarsGlobe({ tracks, marsLightSeconds, onOpenTraverse, onBack }: MarsGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Resolve each site's plotted position: live rover position when we have it.
  const sites: PlacedSite[] = useMemo(
    () =>
      MARS_SITES.map((s) => {
        const t = s.craftId ? tracks[s.craftId] : undefined;
        return { ...s, plat: t?.current.lat ?? s.lat, plon: t?.current.lon ?? s.lon };
      }),
    [tracks],
  );
  const selSite = selected ? sites.find((s) => s.id === selected) ?? null : null;

  // Mutable view state driven by the render loop / drag.
  const view = useRef({ lon: 210, lat: 12, dragging: false });
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;

    // --- Load the equirectangular texture once, into a pixel buffer. ---
    let tex: { data: Uint8ClampedArray; w: number; h: number } | null = null;
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}mars/globe.jpg`;
    img.onload = () => {
      const tc = document.createElement('canvas');
      tc.width = img.width;
      tc.height = img.height;
      const tctx = tc.getContext('2d')!;
      tctx.drawImage(img, 0, 0);
      tex = { data: tctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };

    // --- Per-pixel base map (recomputed when radius or tilt changes). ---
    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d')!;
    let baseR = 0;
    let baseLat0 = NaN;
    let out: ImageData | null = null;
    let latRow: Int16Array = new Int16Array(0);
    let lonOff: Float32Array = new Float32Array(0);
    let shade: Float32Array = new Float32Array(0);
    let outIdx: Int32Array = new Int32Array(0);
    let count = 0;

    const Lx = -0.38, Ly = -0.42, Lz = 0.82; // light dir (screen up = -y)

    const rebuild = (R: number, lat0: number, texH: number) => {
      const D = R * 2;
      buf.width = D;
      buf.height = D;
      out = bctx.createImageData(D, D);
      const cap = D * D;
      latRow = new Int16Array(cap);
      lonOff = new Float32Array(cap);
      shade = new Float32Array(cap);
      outIdx = new Int32Array(cap);
      const sinP = Math.sin(lat0), cosP = Math.cos(lat0);
      let k = 0;
      for (let py = 0; py < D; py++) {
        const y = -((py + 0.5 - R) / R); // math-up
        for (let px = 0; px < D; px++) {
          const x = (px + 0.5 - R) / R;
          const rho2 = x * x + y * y;
          if (rho2 > 1) continue;
          const cosc = Math.sqrt(1 - rho2);
          const lat = Math.asin(cosc * sinP + y * cosP); // rad
          const off = Math.atan2(x, cosc * cosP - y * sinP); // rad, add lon0
          let row = ((90 - lat / DEG) / 180) * texH;
          row = row < 0 ? 0 : row >= texH ? texH - 1 : row | 0;
          let sh = x * Lx + y * Ly + cosc * Lz;
          sh = sh < 0.28 ? 0.28 : sh > 1 ? 1 : sh;
          latRow[k] = row;
          lonOff[k] = off / DEG;
          shade[k] = sh;
          outIdx[k] = (py * D + px) * 4;
          k++;
        }
      }
      count = k;
      baseR = R;
      baseLat0 = lat0;
    };

    // --- Screen geometry + forward projection for markers. ---
    let geom = { cx: 0, cy: 0, R: 0, dpr: 1 };
    // Geometry from the live element size, so a click can hit-test even if the
    // rAF loop is throttled (e.g. a background tab) and geom is stale.
    const geomNow = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      return { cx: w / 2, cy: h / 2, R: Math.min(w, h) * 0.34 };
    };
    const project = (lat: number, lon: number, g: { cx: number; cy: number; R: number } = geom) => {
      const p = view.current.lat * DEG;
      const dl = (lon - view.current.lon) * DEG;
      const la = lat * DEG;
      const cosc = Math.sin(p) * Math.sin(la) + Math.cos(p) * Math.cos(la) * Math.cos(dl);
      const x = g.R * Math.cos(la) * Math.sin(dl);
      const yv = g.R * (Math.cos(p) * Math.sin(la) - Math.sin(p) * Math.cos(la) * Math.cos(dl));
      return { x: g.cx + x, y: g.cy - yv, front: cosc > 0.02 };
    };

    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const R = Math.min(w, h) * 0.34;
      geom = { cx: w / 2, cy: h / 2, R, dpr };

      if (t - last < 33) return;
      last = t;
      // Gentle idle spin, frozen while dragging or while a marker is selected
      // (so it stays put for reading and aiming).
      if (!view.current.dragging && !selectedRef.current) view.current.lon += 0.03;
      view.current.lon = ((view.current.lon % 360) + 360) % 360;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!tex) return;

      const Ri = Math.round(R);
      if (Ri !== Math.round(baseR) || view.current.lat * DEG !== baseLat0) {
        rebuild(Ri, view.current.lat * DEG, tex.h);
      }
      // Rasterise the globe into the buffer.
      const od = out!.data;
      const td = tex.data, tw = tex.w;
      const lon0 = view.current.lon;
      for (let i = 0; i < count; i++) {
        let lonDeg = lonOff[i]! + lon0 + LON0;
        lonDeg = ((lonDeg % 360) + 360) % 360;
        let col = (lonDeg / 360) * tw;
        col = col >= tw ? tw - 1 : col | 0;
        const ti = (latRow[i]! * tw + col) * 4;
        const s = shade[i]!;
        const o = outIdx[i]!;
        od[o] = td[ti]! * s;
        od[o + 1] = td[ti + 1]! * s;
        od[o + 2] = td[ti + 2]! * s;
        od[o + 3] = 255;
      }
      bctx.putImageData(out!, 0, 0);
      // Soft shadow halo, then the globe.
      ctx.save();
      ctx.beginPath();
      ctx.arc(geom.cx, geom.cy, R + 1, 0, Math.PI * 2);
      ctx.shadowColor = 'rgba(200,120,70,0.25)';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      ctx.drawImage(buf, geom.cx - R, geom.cy - R, R * 2, R * 2);

      // Markers.
      ctx.textAlign = 'left';
      for (const s of sites) {
        const p = project(s.plat, s.plon);
        if (!p.front) continue;
        const isSel = s.id === selectedRef.current;
        const isRover = s.kind === 'rover';
        const col = isRover ? PAL.delay : s.kind === 'lander' ? PAL.signal : PAL.txt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isSel ? 5 : isRover ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        if (isSel) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
        if (isSel || isRover) {
          ctx.font = '11px "Roboto Mono", monospace';
          ctx.fillStyle = isSel ? PAL.txt : PAL.dim;
          ctx.fillText(s.name, p.x + 9, p.y + 3.5);
        }
      }
    };
    raf = requestAnimationFrame(draw);

    // --- Interaction: drag to spin/tilt, click/tap to select a marker. ---
    // Selection lives on 'click' (fires for mouse, touch and automation);
    // pointer events handle the drag and flag it so a drag never selects.
    let downAt: { x: number; y: number } | null = null;
    let didDrag = false;
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
      didDrag = false;
      view.current.dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      if (!downAt) return;
      const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y;
      // Ignore sub-threshold jitter so a tap never nudges the globe (which would
      // decouple what was drawn from what the tap hit-tests against).
      if (!didDrag && Math.abs(dx) + Math.abs(dy) <= 3) return;
      didDrag = true;
      view.current.lon -= dx * 0.35;
      view.current.lat = Math.max(-78, Math.min(78, view.current.lat + dy * 0.3));
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      view.current.dragging = false;
      downAt = null;
    };
    const onClick = (e: MouseEvent) => {
      if (didDrag) { didDrag = false; return; }
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      // Recompute marker positions from the current view so the hit-test never
      // depends on the render loop having run this frame.
      const g = geomNow();
      let best: string | null = null;
      let bestD = 18 * 18;
      for (const s of sites) {
        const p = project(s.plat, s.plon, g);
        if (!p.front) continue;
        const d = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d < bestD) { bestD = d; best = s.id; }
      }
      setSelected(best);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('click', onClick);
    };
  }, [sites]);

  const ageLine =
    marsLightSeconds != null
      ? `You are seeing Mars as it was ${fmtDuration(marsLightSeconds)} ago.`
      : 'Drag to spin. Tap a rover to follow its drive.';

  return (
    <div className="marsglobe">
      <div className="mg-bar">
        <button className="back" onClick={onBack}>← Back</button>
        <div className="mg-title">
          <span className="mg-name">Mars</span>
          <span className="mg-sub">{sites.length} sites · drag to spin · tap a marker</span>
        </div>
      </div>

      <div className="mg-viewport" ref={wrapRef}>
        <canvas ref={canvasRef} />
        <div className="mg-age">{ageLine}</div>
      </div>

      <div className="mg-panel">
        {selSite ? (
          <div className="mg-detail">
            <div className="mg-detail-name">{selSite.name}</div>
            <div className="mg-detail-sub">
              {selSite.kind === 'feature' ? 'Landmark' : selSite.kind === 'rover' ? 'Active rover' : 'Lander'}
              {selSite.year ? ` · ${selSite.year}` : ''} · {selSite.plat.toFixed(1)}°, {selSite.plon.toFixed(1)}°E
            </div>
            <p className="mg-note">{selSite.note}</p>
            {selSite.craftId && tracks[selSite.craftId] && (
              <button className="mg-traverse" onClick={() => onOpenTraverse(selSite.craftId!)}>
                View surface traverse →
              </button>
            )}
            <button className="mg-clear" onClick={() => setSelected(null)}>Clear</button>
          </div>
        ) : (
          <div className="mg-intro">
            <p>
              A rotating map of Mars from the Viking global mosaic, with every place we have landed
              marked on it. The two amber dots are Perseverance and Curiosity, shown where they are
              driving now. Tap one to walk its route over the surface.
            </p>
            <div className="mg-legend">
              <span><i className="mg-k-rover" />Active rover</span>
              <span><i className="mg-k-lander" />Lander / past rover</span>
              <span><i className="mg-k-feature" />Landmark</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
