// MapEngine — owns the canvas, the RAF loop, camera and interaction. React
// mounts it once and drives it imperatively (selection, path toggle, fly-to).
import { Camera } from './camera.ts';
import { render } from './render.ts';
import { makeStars, type Star } from './stars.ts';
import { attachInteraction } from './interaction.ts';
import { advance, type MapModel } from './model.ts';

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

  flyToId(id: string): void {
    const c = this.model?.craft.find((c) => c.entry.id === id);
    if (c) this.camera.flyTo(c.x, c.y, c.eph.heliocentricAu);
  }

  flyToBody(id: string): void {
    if (id === 'sun') {
      this.camera.flyTo(0, 0, 8); // moderate zoom on the centre
      return;
    }
    const p = this.model?.planets.find((p) => p.id === id);
    if (p) this.camera.flyTo(p.x, p.y, p.auT);
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
      });
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.detachInteraction();
    this.resizeObs.disconnect();
  }
}
