// MapEngine — owns the canvas, the RAF loop, camera and interaction. React
// mounts it once and drives it imperatively (selection, path toggle, fly-to).
import { Camera } from './camera.ts';
import { render } from './render.ts';
import { makeStars, type Star } from './stars.ts';
import { attachInteraction } from './interaction.ts';
import { advance, type MapModel } from './model.ts';
import { rOf, R_MAX } from './projection.ts';
import {
  readSceneFlags, tiltProject, TILT_DEG, IDLE_YAW_DEG_PER_S, IDLE_AFTER_S,
  FRONT_PERIOD_S, FRONT_MAX, AU_PER_S, type Projected,
} from './scene.ts';

/** What the pointer landed on: a craft or a body (planet / Moon / Sun). */
export type Pick = { kind: 'craft' | 'body'; id: string };

export interface EngineOptions {
  onPick: (kind: Pick['kind'], id: string) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

export class MapEngine {
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private stars: Star[] = makeStars();
  private model: MapModel | null = null;
  private selectedId: string | null = null;
  private showPath = true;
  private frameImages = new Map<string, HTMLImageElement>();
  private planetImages = new Map<string, HTMLImageElement>();
  private focusInsetX = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private lastT = 0;
  private fontScale = 1;
  private frameCount = 0;
  private detachInteraction: () => void;
  private resizeObs: ResizeObserver;

  // --- the tilted scene (prototype, behind ?map3d=1) ---
  private scene = readSceneFlags();
  /** Camera yaw about the Sun, radians. Drifts while nobody is touching. */
  private yaw = 0;
  private idleSince = 0;
  /** performance.now() at which each light front left the Sun. */
  private fronts: number[] = [];
  private lastFront = -Infinity;
  private P: Projected = { px: 0, py: 0, depth: 0 };
  private onInput = (): void => {
    this.idleSince = performance.now();
  };
  private static readonly INPUT_EVENTS = ['pointerdown', 'wheel', 'touchstart'] as const;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
    opts: EngineOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.camera.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.detachInteraction = attachInteraction<Pick>(canvas, this.camera, {
      hitTest: (x, y) => this.hitTest(x, y),
      onSelect: (pick) => opts.onPick(pick.kind, pick.id),
      onDragStateChange: opts.onDragStateChange,
      onHoverChange: (over) => {
        this.canvas.style.cursor = over ? 'pointer' : '';
      },
      projectionCenter: () => [this.w / 2 - this.focusInsetX / 2, this.h / 2],
    });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(stage);
    this.resize();

    // Any touch on the map pauses the idle yaw for a few seconds.
    for (const ev of MapEngine.INPUT_EVENTS) canvas.addEventListener(ev, this.onInput, { passive: true });
    this.idleSince = performance.now();

    // DEV only: let the console read camera, model and scene while the tilted
    // map is a prototype. Never reaches a build.
    if (import.meta.env.DEV) (window as unknown as { __sublightMap?: MapEngine }).__sublightMap = this;

    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setModel(model: MapModel): void {
    this.model = model;
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
  }

  setShowPath(v: boolean): void {
    this.showPath = v;
  }

  /** Replace the on-map thumbnail cache (id → loaded/loading <img>). */
  setFrameImages(images: Map<string, HTMLImageElement>): void {
    this.frameImages = images;
  }

  /** Loaded planet icons (id → <img>). */
  setPlanetImages(images: Map<string, HTMLImageElement>): void {
    this.planetImages = images;
  }

  /** Px reserved by the right info panel; the map shifts left to stay centred. */
  setFocusInset(px: number): void {
    this.focusInsetX = px;
  }

  /**
   * Where a world point lands in the plane the camera pans in. Flat, that is
   * the world itself; tilted, it is the leaned, turned view plane, so a fly-to
   * has to aim there or it centres on the wrong spot.
   */
  private toView(x: number, y: number, z: number, latDeg: number): [number, number] {
    if (!this.scene.tilt) return [x, y];
    const c = Math.cos((latDeg * Math.PI) / 180);
    tiltProject(x * c, y * c, z, this.yaw, (TILT_DEG * Math.PI) / 180, this.P);
    return [this.P.px, this.P.py];
  }

  flyToId(id: string): void {
    const c = this.model?.craft.find((c) => c.entry.id === id);
    if (!c) return;
    const [vx, vy] = this.toView(c.x, c.y, c.z, c.lat);
    this.camera.flyTo(vx, vy, c.eph.heliocentricAu);
    this.onInput();
  }

  flyToBody(id: string): void {
    if (id === 'sun') {
      this.camera.flyTo(0, 0, 8); // moderate zoom on the centre
      this.onInput();
      return;
    }
    const p = this.model?.planets.find((p) => p.id === id);
    if (!p) return;
    const [vx, vy] = this.toView(p.x, p.y, p.z, p.lat);
    this.camera.flyTo(vx, vy, p.auT);
    this.onInput();
  }

  reset(): void {
    this.camera.reset();
  }

  zoomBy(factor: number): void {
    this.camera.zoomBy(factor);
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.stage.clientWidth;
    this.h = this.stage.clientHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.camera.setViewport(this.w, this.h);
  }

  private hitTest(mx: number, my: number): Pick | null {
    if (!this.model) return null;
    let best: Pick | null = null;
    let bd = Infinity;
    // craft (thumbnails are larger targets; each carries its own click radius)
    for (const f of this.model.craft) {
      const d = Math.hypot(f.sx - mx, f.sy - my);
      if (d <= f.hitR && d < bd) {
        bd = d;
        best = { kind: 'craft', id: f.entry.id };
      }
    }
    // planets + Moon
    for (const p of this.model.planets) {
      const d = Math.hypot(p.sx - mx, p.sy - my);
      if (d <= p.hitR && d < bd) {
        bd = d;
        best = { kind: 'body', id: p.id };
      }
    }
    // the Sun (at world origin); mirror render's projection + sizing
    const cam = this.camera.cur;
    const sunSx = this.w / 2 - this.focusInsetX / 2 + (0 - cam.x) * cam.k;
    const sunSy = this.h / 2 + (0 - cam.y) * cam.k;
    const planetZoom = Math.min(2.2, Math.max(0.6, (cam.k / this.camera.base) * 0.72));
    const sunR = 16 * planetZoom;
    const ds = Math.hypot(sunSx - mx, sunSy - my);
    if (ds <= sunR && ds < bd) best = { kind: 'body', id: 'sun' };
    return best;
  }

  private loop(now: number): void {
    const dt = (now - this.lastT) / 1000;
    this.lastT = now;
    this.camera.step(dt);
    // Pick up live --font-scale edits without a getComputedStyle every frame.
    if (this.frameCount++ % 15 === 0) {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-scale');
      const n = parseFloat(raw);
      if (isFinite(n) && n > 0) this.fontScale = n;
    }
    // The tilted scene: yaw drifts only at overview zoom and only while idle,
    // so a framed body never slides out from under the reader; light fronts
    // leave the Sun on a fixed period and are dropped once past the heliopause.
    let sceneState = null;
    if (this.scene.tilt) {
      const idle = (now - this.idleSince) / 1000 > IDLE_AFTER_S;
      const overview = this.camera.cur.k <= this.camera.base * 1.2;
      if (idle && overview && !this.camera.reducedMotion) {
        this.yaw += ((IDLE_YAW_DEG_PER_S * Math.PI) / 180) * dt;
      }
      if (!this.camera.reducedMotion) {
        if ((now - this.lastFront) / 1000 >= FRONT_PERIOD_S && this.fronts.length < FRONT_MAX) {
          this.fronts.push(now);
          this.lastFront = now;
        }
        if (this.fronts.length && rOf(((now - this.fronts[0]!) / 1000) * AU_PER_S) >= R_MAX) {
          this.fronts.shift();
        }
      }
      sceneState = { tiltRad: (TILT_DEG * Math.PI) / 180, yawRad: this.yaw, fronts: this.fronts };
    }
    if (this.model) {
      // Advance every body to real wall-clock time before drawing.
      advance(this.model, Date.now());
      render({
        ctx: this.ctx,
        w: this.w,
        h: this.h,
        model: this.model,
        camera: this.camera,
        stars: this.stars,
        selectedId: this.selectedId,
        showPath: this.showPath,
        now,
        reducedMotion: this.camera.reducedMotion,
        frameImages: this.frameImages,
        planetImages: this.planetImages,
        fontScale: this.fontScale,
        focusInsetX: this.focusInsetX,
        scene: sceneState,
      });
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const ev of MapEngine.INPUT_EVENTS) this.canvas.removeEventListener(ev, this.onInput);
    this.detachInteraction();
    this.resizeObs.disconnect();
  }
}
