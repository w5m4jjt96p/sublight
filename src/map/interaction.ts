// Pointer / wheel / touch interaction. Kept separate from the render loop so
// the drawing code stays pure. Supports drag-to-pan, wheel-zoom, click-select,
// and two-finger pinch-zoom on touch (Prompt 10).
import type { Camera } from './camera.ts';

export interface InteractionCallbacks<P> {
  /** Screen coords → the thing under the cursor, or null. */
  hitTest: (sx: number, sy: number) => P | null;
  onSelect: (pick: P) => void;
  onDragStateChange?: (dragging: boolean) => void;
  /** Called on hover with whether something clickable is under the cursor. */
  onHoverChange?: (over: boolean) => void;
  /** Projection centre [cx0, cy] in CSS px, for cursor-anchored zoom. */
  projectionCenter?: () => [number, number];
}

export function attachInteraction<P>(
  canvas: HTMLCanvasElement,
  camera: Camera,
  cb: InteractionCallbacks<P>,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  let pinchDist = 0;

  const localXY = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const zoomAt = (factor: number, sx: number, sy: number) => {
    if (cb.projectionCenter) {
      const [cx0, cy] = cb.projectionCenter();
      camera.zoomAtScreen(factor, sx, sy, cx0, cy);
    } else {
      camera.zoomBy(factor);
    }
  };

  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      cb.onDragStateChange?.(true);
    } else if (pointers.size === 2) {
      dragging = false;
      pinchDist = twoPointerDistance();
    }
  };

  const onMove = (e: PointerEvent) => {
    // hover affordance (pointer up, not dragging): is something clickable here?
    if (!dragging && pointers.size === 0 && cb.onHoverChange) {
      const [hx, hy] = localXY(e);
      cb.onHoverChange(cb.hitTest(hx, hy) != null);
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const d = twoPointerDistance();
      if (pinchDist > 0) {
        const [mx, my] = twoPointerMidpoint();
        zoomAt(d / pinchDist, mx, my);
      }
      pinchDist = d;
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    camera.panByScreen(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onUp = (e: PointerEvent) => {
    const wasDragging = dragging;
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) {
      dragging = false;
      cb.onDragStateChange?.(false);
    }
    if (wasDragging && moved <= 6) {
      const [mx, my] = localXY(e);
      const id = cb.hitTest(mx, my);
      if (id) cb.onSelect(id);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [sx, sy] = localXY(e);
    zoomAt(Math.exp(-e.deltaY * 0.0016), sx, sy);
  };

  function twoPointerDistance(): number {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
  }

  function twoPointerMidpoint(): [number, number] {
    const r = canvas.getBoundingClientRect();
    const pts = [...pointers.values()];
    return [
      (pts[0]!.x + pts[1]!.x) / 2 - r.left,
      (pts[0]!.y + pts[1]!.y) / 2 - r.top,
    ];
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
