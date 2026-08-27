// Mars globe — a textured, zoomable sphere. Primary path is raw WebGL (the
// browser's own graphics API, no 3D library, no runtime dependency): the GPU
// uploads the mosaic once and samples it with mipmaps + anisotropic filtering,
// so it loads instantly and stays sharp at any zoom. A Canvas-2D orthographic
// rasteriser is the fallback where WebGL is unavailable. Markers, interaction
// and the light-time header are shared. Tapping a rover opens its traverse.
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
  /** When set (and it's a rover with a track), open centred + zoomed on it. */
  focusId?: string | null;
  onOpenTraverse: (craftId: string) => void;
  onBack: () => void;
}
interface PlacedSite extends MarsSite { plat: number; plon: number; }

/** Unit-sphere position for (lat, lonEast). */
function spherePos(lat: number, lon: number): [number, number, number] {
  const p = lat * DEG, l = lon * DEG;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
}

/**
 * View rotation R = RotX(lat)·RotY(-lon) as a column-major mat3. It takes a
 * world sphere point to the view frame where +z faces the camera, matching the
 * orthographic marker projection below, so globe and markers stay in lockstep.
 */
function viewRot(lonDeg: number, latDeg: number): Float32Array {
  const L = lonDeg * DEG, P = latDeg * DEG;
  const cY = Math.cos(L), sY = -Math.sin(L), cX = Math.cos(P), sX = Math.sin(P);
  return new Float32Array([
    cY, sX * sY, -cX * sY, // col0
    0, cX, sX,             // col1
    sY, -sX * cY, cX * cY, // col2
  ]);
}

function buildSphere(stacks: number, slices: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= stacks; i++) {
    const lat = 90 - (i / stacks) * 180;
    for (let j = 0; j <= slices; j++) {
      const lon = (j / slices) * 360;
      const [x, y, z] = spherePos(lat, lon);
      pos.push(x, y, z);
      uv.push((lon + LON0) / 360, i / stacks);
    }
  }
  const cols = slices + 1;
  for (let i = 0; i < stacks; i++)
    for (let j = 0; j < slices; j++) {
      const a = i * cols + j, b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

const VERT = `
attribute vec3 aPos; attribute vec2 aUv;
uniform mat3 uRot; uniform vec2 uCenter; uniform float uR; uniform vec2 uVp;
varying vec2 vUv; varying vec3 vN;
void main(){
  vec3 p = uRot * aPos; vN = p; vUv = aUv;
  float ndcx = ((uCenter.x + p.x * uR) / uVp.x) * 2.0 - 1.0;
  float ndcy = 1.0 - ((uCenter.y - p.y * uR) / uVp.y) * 2.0;
  gl_Position = vec4(ndcx, ndcy, -p.z, 1.0);
}`;
const FRAG = `
precision mediump float;
varying vec2 vUv; varying vec3 vN;
uniform sampler2D uTex; uniform vec3 uLight;
void main(){
  float d = max(dot(normalize(vN), uLight), 0.0);
  gl_FragColor = vec4(texture2D(uTex, vUv).rgb * (0.32 + 0.85 * d), 1.0);
}`;

const MAX_ZOOM = 40;

export function MarsGlobe({ tracks, marsLightSeconds, focusId, onOpenTraverse, onBack }: MarsGlobeProps) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const focusTrack = focusId ? tracks[focusId] : undefined;
  const [selected, setSelected] = useState<string | null>(focusTrack ? focusId! : null);

  const sites: PlacedSite[] = useMemo(
    () => MARS_SITES.map((s) => {
      const t = s.craftId ? tracks[s.craftId] : undefined;
      return { ...s, plat: t?.current.lat ?? s.lat, plon: t?.current.lon ?? s.lon };
    }),
    [tracks],
  );
  const selSite = selected ? sites.find((s) => s.id === selected) ?? null : null;

  const view = useRef(
    focusTrack
      ? { lon: focusTrack.current.lon, lat: focusTrack.current.lat, zoom: 26 }
      : { lon: 210, lat: 12, zoom: 1 },
  );
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const light = [-0.4, 0.35, 0.85] as const;

  // Apply the rover focus once its track is available (covers a cold deep-link
  // where the tracks load after this mounts).
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focusTrack && !focusApplied.current) {
      view.current = { lon: focusTrack.current.lon, lat: focusTrack.current.lat, zoom: 26 };
      setSelected(focusId!);
      focusApplied.current = true;
    }
  }, [focusTrack, focusId]);

  useEffect(() => {
    const glCanvas = glRef.current, overlay = overlayRef.current, wrap = wrapRef.current;
    if (!glCanvas || !overlay || !wrap) return;
    const octx = overlay.getContext('2d')!;

    const geom = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      return { w, h, cx: w / 2, cy: h / 2, R: Math.min(w, h) * 0.34 * view.current.zoom };
    };
    const project = (lat: number, lon: number, g: { cx: number; cy: number; R: number }) => {
      const p = view.current.lat * DEG, dl = (lon - view.current.lon) * DEG, la = lat * DEG;
      const cosc = Math.sin(p) * Math.sin(la) + Math.cos(p) * Math.cos(la) * Math.cos(dl);
      const x = g.R * Math.cos(la) * Math.sin(dl);
      const yv = g.R * (Math.cos(p) * Math.sin(la) - Math.sin(p) * Math.cos(la) * Math.cos(dl));
      return { x: g.cx + x, y: g.cy - yv, front: cosc > 0.02 };
    };
    const drawMarkers = (g: ReturnType<typeof geom>, dpr: number) => {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, g.w, g.h);
      octx.textAlign = 'left';

      // Rover driven paths on the surface (tiny at planet scale; they unfold as
      // you zoom into a rover). Drawn under the markers.
      octx.lineJoin = 'round'; octx.lineCap = 'round';
      for (const s of sites) {
        if (s.kind !== 'rover' || !s.craftId) continue;
        const tr = tracks[s.craftId];
        if (!tr?.waypoints?.length) continue;
        const pts: Array<{ lat: number; lon: number }> = [...tr.waypoints, { lat: tr.current.lat, lon: tr.current.lon }];
        octx.beginPath();
        let started = false;
        for (const wp of pts) {
          const p = project(wp.lat, wp.lon, g);
          if (!p.front) { started = false; continue; }
          if (!started) { octx.moveTo(p.x, p.y); started = true; } else octx.lineTo(p.x, p.y);
        }
        octx.strokeStyle = 'rgba(0,0,0,0.55)'; octx.lineWidth = 4; octx.stroke(); // halo for contrast
        octx.strokeStyle = PAL.signal; octx.lineWidth = 2; octx.stroke();
      }

      for (const s of sites) {
        const p = project(s.plat, s.plon, g);
        if (!p.front) continue;
        const isSel = s.id === selectedRef.current, isRover = s.kind === 'rover';
        const col = isRover ? PAL.delay : s.kind === 'lander' ? PAL.signal : PAL.txt;
        octx.beginPath(); octx.arc(p.x, p.y, isSel ? 5.5 : isRover ? 4.5 : 3.5, 0, Math.PI * 2);
        octx.fillStyle = col; octx.fill();
        if (isSel) { octx.beginPath(); octx.arc(p.x, p.y, 11, 0, Math.PI * 2); octx.strokeStyle = col; octx.lineWidth = 1.4; octx.stroke(); }
        if (isSel || isRover) { octx.font = '12px "Roboto Mono", monospace'; octx.fillStyle = isSel ? PAL.txt : PAL.dim; octx.fillText(s.name, p.x + 10, p.y + 4); }
      }
    };

    // ---- Try WebGL. If the context / shaders don't work, fall back to 2D. ----
    let cleanupGlobe = () => {};
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}mars/globe.jpg`;

    // Probe WebGL on a throwaway canvas (a canvas can't switch between webgl and
    // 2d, so the real one must be given one context type). We test actual
    // rasterisation — draw a green triangle and read it back — because some
    // environments report a working context and compiling shaders yet never
    // draw anything. If it can't rasterise, use the Canvas-2D fallback.
    const webglWorks = (() => {
      try {
        const c = document.createElement('canvas'); c.width = 4; c.height = 4;
        const g = c.getContext('webgl'); if (!g) return false;
        const sh = (t: number, s: string) => { const o = g.createShader(t)!; g.shaderSource(o, s); g.compileShader(o); return o; };
        const pr = g.createProgram()!;
        g.attachShader(pr, sh(g.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));
        g.attachShader(pr, sh(g.FRAGMENT_SHADER, 'void main(){gl_FragColor=vec4(0.0,1.0,0.0,1.0);}'));
        g.linkProgram(pr);
        if (!g.getProgramParameter(pr, g.LINK_STATUS)) return false;
        g.useProgram(pr);
        const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b);
        g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
        const loc = g.getAttribLocation(pr, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
        g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT); g.drawArrays(g.TRIANGLES, 0, 3);
        const px = new Uint8Array(4); g.readPixels(2, 2, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
        return px[1]! > 200 && px[0]! < 80;
      } catch { return false; }
    })();

    if (webglWorks) {
      const gl = glCanvas.getContext('webgl', { antialias: true, alpha: true })!;
      const compile = (t: number, src: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
      {
        gl.useProgram(prog);
        const { pos, uv, idx } = buildSphere(96, 192);
        const bind = (data: BufferSource, attr: string, size: number) => {
          const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(prog, attr); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        };
        bind(pos, 'aPos', 3); bind(uv, 'aUv', 2);
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        const uRot = gl.getUniformLocation(prog, 'uRot'), uCenter = gl.getUniformLocation(prog, 'uCenter');
        const uR = gl.getUniformLocation(prog, 'uR'), uVp = gl.getUniformLocation(prog, 'uVp');
        gl.uniform3fv(gl.getUniformLocation(prog, 'uLight'), new Float32Array(light));

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([120, 70, 45]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
        img.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        };
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);

        cleanupGlobe = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
        (glCanvas as HTMLCanvasElement & { _drawGlobe?: (g: ReturnType<typeof geom>, dpr: number) => void })._drawGlobe = (g, dpr) => {
          if (glCanvas.width !== Math.round(g.w * dpr) || glCanvas.height !== Math.round(g.h * dpr)) {
            glCanvas.width = Math.round(g.w * dpr); glCanvas.height = Math.round(g.h * dpr);
          }
          gl.viewport(0, 0, glCanvas.width, glCanvas.height);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.uniformMatrix3fv(uRot, false, viewRot(view.current.lon, view.current.lat));
          gl.uniform2f(uCenter, g.cx, g.cy); gl.uniform1f(uR, g.R); gl.uniform2f(uVp, g.w, g.h);
          gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        };
      }
    }

    // ---- Canvas-2D fallback rasteriser (used only when WebGL is unusable). ----
    else {
      const ctx = glCanvas.getContext('2d')!;
      let tex: { data: Uint8ClampedArray; w: number; h: number } | null = null;
      img.onload = () => {
        const tc = document.createElement('canvas'); tc.width = img.width; tc.height = img.height;
        const tctx = tc.getContext('2d')!; tctx.drawImage(img, 0, 0);
        tex = { data: tctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
      };
      const buf = document.createElement('canvas'); const bctx = buf.getContext('2d')!;
      const RS = Math.min(2, window.devicePixelRatio || 1);
      let baseKey = '', out: ImageData | null = null, bufD = 0, count = 0;
      let y0a = new Int32Array(0), y1a = new Int32Array(0), fya = new Float32Array(0);
      let lonOff = new Float32Array(0), shade = new Float32Array(0), outIdx = new Int32Array(0);
      const Lx = -0.4, Ly = -0.42, Lz = 0.82;
      const rebuild = (Rb: number, lat0: number, texH: number) => {
        const D = Math.max(2, Math.round(Rb * 2)); bufD = D; buf.width = D; buf.height = D;
        out = bctx.createImageData(D, D); const cap = D * D;
        y0a = new Int32Array(cap); y1a = new Int32Array(cap); fya = new Float32Array(cap);
        lonOff = new Float32Array(cap); shade = new Float32Array(cap); outIdx = new Int32Array(cap);
        const sinP = Math.sin(lat0), cosP = Math.cos(lat0); let k = 0;
        for (let py = 0; py < D; py++) {
          const y = -((py + 0.5 - Rb) / Rb);
          for (let px = 0; px < D; px++) {
            const x = (px + 0.5 - Rb) / Rb; const rho2 = x * x + y * y; if (rho2 > 1) continue;
            const cosc = Math.sqrt(1 - rho2);
            const lat = Math.asin(cosc * sinP + y * cosP);
            const off = Math.atan2(x, cosc * cosP - y * sinP);
            const vy = ((90 - lat / DEG) / 180) * texH - 0.5; let ry = Math.floor(vy); const fy = vy - ry;
            if (ry < 0) ry = 0; const ry1 = ry + 1 >= texH ? texH - 1 : ry + 1;
            let sh = x * Lx + y * Ly + cosc * Lz; sh = sh < 0.3 ? 0.3 : sh > 1 ? 1 : sh;
            y0a[k] = ry; y1a[k] = ry1; fya[k] = fy < 0 ? 0 : fy; lonOff[k] = off / DEG; shade[k] = sh; outIdx[k] = (py * D + px) * 4; k++;
          }
        }
        count = k;
      };
      (glCanvas as HTMLCanvasElement & { _drawGlobe?: (g: ReturnType<typeof geom>, dpr: number) => void })._drawGlobe = (g, dpr) => {
        if (glCanvas.width !== Math.round(g.w * dpr) || glCanvas.height !== Math.round(g.h * dpr)) {
          glCanvas.width = Math.round(g.w * dpr); glCanvas.height = Math.round(g.h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.w, g.h);
        if (!tex) return;
        const Rb = Math.round(g.R * RS), key = `${Rb}:${view.current.lat.toFixed(2)}`;
        if (key !== baseKey) { rebuild(Rb, view.current.lat * DEG, tex.h); baseKey = key; }
        const od = out!.data, td = tex.data, tw = tex.w, lon0 = view.current.lon;
        for (let i = 0; i < count; i++) {
          let u = lonOff[i]! + lon0 + LON0; u = ((u % 360) + 360) % 360;
          const fu = (u / 360) * tw - 0.5; let x0 = Math.floor(fu); const fx = fu - x0;
          x0 = ((x0 % tw) + tw) % tw; const x1 = x0 + 1 >= tw ? 0 : x0 + 1;
          const r0 = y0a[i]! * tw, r1 = y1a[i]! * tw, fy = fya[i]!, s = shade[i]!;
          const a = (r0 + x0) * 4, b = (r0 + x1) * 4, c = (r1 + x0) * 4, d = (r1 + x1) * 4, o = outIdx[i]!;
          for (let ch = 0; ch < 3; ch++) {
            const top = td[a + ch]! * (1 - fx) + td[b + ch]! * fx, bot = td[c + ch]! * (1 - fx) + td[d + ch]! * fx;
            od[o + ch] = (top * (1 - fy) + bot * fy) * s;
          }
          od[o + 3] = 255;
        }
        bctx.putImageData(out!, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(buf, 0, 0, bufD, bufD, g.cx - g.R, g.cy - g.R, g.R * 2, g.R * 2);
      };
    }

    // ---- Shared render loop. ----
    let raf = 0, last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const g = geom();
      if (overlay.width !== Math.round(g.w * dpr) || overlay.height !== Math.round(g.h * dpr)) {
        overlay.width = Math.round(g.w * dpr); overlay.height = Math.round(g.h * dpr);
      }
      if (t - last < 33) return;
      last = t;
      view.current.lon = ((view.current.lon % 360) + 360) % 360;
      (glCanvas as HTMLCanvasElement & { _drawGlobe?: (g: ReturnType<typeof geom>, dpr: number) => void })._drawGlobe?.(g, dpr);
      drawMarkers(g, dpr);
    };
    raf = requestAnimationFrame(draw);

    // ---- Interaction (on the top overlay canvas). ----
    const pointers = new Map<number, { x: number; y: number }>();
    let didDrag = false, pinchStart = 0, zoomStart = 1;
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); didDrag = false;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; if (a && b) { pinchStart = Math.hypot(a.x - b.x, a.y - b.y); zoomStart = view.current.zoom; } }
      try { overlay.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId); if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart > 0) {
        const [a, b] = [...pointers.values()];
        if (a && b) { view.current.zoom = Math.max(1, Math.min(MAX_ZOOM, zoomStart * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart))); didDrag = true; }
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (!didDrag && Math.abs(dx) + Math.abs(dy) <= 3) return;
      didDrag = true;
      view.current.lon -= (dx * 0.3) / view.current.zoom;
      view.current.lat = Math.max(-80, Math.min(80, view.current.lat + (dy * 0.3) / view.current.zoom));
    };
    const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = 0; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); view.current.zoom = Math.max(1, Math.min(MAX_ZOOM, view.current.zoom * (1 - e.deltaY * 0.0012))); };
    const onClick = (e: MouseEvent) => {
      if (didDrag) { didDrag = false; return; }
      const rect = overlay.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top, g = geom();
      let best: string | null = null, bestD = 20 * 20;
      for (const s of sites) { const p = project(s.plat, s.plon, g); if (!p.front) continue; const d = (p.x - px) ** 2 + (p.y - py) ** 2; if (d < bestD) { bestD = d; best = s.id; } }
      setSelected(best);
    };
    overlay.addEventListener('pointerdown', onDown);
    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onUp);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    overlay.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      overlay.removeEventListener('pointerdown', onDown);
      overlay.removeEventListener('pointermove', onMove);
      overlay.removeEventListener('pointerup', onUp);
      overlay.removeEventListener('pointercancel', onUp);
      overlay.removeEventListener('wheel', onWheel);
      overlay.removeEventListener('click', onClick);
      cleanupGlobe();
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
        <canvas ref={glRef} className="mg-gl" />
        <canvas ref={overlayRef} className="mg-overlay" />
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
                Detailed map &amp; photos →
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
