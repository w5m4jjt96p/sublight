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
//
// Handedness: the flat map has longitude running clockwise, which is the solar
// system seen from the ecliptic *south*. Here north is up, as on every chart,
// and the frame is a proper rotation of the real one (so the sky and the
// planets' maps come out true, not mirrored), which makes this scene the flat
// map's mirror image in the plane. GL frame: x = -map x, y = ecliptic z
// (north), z = map y.

import type { Pick, EngineOptions } from '../engine.ts';
import { advance, type MapModel } from '../model.ts';
import { rOf, R_MAX } from '../projection.ts';
import { PAL, craftColor } from '../palette.ts';
import { drawChip, LABEL_FACE } from '../render.ts';
import { LIGHT_MIN_PER_S, PULSE_PERIOD_S, IDLE_YAW_DEG_PER_S, IDLE_AFTER_S, phaseOf } from '../scene.ts';
import { perspective, lookAt, multiply, translateScale, basisScale, transform, type Mat4 } from './mat4.ts';
import { buildPrograms, type Programs, type Program } from './programs.ts';
import { sphere, ring, annulus, stars, speckle } from './geometry.ts';

const DEG = Math.PI / 180;
const FOV = 50 * DEG;
const HOME_PITCH = 32 * DEG;
/** Near plane follows the camera in: 3% of its distance, so a 1.2-unit Earth is never cut open. */
const NEAR_MIN = 0.05;
const NEAR_MAX = 4;
const FAR = 40000;
/** The eye keeps this many radii clear of a body's centre. */
const CLEARANCE = 1.3;

/** Planets with a colour map in public/bodies/maps (see scripts/fetch-planet-maps.ts). */
const MAPPED = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter'];

/** Saturn's rings, in planet radii: C ring inner edge to A ring outer edge. */
const SATURN_RING = [1.24, 2.27] as const;

/**
 * Mean radii, km (IAU/NASA fact sheets), the Sun included. Every body keeps
 * its true proportion to every other: 109 Earths across the Sun, eleven
 * across Jupiter, the Moon a quarter of Earth. Only the overall scale is
 * chosen, small enough that the Sun's disc (131 units) stays inside Parker
 * Solar Probe's perihelion (263 units on this map) and Mercury's orbit (447).
 * Distances are log-compressed, so no radius is to scale with them, and a
 * body never drops below a few pixels so it stays findable from afar.
 */
const RADIUS_KM: Record<string, number> = {
  sun: 695700,
  mercury: 2439.7, venus: 6051.8, earth: 6371.0, moon: 1737.4, mars: 3389.5,
  jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622,
};
const EARTH_UNITS = 1.2;
const UNIT_PER_KM = EARTH_UNITS / RADIUS_KM.earth!;
const MIN_BODY_PX = 3;
const SUN_CORE = RADIUS_KM.sun! * UNIT_PER_KM;
const SUN_GLOW = SUN_CORE / 0.63; // the glow shader's disc edge sits at 0.63 of the quad

/**
 * A pole's GL direction from its IAU right ascension and declination
 * (J2000): equatorial → ecliptic by the obliquity, then into the GL frame.
 */
function poleGL(raDeg: number, decDeg: number): number[] {
  const ra = raDeg * DEG, dec = decDeg * DEG, eps = 23.4393 * DEG;
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  const ey = y * Math.cos(eps) + z * Math.sin(eps);
  const ez = -y * Math.sin(eps) + z * Math.cos(eps);
  return [-ey, ez, -x];
}
/** IAU 2015 north poles (RA, Dec at J2000), so each body leans the way it really does. */
const POLES: Record<string, number[]> = {
  mercury: poleGL(281.01, 61.45),
  venus: poleGL(272.76, 67.16),
  earth: poleGL(0, 90),
  moon: poleGL(269.995, 66.54),
  mars: poleGL(317.68, 52.89),
  jupiter: poleGL(268.06, 64.50),
  saturn: poleGL(40.589, 83.537),
  uranus: poleGL(257.31, -15.18),
  neptune: poleGL(299.36, 43.46),
};

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
  private bufSphereUv!: WebGLBuffer;
  private bufSphereIdx!: WebGLBuffer;
  private nSphereIdx = 0;
  private bufRing!: WebGLBuffer;
  private nRing = 0;
  /** Colour maps by planet id, as they arrive; a planet without one is a tinted sphere. */
  private planetTex = new Map<string, WebGLTexture>();
  private planetImgs: HTMLImageElement[] = [];
  private bufQuad!: WebGLBuffer;
  private bufHelio!: WebGLBuffer;
  private nHelio = 0;
  private bufAuRings: { buf: WebGLBuffer; n: number }[] = [];
  private bufPlanetRings: { buf: WebGLBuffer; n: number }[] = [];
  /** Per-frame lines and points (stems, path, pulses). */
  private bufDyn!: WebGLBuffer;
  private dyn = new Float32Array(4096);
  /** The real sky, once its map has loaded; the point stars stand in until then. */
  private skyTex: WebGLTexture | null = null;
  private skyGain = 1.0;
  private skyImg: HTMLImageElement | null = null;

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
    // siblings, so the overlay is made positioned too: it then paints after
    // the GL canvas in tree order, and the HUD, positioned and later in the
    // tree, still paints (and clicks) above it. No z-index: one would put the
    // overlay above the HUD and swallow the Reset button.
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = 'sky-gl';
    Object.assign(this.glCanvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    stage.insertBefore(this.glCanvas, overlay);
    overlay.style.position = 'relative';

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
    const [x, y, z] = this.bodyPos(c);
    this.flyTo(x, y, z, Math.max(this.homeDist * 0.07, rOf(c.eph.heliocentricAu) * 0.42 + 40));
  }

  /** Frame a body so its disc fills about a third of the height; Earth wider, so the Moon fits. */
  flyToBody(id: string): void {
    const dist = (id === 'earth' ? 7 : 4.5) * this.baseR(id);
    if (id === 'sun') { this.flyTo(0, 0, 0, dist); return; }
    const p = this.model?.planets.find((p) => p.id === id);
    if (!p) return;
    const [x, y, z] = this.bodyPos(p); // the drawn position: the Moon's is held off Earth
    this.flyTo(x, y, z, dist);
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
    if (this.skyImg) this.skyImg.onload = null;
    if (this.skyTex) this.gl.deleteTexture(this.skyTex);
    for (const img of this.planetImgs) img.onload = null;
    for (const t of this.planetTex.values()) this.gl.deleteTexture(t);
    this.glCanvas.remove();
    this.overlay.style.position = '';
  }

  // ------------------------------------------------------------------- camera

  /** Aim the orbit at a GL point and settle at `dist` from it. */
  private flyTo(x: number, y: number, z: number, dist: number): void {
    this.tgt.tx = x;
    this.tgt.ty = y;
    this.tgt.tz = z;
    // Arrive from the sunward side, so the body shows its day face and not the
    // night it turns to the outer system. The nearest turn, never the long way.
    const r = Math.hypot(this.tgt.tx, this.tgt.tz);
    if (r > 1) {
      const want = Math.atan2(-this.tgt.tx, -this.tgt.tz);
      const d = want - this.tgt.yaw;
      this.tgt.yaw += Math.atan2(Math.sin(d), Math.cos(d));
    }
    this.tgt.dist = this.clampDist(dist);
    this.idleSince = performance.now();
  }

  /**
   * Never inside a body, never past the far edge. The eye sits at
   * target + dist·u. For every body, the ray's entry and exit through a
   * sphere of CLEARANCE radii bound the forbidden range: a target inside
   * that sphere (its own body) pushes the eye out past the exit; a target
   * outside it keeps the eye on whichever side of the body it was nearer
   * to, so approaching Earth from the sunward side stops short of the Sun
   * rather than jumping beyond it. Bodies the ray misses impose nothing.
   */
  private clampDist(requested: number): number {
    const t = this.tgt;
    const cp = Math.cos(t.pitch);
    const ux = cp * Math.sin(t.yaw), uy = Math.sin(t.pitch), uz = cp * Math.cos(t.yaw);
    let d = Math.max(0.3, Math.min(this.homeDist * 2.6, requested));
    const keepOut = (cx: number, cy: number, cz: number, R: number): void => {
      const wx = t.tx - cx, wy = t.ty - cy, wz = t.tz - cz;
      const b = 2 * (wx * ux + wy * uy + wz * uz);
      const c = wx * wx + wy * wy + wz * wz - R * R;
      const disc = b * b - 4 * c;
      if (!(disc > 0)) return; // misses; also drops NaN from a non-finite body position
      const sq = Math.sqrt(disc);
      const entry = (-b - sq) / 2, exit = (-b + sq) / 2;
      if (!Number.isFinite(exit)) return;
      if (c < 0) d = Math.max(d, exit);
      else if (d > entry && d < exit) d = d - entry < exit - d ? Math.max(0.3, entry) : exit;
    };
    keepOut(0, 0, 0, SUN_CORE * CLEARANCE);
    for (const p of this.model?.planets ?? []) {
      const [gx, gy, gz] = this.bodyPos(p);
      keepOut(gx, gy, gz, this.baseR(p.id) * CLEARANCE);
    }
    return d;
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
    const near = Math.min(NEAR_MAX, Math.max(NEAR_MIN, c.dist * 0.03));
    this.proj = perspective(FOV, this.w / Math.max(1, this.h), near, FAR);
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
    // Never zero: a 0-high stage would otherwise turn pixel floors into infinities.
    return Math.max(1e-3, this.h / 2 / (d * Math.tan(FOV / 2)));
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
        if (this.pinchDist > 0 && d > 0) {
          const pts = [...this.pointers.values()];
          const r = ov.getBoundingClientRect();
          this.dollyAt((pts[0]!.x + pts[1]!.x) / 2 - r.left, (pts[0]!.y + pts[1]!.y) / 2 - r.top, this.pinchDist / d);
          Object.assign(this.cur, this.tgt);
        }
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
      this.tgt.dist = this.clampDist(this.tgt.dist);
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
    const r = this.overlay.getBoundingClientRect();
    this.dollyAt(e.clientX - r.left, e.clientY - r.top, Math.exp(e.deltaY * 0.0016));
  };

  /**
   * Approach whatever is under the cursor, not the Sun: the orbit target
   * slides toward the point the cursor's ray meets on the plane, by the same
   * factor the distance shrinks, so that point stays under the cursor and the
   * next drag orbits around it. Rays that miss the plane use the point at the
   * current depth instead.
   */
  private dollyAt(mx: number, my: number, factor: number): void {
    const t = this.tgt;
    const dist = this.clampDist(t.dist * factor);
    const k = dist / t.dist;
    if (k === 1) return;
    const P = this.pointUnder(mx, my, t.ty);
    t.tx = P[0] + (t.tx - P[0]) * k;
    t.ty = P[1] + (t.ty - P[1]) * k;
    t.tz = P[2] + (t.tz - P[2]) * k;
    t.dist = dist;
  }

  /** The world point a screen position's ray meets on the plane y = planeY. */
  private pointUnder(mx: number, my: number, planeY: number): [number, number, number] {
    const v = this.view;
    const tan = Math.tan(FOV / 2);
    const nx = (mx / Math.max(1, this.w)) * 2 - 1 + this.focusInsetX / Math.max(1, this.w);
    const ny = 1 - (my / Math.max(1, this.h)) * 2;
    const rx = nx * tan * (this.w / Math.max(1, this.h)), ry = ny * tan, rz = -1;
    // Rows of the view rotation are the camera axes in world space.
    const dx = v[0]! * rx + v[1]! * ry + v[2]! * rz;
    const dy = v[4]! * rx + v[5]! * ry + v[6]! * rz;
    const dz = v[8]! * rx + v[9]! * ry + v[10]! * rz;
    const ex = this.eye[0]!, ey = this.eye[1]!, ez = this.eye[2]!;
    let s = dy !== 0 ? (planeY - ey) / dy : -1;
    if (!(s > 0) || s > this.cur.dist * 6) s = this.cur.dist;
    return [ex + dx * s, ey + dy * s, ez + dz * s];
  }

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
      if (ds <= Math.max(14, SUN_CORE * this.pxPerUnit(0, 0, 0)) && ds < bd) best = { kind: 'body', id: 'sun' };
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
    // The sky map's size depends on the backing store, so it waits for a real one.
    if (this.w > 0 && !this.skyTex && !this.skyImg) this.loadSky();
    if (this.w > 0 && this.planetImgs.length === 0) this.loadPlanetMaps();
    // Home distance: the heliopause ring fits the shorter side with a margin.
    // A hidden stage measures 0×0 and says nothing about the frame to come.
    if (this.w <= 0 || this.h <= 0) return;
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
    this.bufSphereUv = this.upload(sph.uv);
    this.bufSphereIdx = this.upload(sph.idx, gl.ELEMENT_ARRAY_BUFFER); this.nSphereIdx = sph.idx.length;
    const rg = annulus(SATURN_RING[0], SATURN_RING[1]);
    this.bufRing = this.upload(rg); this.nRing = rg.length / 3;
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

  /**
   * NASA's Deep Star Maps 2020 (Gaia DR2 + Hipparcos over the diffuse Milky
   * Way), baked to sRGB by scripts/build-sky.py. The 4k map only where the
   * backing store is wide enough to show it; the 2k one is a fifth the bytes.
   */
  private loadSky(): void {
    const gl = this.gl;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const wide = this.glCanvas.width >= 1600;
    const size = wide && maxTex >= 4096 ? '4k' : '2k';
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const tex = gl.createTexture();
      if (!tex) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.skyTex = tex;
      this.skyImg = null;
    };
    img.src = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sky/starmap-${size}.jpg`;
    this.skyImg = img;
  }

  /** The planets' colour maps, 1024x512 each, mipmapped; tinted spheres until they arrive. */
  private loadPlanetMaps(): void {
    const gl = this.gl;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    for (const id of MAPPED) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const tex = gl.createTexture();
        if (!tex) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.planetTex.set(id, tex);
      };
      img.src = `${base}/bodies/maps/${id}.jpg`;
      this.planetImgs.push(img);
    }
  }

  // ------------------------------------------------------------------- frame

  private loop(now: number): void {
    // Next frame first: a throw further down must never end the animation,
    // or the map would freeze with every control still wired to it.
    this.raf = requestAnimationFrame(this.loop);
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
    // A hidden stage measures 0×0; its projection is not finite, so nothing
    // is drawn until the ResizeObserver hands over a real size.
    if (this.model && this.w > 0 && this.h > 0) {
      advance(this.model, Date.now());
      this.buildMatrices();
      this.drawSpace(now);
      this.drawOverlay(now);
    }
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

    // The sky: the real one once its map is in, drawn first, behind
    // everything, from the camera's rotation alone. Until then, the point
    // stars, which also sit at infinity.
    if (this.skyTex) {
      const p = this.use(this.programs.sky);
      const v = this.view;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
      gl.enableVertexAttribArray(p.attr.a_corner!);
      gl.vertexAttribPointer(p.attr.a_corner!, 2, gl.FLOAT, false, 0, 0);
      // Rows of the view rotation are the camera axes in world space.
      gl.uniform3f(p.uni.u_ax!, v[0]!, v[4]!, v[8]!);
      gl.uniform3f(p.uni.u_ay!, v[1]!, v[5]!, v[9]!);
      gl.uniform3f(p.uni.u_az!, v[2]!, v[6]!, v[10]!);
      const t = Math.tan(FOV / 2);
      gl.uniform2f(p.uni.u_tan!, t * (this.w / Math.max(1, this.h)), t);
      gl.uniform1f(p.uni.u_shift!, this.focusInsetX / Math.max(1, this.w));
      gl.uniform1f(p.uni.u_gain!, this.skyGain);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
      gl.uniform1i(p.uni.u_tex!, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    } else {
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

    // Planets: lit spheres, world-sized, so approaching one makes it grow,
    // wearing their NASA colour maps where there is one, each turned to its
    // real pole. The spin phase is not tracked, so no meridian faces anywhere
    // in particular.
    {
      const p = this.use(this.programs.lit);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSphere);
      gl.enableVertexAttribArray(p.attr.a_pos!);
      gl.vertexAttribPointer(p.attr.a_pos!, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(p.attr.a_nrm!);
      gl.vertexAttribPointer(p.attr.a_nrm!, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSphereUv);
      gl.enableVertexAttribArray(p.attr.a_uv!);
      gl.vertexAttribPointer(p.attr.a_uv!, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufSphereIdx);
      gl.uniformMatrix4fv(p.uni.u_vp!, false, this.vp);
      gl.uniform1i(p.uni.u_tex!, 0);
      gl.uniform1f(p.uni.u_ring!, 0);
      gl.uniform1f(p.uni.u_alpha!, 1);
      gl.activeTexture(gl.TEXTURE0);
      let saturn: Mat4 | null = null;
      for (const pl of m.planets) {
        const [gx, gy, gz] = this.bodyPos(pl);
        const r = this.sphereR(pl.id, gx, gy, gz);
        const pole = POLES[pl.id];
        const model = pole ? this.poleBasis(pole, gx, gy, gz, r) : translateScale(gx, gy, gz, r);
        if (pl.id === 'saturn') saturn = model;
        gl.uniformMatrix4fv(p.uni.u_model!, false, model);
        const tex = this.planetTex.get(pl.id);
        if (tex) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1f(p.uni.u_useTex!, 1); }
        else gl.uniform1f(p.uni.u_useTex!, 0);
        const c = PLANET_COLOR[pl.id] ?? [0.5, 0.55, 0.62];
        gl.uniform3f(p.uni.u_color!, c[0], c[1], c[2]);
        gl.drawElements(gl.TRIANGLES, this.nSphereIdx, gl.UNSIGNED_SHORT, 0);
      }
      // Saturn's rings: a translucent disc in the planet's equatorial plane,
      // lit on both faces, drawn after the spheres so the planet hides the far
      // half and the near half lies over the planet.
      if (saturn) {
        gl.disableVertexAttribArray(p.attr.a_uv!);
        gl.vertexAttrib2f(p.attr.a_uv!, 0, 0);
        gl.disableVertexAttribArray(p.attr.a_nrm!);
        gl.vertexAttrib3f(p.attr.a_nrm!, 0, 1, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRing);
        gl.vertexAttribPointer(p.attr.a_pos!, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(p.uni.u_model!, false, saturn);
        gl.uniform1f(p.uni.u_useTex!, 0);
        gl.uniform1f(p.uni.u_ring!, 1);
        gl.uniform1f(p.uni.u_alpha!, 0.55);
        gl.uniform3f(p.uni.u_color!, 0.86, 0.79, 0.63);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.nRing);
        gl.depthMask(true);
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

    // The Sun: a disc with a glow, true proportion to the planets, drawn after
    // the opaque bodies, no depth write.
    {
      const p = this.use(this.programs.glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
      gl.enableVertexAttribArray(p.attr.a_corner!);
      gl.vertexAttribPointer(p.attr.a_corner!, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(p.uni.u_view!, false, this.view);
      gl.uniformMatrix4fv(p.uni.u_proj!, false, this.proj);
      gl.uniform3f(p.uni.u_center!, 0, 0, 0);
      gl.uniform1f(p.uni.u_size!, SUN_GLOW);
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

  /** A body's true-proportion radius in world units. */
  private baseR(id: string): number {
    return (RADIUS_KM[id] ?? RADIUS_KM.mars!) * UNIT_PER_KM;
  }

  /** A body's drawn radius: true proportion, never under a few pixels. */
  private sphereR(id: string, x: number, y: number, z: number): number {
    return Math.max(this.baseR(id), MIN_BODY_PX / this.pxPerUnit(x, y, z));
  }

  /**
   * A body's GL position: in-plane footprint shrunk by cos(lat), lifted by z.
   * The Moon is heliocentrically glued to Earth (0.0026 AU, a quarter of a
   * world unit here) and would sit inside Earth's sphere. As on the flat map it
   * keeps its real direction from Earth, which turns 13° a day, and is held
   * just clear of the two spheres; the distance is abstracted, like every
   * radius on this log map.
   */
  private bodyPos(b: { x: number; y: number; z: number; lat: number; id?: string }): [number, number, number] {
    const c = Math.cos(b.lat * DEG);
    const e = this.model?.earth;
    if (b.id === 'moon' && e && e !== b) {
      const ce = Math.cos(e.lat * DEG);
      const ex = -e.x * ce, ez = e.y * ce;
      let dx = -b.x * c - ex, dz = b.y * c - ez;
      const wd = Math.hypot(dx, dz) || 1;
      dx /= wd; dz /= wd;
      // Three Earth radii out up close (the real sixty would leave the frame);
      // a readable 16 px apart from afar.
      const rE = this.sphereR('earth', ex, e.z, ez), rM = this.sphereR('moon', ex, e.z, ez);
      const gap = Math.max(wd, 3 * rE + rM, 16 / this.pxPerUnit(ex, e.z, ez));
      return [ex + dx * gap, b.z, ez + dz * gap];
    }
    return [-b.x * c, b.z, b.y * c];
  }

  /** Model matrix for a body whose north pole points along `pole` (local +Y is north). */
  private poleBasis(pole: number[], x: number, y: number, z: number, s: number): Mat4 {
    const ya = [pole[0]!, pole[1]!, pole[2]!];
    const t = Math.abs(ya[0]!) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    let xa = [ya[1]! * t[2]! - ya[2]! * t[1]!, ya[2]! * t[0]! - ya[0]! * t[2]!, ya[0]! * t[1]! - ya[1]! * t[0]!];
    const l = Math.hypot(xa[0]!, xa[1]!, xa[2]!) || 1;
    xa = [xa[0]! / l, xa[1]! / l, xa[2]! / l];
    const za = [xa[1]! * ya[2]! - xa[2]! * ya[1]!, xa[2]! * ya[0]! - xa[0]! * ya[2]!, xa[0]! * ya[1]! - xa[1]! * ya[0]!];
    return basisScale(xa, ya, za, x, y, z, s);
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
      const rpx = this.sphereR(p.id, gx, gy, gz) * this.pxPerUnit(gx, gy, gz);
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
    ctx.fillText('BODIES · TRUE PROPORTIONS, SUN INCLUDED · NOT TO DISTANCE', w - 16, 112 + labelPx * 1.5);
    ctx.fillText(`SIGNALS INBOUND · 1 S = ${LIGHT_MIN_PER_S} LIGHT-MIN`, w - 16, 112 + labelPx * 3);
    ctx.fillText('DRAG TO ORBIT · SCROLL TO APPROACH', w - 16, 112 + labelPx * 4.5);
    if (this.skyTex) ctx.fillText('SKY · NASA/GSFC SVS · ESA GAIA DR2', w - 16, 112 + labelPx * 6);
  }
}
