// Mars globe — a rotating, textured Mars rendered in pure Canvas 2D
// (orthographic projection of an equirectangular map, no 3D library, no runtime
// dependency), with the rovers and landing sites plotted on the surface.
// Bilinear sampling of a 2048px mosaic at device resolution keeps it sharp, and
// scroll / pinch zoom lets you get close. Tapping a rover opens its live surface
// traverse. It carries the thesis: the Mars you see is already light-minutes old.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MARS_SITES, type MarsSite } from '../data/marsSites.ts';
import type { RoverTrack } from '../types.ts';
import { PAL } from '../map/palette.ts';
import { fmtDuration } from '../data/format.ts';

const LON0 = 180; // texture longitude offset: left edge = 180°W
const DEG = Math.PI / 180;

interface MarsGlobeProps {
  tracks: Record<string, RoverTrack>;
  marsLightSeconds: number | null;
  onOpenTraverse: (craftId: string) => void;
  onBack: () => void;
}

interface PlacedSite extends MarsSite {
  plat: number;
  plon: number;
}

export function MarsGlobe({ tracks, marsLightSeconds, onOpenTraverse, onBack }: MarsGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const sites: PlacedSite[] = useMemo(
    () =>
      MARS_SITES.map((s) => {
        const t = s.craftId ? tracks[s.craftId] : undefined;
        return { ...s, plat: t?.current.lat ?? s.lat, plon: t?.current.lon ?? s.lon };
      }),
    [tracks],
  );
  const selSite = selected ? sites.find((s) => s.id === selected) ?? null : null;

  // lon/lat orient the globe; zoom scales the on-screen radius.
  const view = useRef({ lon: 210, lat: 12, zoom: 1 });
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;

    // Texture → pixel buffer.
    let tex: { data: Uint8ClampedArray; w: number; h: number } | null = null;
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}mars/globe.jpg`;
    img.onload = () => {
      const tc = document.createElement('canvas');
      tc.width = img.width; tc.height = img.height;
      const tctx = tc.getContext('2d')!;
      tctx.drawImage(img, 0, 0);
      tex = { data: tctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };

    // Sphere raster buffer + its precomputed per-pixel base map. The base map
    // (row, fraction, longitude offset, shading) only depends on radius and tilt;
    // spin just re-samples each frame, so dragging longitude stays cheap.
    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d')!;
    const RENDER_SCALE = Math.min(2, window.devicePixelRatio || 1); // sharp on retina
    let baseKey = '';
    let out: ImageData | null = null;
    let y0a: Int32Array = new Int32Array(0), y1a: Int32Array = new Int32Array(0);
    let fya: Float32Array = new Float32Array(0), lonOff: Float32Array = new Float32Array(0);
    let shade: Float32Array = new Float32Array(0), outIdx: Int32Array = new Int32Array(0);
    let count = 0, bufD = 0;
    const Lx = -0.4, Ly = -0.42, Lz = 0.82;

    const rebuild = (Rb: number, lat0: number, texH: number) => {
      const D = Math.max(2, Math.round(Rb * 2));
      bufD = D; buf.width = D; buf.height = D;
      out = bctx.createImageData(D, D);
      const cap = D * D;
      y0a = new Int32Array(cap); y1a = new Int32Array(cap);
      fya = new Float32Array(cap); lonOff = new Float32Array(cap);
      shade = new Float32Array(cap); outIdx = new Int32Array(cap);
      const sinP = Math.sin(lat0), cosP = Math.cos(lat0);
      let k = 0;
      for (let py = 0; py < D; py++) {
        const y = -((py + 0.5 - Rb) / Rb);
        for (let px = 0; px < D; px++) {
          const x = (px + 0.5 - Rb) / Rb;
          const rho2 = x * x + y * y;
          if (rho2 > 1) continue;
          const cosc = Math.sqrt(1 - rho2);
          const lat = Math.asin(cosc * sinP + y * cosP);
          const off = Math.atan2(x, cosc * cosP - y * sinP);
          const vy = ((90 - lat / DEG) / 180) * texH - 0.5;
          let ry = Math.floor(vy);
          const fy = vy - ry;
          if (ry < 0) ry = 0;
          const ry1 = ry + 1 >= texH ? texH - 1 : ry + 1;
          let sh = x * Lx + y * Ly + cosc * Lz;
          sh = sh < 0.3 ? 0.3 : sh > 1 ? 1 : sh;
          y0a[k] = ry; y1a[k] = ry1; fya[k] = fy < 0 ? 0 : fy;
          lonOff[k] = off / DEG; shade[k] = sh; outIdx[k] = (py * D + px) * 4;
          k++;
        }
      }
      count = k;
    };

    const geom = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      const R = Math.min(w, h) * 0.34 * view.current.zoom;
      return { w, h, cx: w / 2, cy: h / 2, R };
    };

    // Orthographic forward projection for a marker at (lat, lon).
    const project = (lat: number, lon: number, g: { cx: number; cy: number; R: number }) => {
      const p = view.current.lat * DEG, dl = (lon - view.current.lon) * DEG, la = lat * DEG;
      const cosc = Math.sin(p) * Math.sin(la) + Math.cos(p) * Math.cos(la) * Math.cos(dl);
      const x = g.R * Math.cos(la) * Math.sin(dl);
      const yv = g.R * (Math.cos(p) * Math.sin(la) - Math.sin(p) * Math.cos(la) * Math.cos(dl));
      return { x: g.cx + x, y: g.cy - yv, front: cosc > 0.02 };
    };

    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const g = geom();
      if (canvas.width !== Math.round(g.w * dpr) || canvas.height !== Math.round(g.h * dpr)) {
        canvas.width = Math.round(g.w * dpr); canvas.height = Math.round(g.h * dpr);
      }
      if (t - last < 33) return;
      last = t;
      view.current.lon = ((view.current.lon % 360) + 360) % 360;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      if (!tex) return;

      const Rb = Math.round(g.R * RENDER_SCALE);
      const key = `${Rb}:${view.current.lat.toFixed(2)}`;
      if (key !== baseKey) { rebuild(Rb, view.current.lat * DEG, tex.h); baseKey = key; }

      // Rasterise the globe with bilinear sampling.
      const od = out!.data, td = tex.data, tw = tex.w;
      const lon0 = view.current.lon;
      for (let i = 0; i < count; i++) {
        let u = lonOff[i]! + lon0 + LON0;
        u = ((u % 360) + 360) % 360;
        const fu = (u / 360) * tw - 0.5;
        let x0 = Math.floor(fu); const fx = fu - x0;
        x0 = ((x0 % tw) + tw) % tw;
        const x1 = x0 + 1 >= tw ? 0 : x0 + 1;
        const r0 = y0a[i]! * tw, r1 = y1a[i]! * tw, fy = fya[i]!, s = shade[i]!;
        const a = (r0 + x0) * 4, b = (r0 + x1) * 4, c = (r1 + x0) * 4, d = (r1 + x1) * 4;
        const o = outIdx[i]!;
        for (let ch = 0; ch < 3; ch++) {
          const top = td[a + ch]! * (1 - fx) + td[b + ch]! * fx;
          const bot = td[c + ch]! * (1 - fx) + td[d + ch]! * fx;
          od[o + ch] = (top * (1 - fy) + bot * fy) * s;
        }
        od[o + 3] = 255;
      }
      bctx.putImageData(out!, 0, 0);

      // Shadow + globe.
      ctx.save();
      ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R + 1, 0, Math.PI * 2);
      ctx.shadowColor = 'rgba(200,120,70,0.22)'; ctx.shadowBlur = 26; ctx.fillStyle = '#000'; ctx.fill();
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, 0, bufD, bufD, g.cx - g.R, g.cy - g.R, g.R * 2, g.R * 2);

      // Markers.
      ctx.textAlign = 'left';
      for (const s of sites) {
        const p = project(s.plat, s.plon, g);
        if (!p.front) continue;
        const isSel = s.id === selectedRef.current, isRover = s.kind === 'rover';
        const col = isRover ? PAL.delay : s.kind === 'lander' ? PAL.signal : PAL.txt;
        ctx.beginPath(); ctx.arc(p.x, p.y, isSel ? 5.5 : isRover ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        if (isSel) { ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke(); }
        if (isSel || isRover) {
          ctx.font = '12px "Roboto Mono", monospace';
          ctx.fillStyle = isSel ? PAL.txt : PAL.dim;
          ctx.fillText(s.name, p.x + 10, p.y + 4);
        }
      }
    };
    raf = requestAnimationFrame(draw);

    // Interaction: drag rotate, wheel/pinch zoom, tap select.
    const pointers = new Map<number, { x: number; y: number }>();
    let didDrag = false, pinchStart = 0, zoomStart = 1;
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); didDrag = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) { pinchStart = Math.hypot(a.x - b.x, a.y - b.y); zoomStart = view.current.zoom; }
      }
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId); if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart > 0) {
        const [a, b] = [...pointers.values()];
        if (a && b) { view.current.zoom = Math.max(1, Math.min(4, zoomStart * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart))); didDrag = true; }
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (!didDrag && Math.abs(dx) + Math.abs(dy) <= 3) return;
      didDrag = true;
      view.current.lon -= (dx * 0.3) / view.current.zoom;
      view.current.lat = Math.max(-80, Math.min(80, view.current.lat + (dy * 0.3) / view.current.zoom));
    };
    const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = 0; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.zoom = Math.max(1, Math.min(4, view.current.zoom * (1 - e.deltaY * 0.0012)));
    };
    const onClick = (e: MouseEvent) => {
      if (didDrag) { didDrag = false; return; }
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const g = geom();
      let best: string | null = null, bestD = 20 * 20;
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
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
    };
  }, [sites]);

  const ageLine =
    marsLightSeconds != null
      ? `You are seeing Mars as it was ${fmtDuration(marsLightSeconds)} ago.`
      : 'Drag to spin. Scroll or pinch to zoom. Tap a rover to follow its drive.';

  return (
    <div className="marsglobe">
      <div className="mg-bar">
        <button className="back" onClick={onBack}>← Back</button>
        <div className="mg-title">
          <span className="mg-name">Mars</span>
          <span className="mg-sub">{sites.length} sites · drag to spin · scroll to zoom</span>
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
