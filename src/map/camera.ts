// Camera: a target the render loop eases toward each frame. Honours
// prefers-reduced-motion by snapping instantly instead of flying.
import { R_MAX } from './projection.ts';

export interface CameraState {
  x: number;
  y: number;
  k: number; // scale
}

export class Camera {
  cur: CameraState = { x: 0, y: 0, k: 0.3 };
  tgt: CameraState = { x: 0, y: 0, k: 0.3 };
  /** Base scale so R_MAX fits the viewport; recomputed on resize. */
  base = 0.3;
  reducedMotion = false;

  setViewport(w: number, h: number): void {
    // Tighter fit on phones so outer-craft labels don't clip at the edges.
    const margin = w < 560 ? 0.7 : 0.88;
    this.base = (Math.min(w, h) / 2 / R_MAX) * margin;
  }

  /** Ease toward target. dt in seconds. */
  step(dt: number): void {
    if (this.reducedMotion) {
      this.cur.x = this.tgt.x;
      this.cur.y = this.tgt.y;
      this.cur.k = this.tgt.k;
      return;
    }
    const e = 1 - Math.pow(0.001, Math.min(dt, 0.05));
    this.cur.x += (this.tgt.x - this.cur.x) * e;
    this.cur.y += (this.tgt.y - this.cur.y) * e;
    this.cur.k += (this.tgt.k - this.cur.k) * e;
  }

  reset(): void {
    this.tgt.x = 0;
    this.tgt.y = 0;
    this.tgt.k = this.base;
  }

  /** Frame a craft: closer bodies get a tighter zoom, as in the prototype. */
  flyTo(x: number, y: number, heliocentricAu: number): void {
    this.tgt.x = x;
    this.tgt.y = y;
    const mult = heliocentricAu < 0.8 ? 5.5 : heliocentricAu < 5 ? 4.2 : 2.6;
    this.tgt.k = this.base * mult;
  }

  private clampK(k: number): number {
    return Math.max(this.base * 0.55, Math.min(this.base * 22, k));
  }

  zoomBy(factor: number): void {
    this.tgt.k = this.clampK(this.tgt.k * factor);
  }

  /**
   * Zoom while keeping the world point under a screen position fixed, so the
   * map grows toward the cursor / pinch centre rather than the screen middle.
   * Direct manipulation, so lock cur = tgt (like panning) — no drift.
   * cx0, cy are the projection centre in CSS pixels (see render.ts).
   */
  zoomAtScreen(factor: number, sx: number, sy: number, cx0: number, cy: number): void {
    const kOld = this.cur.k;
    const kNew = this.clampK(kOld * factor);
    if (kNew === kOld) return;
    const worldX = this.cur.x + (sx - cx0) / kOld;
    const worldY = this.cur.y + (sy - cy) / kOld;
    this.cur.x = this.tgt.x = worldX - (sx - cx0) / kNew;
    this.cur.y = this.tgt.y = worldY - (sy - cy) / kNew;
    this.cur.k = this.tgt.k = kNew;
  }

  panByScreen(dx: number, dy: number): void {
    this.tgt.x -= dx / this.cur.k;
    this.tgt.y -= dy / this.cur.k;
    // Pan feels direct: keep current locked to target while dragging.
    this.cur.x = this.tgt.x;
    this.cur.y = this.tgt.y;
  }
}
