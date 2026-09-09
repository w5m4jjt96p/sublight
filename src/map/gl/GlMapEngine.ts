// GlMapEngine — the map read in three dimensions, on the GPU. Same public
// surface as MapEngine, so the React hook swaps one for the other behind the
// flag and nothing else in the app knows.
//
// The split: WebGL draws what lives in space (stars, rings, the Sun, lit
// planets, stems from out-of-plane craft, the signal path and its pulses). A
// 2D canvas laid over it draws what lives on the screen (craft chips fanned
// out of their clusters, labels, the legend) and takes the pointer, the way
// the flat map does — so fanning, thumbnails and picking are the flat map's
// code, not a second copy.
//
// World units are the log-compressed ones: direction from the Sun is exact in
// three dimensions, distance is stretched by r = log10(1 + AU·400), and the
// legend says so on screen. Nothing moves faster than Horizons says.

import type { Pick, EngineOptions } from '../engine.ts';
import { advance, type MapModel } from '../model.ts';
import { rOf, R_MAX } from '../projection.ts';
import { PAL, craftColor } from '../palette.ts';
import { drawChip, PLANET_R, LABEL_FACE } from '../render.ts';
import { LIGHT_MIN_PER_S, PULSE_PERIOD_S, IDLE_YAW_DEG_PER_S, IDLE_AFTER_S, phaseOf } from '../scene.ts';
import { perspective, lookAt, multiply, translateScale, transform, type Mat4 } from './mat4.ts';
import { buildPrograms, type Programs, type Program } from './programs.ts';
import { sphere, ring, stars, speckle } from './geometry.ts';

const DEG = Math.PI / 180;
const FOV = 50 * DEG;
const HOME_PITCH = 32 * DEG;
const NEAR = 4;
const FAR = 40000;

/** Illustrative body colours for the lit spheres. Not data; never labelled as such. */
const PLANET_COLOR: Record<string, [number, number, number]> = {
  mercury: [0.62, 0.62, 0.64],
  venus: [0.86, 0.77, 0.60],
  earth: [0.36, 0.55, 0.85],
  moon: [0.72, 0.72, 0.72],
  mars: [0.76, 0.40, 0.25],
  jupiter: [0.83, 0.71, 0.55],
  saturn: [0.88, 0.81, 0.62],
  uranus: [0.56, 0.83, 0.88],
  neptune: [0.31, 0.48, 0.85],
};

interface OrbitCam {
  yaw: number;
  pitch: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

export class GlMapEngine {
  private gl: WebGLRenderingContext;
  private glCanvas: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private programs: Programs;
  private model: MapModel | null = null;
  private selectedId: string | null = null;
  private showPath = true;
  private frameImages = new Map<string, HTMLImageElement>();
  private focusInsetX = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private lastT = 0;
  private fontScale = 1;
  private frameCount = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private resizeObs: ResizeObserver;

  // --- camera: an orbit about a target, eased toward its goal each frame ---
  private cur: OrbitCam = { yaw: 0, pitch: HOME_PITCH, dist: 2300, tx: 0, ty: 0, tz: 0 };
  private tgt: OrbitCam = { ...this.cur };
  private homeDist = 2300;
  private idleSince = 0;

  // --- static GPU buffers ---
  private bufStars!: WebGLBuffer;
  private nStars = 0;
  private bufSpeckle!: WebGLBuffer;
  private nSpeckle = 0;
  private bufSphere!: WebGLBuffer;
  private bufSphereIdx!: WebGLBuffer;
  private nSphereIdx = 0;
  private bufQuad!: WebGLBuffer;
  private bufHelio!: WebGLBuffer;
  private nHelio = 0;
  private bufAuRings: { buf: WebGLBuffer; n: number }[] = [];
  private bufPlanetRings: { buf: WebGLBuffer; n: number }[] = [];
  /** Per-frame lines and points (stems, path, pulses). */
  private bufDyn!: WebGLBuffer;
  private dyn = new Float32Array(4096);

  // --- per-frame scratch ---
  private proj: Mat4 = new Float32Array(16);
  private view: Mat4 = new Float32Array(16);
  private vp: Mat4 = new Float32Array(16);
  private clip = [0, 0, 0, 0];
  private eye = [0, 0, 0];
  /** Where the selected craft's leading pulse is, for its overlay label. */
  private leadPulse: { x: number; y: number; z: number; minutes: number } | null = null;

  // --- pointer state (orbit / dolly / pick) ---
  private pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private pinchDist = 0;
  private opts: EngineOptions;

  constructor(
    private overlay: HTMLCanvasElement,
    private stage: HTMLElement,
    opts: EngineOptions,
  ) {
    this.opts = opts;
    // The GL canvas slips in beneath the existing one, which becomes the
    // overlay and keeps the pointer. Absolute elements paint over in-flow
    // siblings, so the overlay is lifted explicitly.
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = 'sky-gl';
    Object.assign(this.glCanvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    stage.insertBefore(this.glCanvas, overlay);
    overlay.style.position = 'relative';
    overlay.style.zIndex = '1';

    const gl = this.glCanvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const octx = overlay.getContext('2d');
    if (!octx) throw new Error('2D overlay unavailable');
    this.octx = octx;

    this.programs = buildPrograms(gl);
    this.buildStatic();

    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
      overlay.addEventListener(ev, this.onPointer);
    }
    overlay.addEventListener('wheel', this.onWheel, { passive: false });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(stage);
    this.resize();
    this.reset();
    this.cur = { ...this.tgt };
    this.idleSince = performance.now();

    if (import.meta.env.DEV) (window as unknown as { __sublightMap?: GlMapEngine }).__sublightMap = this;

    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ public surface

  setModel(model: MapModel): void {
    this.model = model;
    this.buildRings(model);
  }
  setSelected(id: string | null): void { this.selectedId = id; }
  setShowPath(v: boolean): void { this.showPath = v; }
  setFrameImages(images: Map<string, HTMLImageElement>): void { this.frameImages = images; }
  /** Planet icons are the flat map's; here the planets are lit spheres. */
  setPlanetImages(_images: Map<string, HTMLImageElement>): void { /* not used in 3D */ }
  setFocusInset(px: number): void { this.focusInsetX = px; }

  flyToId(id: string): void {
    const c = this.model?.craft.find((c) => c.entry.id === id);
    if (!c) return;
    this.flyTo(c.x, c.z, c.y, c.eph.heliocentricAu, c.lat);
  }

  flyToBody(id: string): void {
    if (id === 'sun') { this.flyTo(0, 0, 0, 8, 0); return; }
    const p = this.model?.planets.find((p) => p.id === id);
    if (p) this.flyTo(p.x, p.z, p.y, p.auT, p.lat);
  }

  reset(): void {
    this.tgt.yaw = 0;
    this.tgt.pitch = HOME_PITCH;
    this.tgt.dist = this.homeDist;
    this.tgt.tx = this.tgt.ty = this.tgt.tz = 0;
    this.idleSince = performance.now();
  }

  zoomBy(factor: number): void {
    this.tgt.dist = this.clampDist(this.tgt.dist / factor);
    this.idleSince = performance.now();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
      this.overlay.removeEventListener(ev, this.onPointer);
    }
    this.overlay.removeEventListener('wheel', this.onWheel);
    this.resizeObs.disconnect();
    this.glCanvas.remove();
    this.overlay.style.position = '';
    this.overlay.style.zIndex = '';
  }

  // ------------------------------------------------------------------- camera

  /** World (x, y, z) in the map's convention → GL (x, up, z). */
  private flyTo(wx: number, wz: number, wy: number, au: number, latDeg: number): void {
    const c = Math.cos(latDeg * DEG);
    this.tgt.tx = wx * c;
    this.tgt.ty = wz;
    this.tgt.tz = wy * c;
    this.tgt.dist = this.clampDist(Math.max(this.homeDist * 0.07, rOf(au) * 0.42 + 40));
    this.idleSince = performance.now();
  }

  private clampDist(d: number): number {
    return Math.max(this.homeDist * 0.04, Math.min(this.homeDist * 2.6, d));
  }

  private stepCamera(dt: number): void {
    const c = this.cur, t = this.tgt;
    if (this.reducedMotion) { Object.assign(c, t); return; }
    const e = 1 - Math.pow(0.002, Math.min(dt, 0.05));
    c.yaw += (t.yaw - c.yaw) * e;
    c.pitch += (t.pitch - c.pitch) * e;
    c.dist += (t.dist - c.dist) * e;
    c.tx += (t.tx - c.tx) * e;
    c.ty += (t.ty - c.ty) * e;
    c.tz += (t.tz - c.tz) * e;
  }

  private buildMatrices(): void {
    const c = this.cur;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    this.eye[0] = c.tx + c.dist * cp * Math.sin(c.yaw);
    this.eye[1] = c.ty + c.dist * sp;
    this.eye[2] = c.tz + c.dist * cp * Math.cos(c.yaw);
    this.view = lookAt(this.eye, [c.tx, c.ty, c.tz], [0, 1, 0]);
    this.proj = perspective(FOV, this.w / Math.max(1, this.h), NEAR, FAR);
    // Shift the whole picture left by half the panel inset (see the flat map):
    // a constant NDC offset is a term on view-z in clip-x, since clip.w = -z.
    this.proj[8] = this.proj[8]! + this.focusInsetX / Math.max(1, this.w);
    multiply(this.proj, this.view, this.vp);
  }

  /** GL point → CSS-pixel screen position, or null when behind the camera. */
  private toScreen(x: number, y: number, z: number): [number, number] | null {
    const q = transform(this.vp, x, y, z, this.clip);
    if (q[3]! <= 0) return null;
    return [(q[0]! / q[3]! * 0.5 + 0.5) * this.w, (0.5 - q[1]! / q[3]! * 0.5) * this.h];
  }

  /** Pixels per world unit at a given world point, for sizes and hit radii. */
  private pxPerUnit(x: number, y: number, z: number): number {
    const d = Math.hypot(x - this.eye[0]!, y - this.eye[1]!, z - this.eye[2]!) || 1;
    return this.h / 2 / (d * Math.tan(FOV / 2));
  }

  // ------------------------------------------------------------- interaction

  private onPointer = (e: PointerEvent): void => {
    const ov = this.overlay;
    if (e.type === 'pointerdown') {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      ov.setPointerCapture(e.pointerId);
      this.idleSince = performance.now();
      if (this.pointers.size === 1) {
        this.dragging = true; this.moved = 0; this.lastX = e.clientX; this.lastY = e.clientY;
        this.opts.onDragStateChange?.(true);
      } else if (this.pointers.size === 2) {
        this.dragging = false; this.pinchDist = this.twoDist();
      }
      return;
    }
    if (e.type === 'pointermove') {
      if (!this.dragging && this.pointers.size === 0) {
        const r = ov.getBoundingClientRect();
        ov.style.cursor = this.hitTest(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : '';
      }
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const d = this.twoDist();
        if (this.pinchDist > 0) this.tgt.dist = this.cur.dist = this.clampDist(this.cur.dist * (this.pinchDist / d));
        this.pinchDist = d;
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      // Drag orbits: yaw with x, pitch with y. Direct manipulation, so the
      // current camera tracks the target while the finger is down.
      this.tgt.yaw -= dx * 0.005;
      this.tgt.pitch = Math.max(3 * DEG, Math.min(88 * DEG, this.tgt.pitch + dy * 0.005));
      this.cur.yaw = this.tgt.yaw; this.cur.pitch = this.tgt.pitch;
      this.lastX = e.clientX; this.lastY = e.clientY;
      return;
    }
    // pointerup / pointercancel
    const wasDragging = this.dragging;
    this.pointers.delete(e.pointerId);
    if (ov.hasPointerCapture(e.pointerId)) ov.releasePointerCapture(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.pointers.size === 0) { this.dragging = false; this.opts.onDragStateChange?.(false); }
    if (wasDragging && this.moved <= 6) {
      const r = ov.getBoundingClientRect();
      const pick = this.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (pick) this.opts.onPick(pick.kind, pick.id);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.idleSince = performance.now();
    this.tgt.dist = this.clampDist(this.tgt.dist * Math.exp(e.deltaY * 0.0016));
  };

  private twoDist(): number {
    const p = [...this.pointers.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
  }

  private hitTest(mx: number, my: number): Pick | null {
    if (!this.model) return null;
    let best: Pick | null = null;
    let bd = Infinity;
    for (const f of this.model.craft) {
      const d = Math.hypot(f.sx - mx, f.sy - my);
      if (d <= f.hitR && d < bd) { bd = d; best = { kind: 'craft', id: f.entry.id }; }
    }
    for (const p of this.model.planets) {
      const d = Math.hypot(p.sx - mx, p.sy - my);
      if (d <= p.hitR && d < bd) { bd = d; best = { kind: 'body', id: p.id }; }
    }
    const s = this.toScreen(0, 0, 0);
    if (s) {
      const ds = Math.hypot(s[0] - mx, s[1] - my);
      if (ds <= 36 * this.pxPerUnit(0, 0, 0) && ds < bd) best = { kind: 'body', id: 'sun' };
    }
    return best;
  }

  // --------------------------------------------------------------- resources

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.stage.clientWidth;
    this.h = this.stage.clientHeight;
    for (const c of [this.glCanvas, this.overlay]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
      c.style.width = `${this.w}px`;
      c.style.height = `${this.h}px`;
    }
    this.gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Home distance: the heliopause ring fits the shorter side with a margin.
    const need = R_MAX * 2.1;
    const dh = need / (2 * Math.tan(FOV / 2));
    const dw = dh / Math.max(0.2, this.w / Math.max(1, this.h));
    const was = this.homeDist;
    this.homeDist = Math.max(dh, dw);
    if (Math.abs(this.tgt.dist - was) < 1) this.tgt.dist = this.homeDist;
  }

  private upload(data: Float32Array | Uint16Array, target: number = this.gl.ARRAY_BUFFER): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(target, buf);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return buf;
  }

  private buildStatic(): void {
    const gl = this.gl;
    const st = stars();
    this.bufStars = this.upload(st); this.nStars = st.length / 5;
    const sp = speckle(rOf);
    this.bufSpeckle = this.upload(sp); this.nSpeckle = sp.length / 5;
    const sph = sphere();
    this.bufSphere = this.upload(sph.pos);
    this.bufSphereIdx = this.upload(sph.idx, gl.ELEMENT_ARRAY_BUFFER); this.nSphereIdx = sph.idx.length;
    this.bufQuad = this.upload(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    const helio = ring(rOf(120), 160, true);
    this.bufHelio = this.upload(helio); this.nHelio = helio.length / 3;
    this.bufAuRings = [1, 10, 100].map((au) => { const r = ring(rOf(au), 96); return { buf: this.upload(r), n: r.length / 3 }; });
    this.bufDyn = gl.createBuffer()!;
  }

  private buildRings(model: MapModel): void {
    for (const r of this.bufPlanetRings) this.gl.deleteBuffer(r.buf);
    this.bufPlanetRings = model.planets.map((p) => { const r = ring(rOf(p.auT), 128); return { buf: this.upload(r), n: r.length / 3 }; });
  }

  // ------------------------------------------------------------------- frame

  private loop(now: number): void {
    const dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (this.frameCount++ % 15 === 0) {
      const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale'));
      if (isFinite(n) && n > 0) this.fontScale = n;
    }
    // Idle yaw, only at overview and only while nobody is touching, so a
    // framed body never slides out from under the reader.
    const idle = (now - this.idleSince) / 1000 > IDLE_AFTER_S;
    if (idle && !this.reducedMotion && this.cur.dist > this.homeDist * 0.7) {
      this.tgt.yaw += IDLE_YAW_DEG_PER_S * DEG * dt;
    }
    this.stepCamera(dt);
    if (this.model) {
      advance(this.model, Date.now());
      this.buildMatrices();
      this.drawSpace(now);
      this.drawOverlay(now);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private use(p: Program): Program { this.gl.useProgram(p.prog); return p; }

  private bindPoints(p: Program, buf: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(p.attr.a_pos!);
    gl.vertexAttribPointer(p.attr.a_pos!, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(p.attr.a_size!);
    gl.vertexAttribPointer(p.attr.a_size!, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(p.attr.a_alpha!);
    gl.vertexAttribPointer(p.attr.a_alpha!, 1, gl.FLOAT, false, 20, 16);
  }

  private drawLines(buf: WebGLBuffer, n: number, color: [number, number, number, number]): void {
    const gl = this.gl;
    const p = this.use(this.programs.lines);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(p.attr.a_pos!);
    gl.vertexAttribPointer(p.attr.a_pos!, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(p.uni.u_mvp!, false, this.vp);
    gl.uniform4f(p.uni.u_color!, color[0], color[1], color[2], color[3]);
    gl.drawArrays(gl.LINES, 0, n);
  }

  private drawSpace(now: number): void {
    const gl = this.gl;
    const m = this.model!;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Stars: rotation only, so they sit at infinity.
    {
      const ex = this.eye[0]! - this.cur.tx, ey = this.eye[1]! - this.cur.ty, ez = this.eye[2]! - this.cur.tz;
      const sv = lookAt([ex, ey, ez], [0, 0, 0], [0, 1, 0]);
      const mvp = multiply(this.proj, sv);
      const p = this.use(this.programs.points);
      this.bindPoints(p, this.bufStars);
      gl.uniformMatrix4fv(p.uni.u_mvp!, false, mvp);
      gl.uniform1f(p.uni.u_dpr!, this.dpr);
      const c = rgb(PAL.star);
      gl.uniform3f(p.uni.u_color!, c[0], c[1], c[2]);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, this.nStars);
      gl.depthMask(true);
    }

    // Rings and speckle, in the plane.
    for (const r of this.bufAuRings) this.drawLines(r.buf, r.n, [0.18, 0.21, 0.27, 0.9]);
    for (const r of this.bufPlanetRings) this.drawLines(r.buf, r.n, [0.27, 0.32, 0.40, 0.34]);
    this.drawLines(this.bufHelio, this.nHelio, [0.56, 0.84, 0.90, 0.14]);
    {
      const p = this.use(this.programs.points);
      this.bindPoints(p, this.bufSpeckle);
      gl.uniformMatrix4fv(p.uni.u_mvp!, false, this.vp);
      gl.uniform1f(p.uni.u_dpr!, this.dpr);
      const c = rgb(PAL.rule2);
      gl.uniform3f(p.uni.u_color!, c[0], c[1], c[2]);
      gl.drawArrays(gl.POINTS, 0, this.nSpeckle);
    }

    // Planets: lit spheres, world-sized, so approaching one makes it grow.
    {
      const p = this.use(this.programs.lit);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSphere);
      gl.enableVertexAttribArray(p.attr.a_pos!);
      gl.vertexAttribPointer(p.attr.a_pos!, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(p.attr.a_nrm!);
      gl.vertexAttribPointer(p.attr.a_nrm!, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufSphereIdx);
      gl.uniformMatrix4fv(p.uni.u_vp!, false, this.vp);
      for (const pl of m.planets) {
        const [gx, gy, gz] = this.bodyPos(pl);
        const r = Math.max(2.6, (PLANET_R[pl.id] ?? 3) * 2.4);
        gl.uniformMatrix4fv(p.uni.u_model!, false, translateScale(gx, gy, gz, r));
        const c = PLANET_COLOR[pl.id] ?? [0.5, 0.55, 0.62];
        gl.uniform3f(p.uni.u_color!, c[0], c[1], c[2]);
        gl.drawElements(gl.TRIANGLES, this.nSphereIdx, gl.UNSIGNED_SHORT, 0);
      }
    }

    // Stems from out-of-plane craft to their foot, the signal path, and the
    // inbound pulses: one dynamic buffer, refilled each frame.
    const earth = m.earth;
    const sel = this.selectedId ? m.craft.find((c) => c.entry.id === this.selectedId) ?? null : null;
    const live = (c: { entry: { status: string } }) => c.entry.status !== 'silent' && c.entry.status !== 'retired';
    let n = 0;
    const d = this.dyn;
    for (const c of m.craft) {
      if (Math.abs(c.lat) < 2) continue;
      const [gx, gy, gz] = this.bodyPos(c);
      d[n++] = gx; d[n++] = gy; d[n++] = gz; d[n++] = gx; d[n++] = 0; d[n++] = gz;
    }
    if (n) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufDyn);
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n), gl.DYNAMIC_DRAW);
      this.drawLines(this.bufDyn, n / 3, [0.43, 0.47, 0.54, 0.35]);
    }
    if (this.showPath && sel && earth && live(sel)) {
      const [ax, ay, az] = this.bodyPos(sel);
      const [ex, ey, ez] = this.bodyPos(earth);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufDyn);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ax, ay, az, ex, ey, ez]), gl.DYNAMIC_DRAW);
      this.drawLines(this.bufDyn, 2, [0.90, 0.71, 0.44, 0.32]);
    }

    // The Sun: a glow billboard, drawn after the opaque bodies, no depth write.
    {
      const p = this.use(this.programs.glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
      gl.enableVertexAttribArray(p.attr.a_corner!);
      gl.vertexAttribPointer(p.attr.a_corner!, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(p.uni.u_view!, false, this.view);
      gl.uniformMatrix4fv(p.uni.u_proj!, false, this.proj);
      gl.uniform3f(p.uni.u_center!, 0, 0, 0);
      gl.uniform1f(p.uni.u_size!, 110);
      const c = rgb(PAL.delay);
      gl.uniform3f(p.uni.u_color!, c[0], c[1], c[2]);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
    }

    // Inbound signals: every live craft sends a pulse home on a fixed period,
    // crossing at the stated scale. Pulses brighten as they close in. The data
    // comes *to* Earth, so that is the direction everything moves.
    this.leadPulse = null;
    if (earth && !this.reducedMotion) {
      const [ex, ey, ez] = this.bodyPos(earth);
      const tS = now / 1000;
      n = 0;
      for (const c of m.craft) {
        if (!live(c)) continue;
        const owlt = c.eph.owltSeconds;
        if (!(owlt > 0)) continue;
        const trip = owlt / (LIGHT_MIN_PER_S * 60);
        const phase = phaseOf(c.entry.id) * PULSE_PERIOD_S;
        const [ax, ay, az] = this.bodyPos(c);
        const first = Math.floor((tS - trip - phase) / PULSE_PERIOD_S);
        const last = Math.floor((tS - phase) / PULSE_PERIOD_S);
        let lead = -1;
        for (let k = first; k <= last && n + 5 <= d.length; k++) {
          const u = (tS - (k * PULSE_PERIOD_S + phase)) / trip;
          if (u < 0 || u > 1) continue;
          d[n++] = ax + (ex - ax) * u; d[n++] = ay + (ey - ay) * u; d[n++] = az + (ez - az) * u;
          d[n++] = 3.4; d[n++] = 0.3 + 0.7 * u;
          if (u > lead) lead = u;
        }
        if (c === sel && lead >= 0) {
          this.leadPulse = { x: ax + (ex - ax) * lead, y: ay + (ey - ay) * lead, z: az + (ez - az) * lead, minutes: ((1 - lead) * owlt) / 60 };
        }
      }
      if (n) {
        const p = this.use(this.programs.points);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufDyn);
        gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n), gl.DYNAMIC_DRAW);
        this.bindPoints(p, this.bufDyn);
        gl.uniformMatrix4fv(p.uni.u_mvp!, false, this.vp);
        gl.uniform1f(p.uni.u_dpr!, this.dpr);
        const c = rgb(PAL.delay);
        gl.uniform3f(p.uni.u_color!, c[0], c[1], c[2]);
        gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, n / 5);
        gl.depthMask(true);
      }
    }
  }

  /** A body's GL position: in-plane footprint shrunk by cos(lat), lifted by z. */
  private bodyPos(b: { x: number; y: number; z: number; lat: number }): [number, number, number] {
    const c = Math.cos(b.lat * DEG);
    return [b.x * c, b.z, b.y * c];
  }

  private drawOverlay(now: number): void {
    const ctx = this.octx;
    const m = this.model!;
    const w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);
    const labelPx = 12 * this.fontScale;
    const font = `${labelPx}px ${LABEL_FACE}`;
    const label = (sx: number, sy: number, text: string, color: string, dy: number): void => {
      ctx.fillStyle = color; ctx.font = font; ctx.textAlign = 'center'; ctx.fillText(text, sx, sy + dy);
    };
    const zoomFactor = this.homeDist / this.cur.dist;

    // Planet labels and hit radii, from the same matrices the GPU used.
    for (const p of m.planets) {
      const [gx, gy, gz] = this.bodyPos(p);
      const s = this.toScreen(gx, gy, gz);
      if (!s) { p.sx = p.sy = -9999; p.hitR = 0; continue; }
      const rpx = Math.max(2.6, (PLANET_R[p.id] ?? 3) * 2.4) * this.pxPerUnit(gx, gy, gz);
      p.sx = s[0]; p.sy = s[1]; p.hitR = rpx + 6;
      label(s[0], s[1], p.name.toUpperCase(), PAL.planetLabel, p.id === 'moon' ? -(rpx + 8) : rpx + 13);
    }

    // Craft: anchors projected, then fanned in screen space, then drawn as the
    // flat map draws them. Chips keep a fixed size on screen: they are the
    // reader's handle on a craft, not a body with a size.
    const chipW = Math.round(Math.max(26, Math.min(78, 24 + zoomFactor * 12)));
    const chipH = Math.round(chipW * 0.72);
    const baseSpread = 17 + Math.min(3.4, zoomFactor - 1) * 13;
    for (const g of m.clusters) {
      const [gx, gy, gz] = this.bodyPos(g);
      const s = this.toScreen(gx, gy, gz);
      g.ax = s ? s[0] : -9999; g.ay = s ? s[1] : -9999;
      const n = g.members.length;
      if (n === 1) { g.members[0]!.sx = g.ax; g.members[0]!.sy = g.ay; continue; }
      const hasImaging = g.members.some((mm) => mm.entry.imagery && this.frameImages.get(mm.entry.id)?.complete);
      const spread = hasImaging ? Math.max(baseSpread, chipW * 1.35) : baseSpread;
      const span = DEG * 88;
      const a0 = Math.atan2(g.ay - (this.toScreen(0, 0, 0)?.[1] ?? h / 2), g.ax - (this.toScreen(0, 0, 0)?.[0] ?? w / 2)) - span / 2;
      for (const f of g.members) {
        const a = a0 + span * (f.clusterIndex / (n - 1));
        f.sx = g.ax + Math.cos(a) * spread;
        f.sy = g.ay + Math.sin(a) * spread;
      }
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(70,82,102,.5)'; ctx.lineWidth = 1;
    for (const g of m.clusters) {
      if (g.members.length === 1 || g.ax < -999) continue;
      ctx.beginPath(); ctx.arc(g.ax, g.ay, 2.4, 0, Math.PI * 2); ctx.stroke();
      for (const f of g.members) { ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(f.sx, f.sy); ctx.stroke(); }
    }
    ctx.restore();

    for (const f of m.craft) {
      if (f.sx < -999) { f.hitR = 0; continue; }
      const on = f.entry.id === this.selectedId;
      const col = craftColor(f.entry.status, f.entry.imagery !== null);
      const img = this.frameImages.get(f.entry.id);
      const quiet = f.entry.status === 'silent' || f.entry.status === 'retired';
      if (img && img.complete && img.naturalWidth > 0) {
        f.hitR = Math.max(chipW, chipH) / 2 + 3;
        drawChip(ctx, f.sx, f.sy, chipW, chipH, img, on, now, this.reducedMotion);
        label(f.sx, f.sy, f.entry.name.toUpperCase(), on ? PAL.txt : PAL.delay, chipH / 2 + (on ? 15 : 12));
        continue;
      }
      f.hitR = on ? 14 : 12;
      if (on) {
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.globalAlpha = this.reducedMotion ? 0.7 : 0.55 + Math.sin(now / 420) * 0.25;
        ctx.beginPath(); ctx.arc(f.sx, f.sy, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = col;
      ctx.fillRect(f.sx - 2.5, f.sy - 2.5, 5, 5);
      label(f.sx, f.sy, f.entry.name.toUpperCase(), on ? PAL.txt : quiet ? '#39414F' : PAL.dim, on ? 24 : 14);
    }

    // The selected craft's leading pulse carries its remaining light-time.
    if (this.leadPulse) {
      const s = this.toScreen(this.leadPulse.x, this.leadPulse.y, this.leadPulse.z);
      if (s) {
        const mins = this.leadPulse.minutes;
        const t = mins >= 90 ? `${(mins / 60).toFixed(1)} LIGHT-H OUT` : `${Math.max(1, Math.round(mins))} LIGHT-MIN OUT`;
        label(s[0], s[1], t, PAL.delay, -8);
      }
    }

    // Heliopause label, and the legend that names the distortion.
    const hp = this.toScreen(0, 0, -rOf(120));
    if (hp) label(hp[0], hp[1], 'HELIOPAUSE ≈ 120 AU', PAL.faint, -8);
    ctx.fillStyle = PAL.faint; ctx.font = font; ctx.textAlign = 'right';
    ctx.fillText('DISTANCE · LOG SCALE, r = log10(1 + AU×400) · DIRECTIONS TRUE', w - 16, 112);
    ctx.fillText(`SIGNALS INBOUND · 1 S = ${LIGHT_MIN_PER_S} LIGHT-MIN`, w - 16, 112 + labelPx * 1.5);
    ctx.fillText('DRAG TO ORBIT · SCROLL TO APPROACH', w - 16, 112 + labelPx * 3);
  }
}
