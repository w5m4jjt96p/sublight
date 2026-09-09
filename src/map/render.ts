// The draw loop — a faithful port of the prototype's canvas, reading from the
// live model. One function, called once per animation frame. No allocations in
// the hot path beyond the unavoidable.
//
// With `scene` set the same pass draws the tilted reading of the map: every
// world point goes through one projection that leans the plane back and turns
// it slowly, bodies leave the plane by their real ecliptic latitude, and every
// live craft is seen sending its signal home at a stated scale. With `scene`
// null the output is the flat map, unchanged.
import type { Camera } from './camera.ts';
import type { MapModel } from './model.ts';
import type { Star } from './stars.ts';
import { rOf } from './projection.ts';
import { PAL, craftColor } from './palette.ts';
import { tiltProject, LIGHT_MIN_PER_S, PULSE_PERIOD_S, phaseOf, type SceneState, type Projected } from './scene.ts';

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  model: MapModel;
  camera: Camera;
  stars: Star[];
  selectedId: string | null;
  showPath: boolean;
  now: number; // performance.now()
  reducedMotion: boolean;
  /** Loaded hero frames, keyed by craft id — drawn as on-map thumbnails. */
  frameImages: Map<string, HTMLImageElement>;
  /** Loaded planet icons, keyed by planet id. */
  planetImages: Map<string, HTMLImageElement>;
  /** Global --font-scale, applied to map labels too. */
  fontScale: number;
  /** Horizontal inset (px) reserved by the right info panel; shifts the map left. */
  focusInsetX: number;
  /** The tilted scene, or null for the flat map. */
  scene: SceneState | null;
}

// No trailing semicolon: this is concatenated into `ctx.font`, which parses a
// CSS font *value*, not a declaration. With one, canvas rejects the whole
// assignment silently and the labels stay at the default 10px sans-serif.
export const LABEL_FACE = '"Stack Sans Notch", "IBM Plex Sans", system-ui, sans-serif';
// Set once per frame in render(), reused by labelAt so the label size tracks
// the global --font-scale.
let labelFont = `11px ${LABEL_FACE}`;

/** Parallax strength per star layer when the scene is on; one layer when flat. */
const STAR_PARALLAX = [0.03, 0.07, 0.14];
const FLAT_PARALLAX = 0.05;

/** Scratch for the projection; the hot path allocates nothing. */
const P: Projected = { px: 0, py: 0, depth: 0 };

/** True when the image is decoded and safe to drawImage. */
function ready(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

export function render(input: RenderInput): void {
  const { ctx, w, h, model, camera, stars, selectedId, showPath, now, reducedMotion, frameImages, planetImages, fontScale, focusInsetX, scene } =
    input;
  const cam = camera.cur;
  const zoomFactor = cam.k / camera.base;
  const labelPx = 12 * (fontScale || 1);
  labelFont = `${labelPx}px ${LABEL_FACE}`;
  // Shift the whole scene left by half the panel inset so a centred (flown-to)
  // craft lands in the middle of the *visible* map, not behind the panel.
  const cx0 = w / 2 - focusInsetX / 2;

  // One projection for everything. Flat: world is the view plane. Tilted: the
  // world turns by the idle yaw and leans back by the tilt first, and the
  // camera pans in that view plane.
  const project = (x: number, y: number, z = 0): [number, number] => {
    if (!scene) return [cx0 + (x - cam.x) * cam.k, h / 2 + (y - cam.y) * cam.k];
    tiltProject(x, y, z, scene.yawRad, scene.tiltRad, P);
    return [cx0 + (P.px - cam.x) * cam.k, h / 2 + (P.py - cam.y) * cam.k];
  };
  const depthOf = (x: number, y: number, z: number): number =>
    scene ? tiltProject(x, y, z, scene.yawRad, scene.tiltRad, P).depth : 0;
  // A body's in-plane footprint shrinks by cos(lat) as it lifts out of the
  // plane, so that direction from the Sun stays exact in three dimensions.
  const inPlane = (x: number, y: number, latDeg: number): [number, number] => {
    if (!scene) return [x, y];
    const c = Math.cos(latDeg * DEG);
    return [x * c, y * c];
  };
  /** Trace a circle of world radius R in the plane; an ellipse once tilted. */
  const ringPath = (R: number): void => {
    ctx.beginPath();
    if (!scene) {
      const [sx, sy] = project(0, 0);
      ctx.arc(sx, sy, R * cam.k, 0, TWO_PI);
      return;
    }
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TWO_PI;
      const [sx, sy] = project(Math.cos(a) * R, Math.sin(a) * R, 0);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
  };
  const ring = (R: number, color: string, dash?: number[]): void => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (dash) ctx.setLineDash(dash);
    ringPath(R);
    ctx.stroke();
    ctx.restore();
  };

  ctx.clearRect(0, 0, w, h);

  // --- starfield: screen-space, wrapped so it fills the viewport at any zoom.
  // Tilted, the stars sit on three depths and slide at three rates, which is
  // what gives the pan a sense of distance. ---
  ctx.fillStyle = PAL.star;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!;
    const px = scene ? STAR_PARALLAX[i % 3]! : FLAT_PARALLAX;
    const offX = cam.x * cam.k * px;
    const offY = cam.y * cam.k * px;
    const sx = (((s.u * w - offX) % w) + w) % w;
    const sy = (((s.v * h - offY) % h) + h) % h;
    if (s.bright) {
      ctx.globalAlpha = s.a * 0.22;
      ctx.fillRect(sx - s.r, sy - s.r, s.r * 3, s.r * 3); // faint halo
    }
    ctx.globalAlpha = s.a;
    ctx.fillRect(sx, sy, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  ring(rOf(120), 'rgba(143,214,230,.10)', [3, 6]);
  {
    const [hx, hy] = project(0, -rOf(120), 0);
    labelAt(ctx, hx, hy, 'HELIOPAUSE ≈ 120 AU', PAL.faint, -8);
  }

  // --- Kuiper-belt speckle ---
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = PAL.rule2;
  for (let i = 0; i < 220; i++) {
    const a = i * 137.508 * DEG;
    const au = 32 + (i % 17) * 1.6;
    const [sx, sy] = project(Math.cos(a) * rOf(au), Math.sin(a) * rOf(au), 0);
    ctx.fillRect(sx, sy, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;

  // --- planet rings ---
  for (const p of model.planets) ring(rOf(p.auT), 'rgba(70,82,102,.34)');

  // --- AU scale ticks ---
  ctx.fillStyle = PAL.faint;
  ctx.font = labelFont;
  ctx.textAlign = 'left';
  for (const au of [1, 10, 100]) {
    const [sx, sy] = project(rOf(au), 0, 0);
    ctx.fillText(`${au} AU`, sx + 5, sy - 5);
  }

  const planetZoom = Math.min(2.2, Math.max(0.6, zoomFactor * 0.72));

  // --- Sun: stylized amber disc + glow, sized to be the largest body ---
  const [ox, oy] = project(0, 0, 0);
  const sunR = 16 * planetZoom; // clearly the largest body (Jupiter ≈ 13px here)
  const glow = ctx.createRadialGradient(ox, oy, sunR * 0.5, ox, oy, sunR * 3);
  glow.addColorStop(0, 'rgba(229,181,113,.30)');
  glow.addColorStop(1, 'rgba(229,181,113,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ox, oy, sunR * 3, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = PAL.delay;
  ctx.beginPath();
  ctx.arc(ox, oy, sunR, 0, TWO_PI);
  ctx.fill();

  // --- planet markers (mini planet icons, with a plain disc as fallback).
  // Tilted, far bodies paint first so a near one can pass in front. ---
  const planets = scene
    ? [...model.planets].sort((a, b) => depthOf(...inPlane(a.x, a.y, a.lat), a.z) - depthOf(...inPlane(b.x, b.y, b.lat), b.z))
    : model.planets;
  for (const p of planets) {
    let [sx, sy] = project(...inPlane(p.x, p.y, p.lat), p.z);
    const img = planetImages.get(p.id);
    const moon = p.id === 'moon'; // small, and labelled above so it clears Earth
    // The Moon is heliocentrically glued to Earth (0.0026 AU away). Keep its real
    // direction from Earth — which revolves ~13°/day, real motion — but hold a
    // minimum on-screen gap so it stays a distinct companion. Distance is
    // abstracted, like everything on this log map (see /about).
    if (moon && model.earth) {
      const e = model.earth;
      const [ex, ey] = project(...inPlane(e.x, e.y, e.lat), e.z);
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const wd = Math.hypot(dx, dy) || 1;
      dx /= wd;
      dy /= wd;
      const gap = Math.max(Math.hypot(sx - ex, sy - ey), 18 * planetZoom);
      sx = ex + dx * gap;
      sy = ey + dy * gap;
    }
    const baseR = PLANET_R[p.id] ?? 3;
    if (ready(img)) {
      const d = Math.round((baseR * 4 + 6) * planetZoom);
      ctx.drawImage(img, Math.round(sx - d / 2), Math.round(sy - d / 2), d, d);
      labelAt(ctx, sx, sy, p.name.toUpperCase(), PAL.planetLabel, moon ? -(d / 2 + 6) : d / 2 + 11);
      p.hitR = d / 2 + 4;
    } else {
      const r = baseR * planetZoom;
      ctx.fillStyle = PAL.planet;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TWO_PI);
      ctx.fill();
      labelAt(ctx, sx, sy, p.name.toUpperCase(), PAL.planetLabel, moon ? -(r + 8) : r + 13);
      p.hitR = r + 6;
    }
    p.sx = sx;
    p.sy = sy;
  }

  // --- on-map thumbnail size, scaled with zoom ---
  const chipW = Math.round(Math.max(26, Math.min(78, 24 + zoomFactor * 12)));
  const chipH = Math.round(chipW * 0.72);

  // --- fan out co-located craft (screen space) ---
  const baseSpread = 17 + Math.min(3.4, zoomFactor - 1) * 13;
  for (const g of model.clusters) {
    const [ax, ay] = project(...inPlane(g.x, g.y, g.lat), g.z);
    g.ax = ax;
    g.ay = ay;
    const n = g.members.length;
    if (n === 1) {
      const only = g.members[0]!;
      only.sx = ax;
      only.sy = ay;
      continue;
    }
    // Clusters holding an imaged craft fan wider so the thumbnails don't overlap.
    const hasImaging = g.members.some((m) => m.entry.imagery && ready(frameImages.get(m.entry.id)));
    const spread = hasImaging ? Math.max(baseSpread, chipW * 1.35) : baseSpread;
    const span = DEG * 88;
    const a0 = Math.atan2(g.uy, g.ux) - span / 2;
    for (const f of g.members) {
      const a = a0 + span * (f.clusterIndex / (n - 1));
      f.sx = ax + Math.cos(a) * spread;
      f.sy = ay + Math.sin(a) * spread;
    }
  }

  // --- tilted only: a thin stem from each out-of-plane craft down to its
  // foot on the ecliptic, so height reads as height and not as a misplaced
  // dot. Voyager 1 is the one that earns this. ---
  if (scene) {
    ctx.save();
    ctx.strokeStyle = 'rgba(110,120,137,.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (const g of model.clusters) {
      if (Math.abs(g.lat) < 2) continue;
      const [fx, fy] = project(...inPlane(g.x, g.y, g.lat), 0);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(g.ax, g.ay);
      ctx.stroke();
      ctx.fillStyle = 'rgba(110,120,137,.5)';
      ctx.fillRect(fx - 1, fy - 1, 2, 2);
    }
    ctx.restore();
  }

  // --- cluster anchors + leader lines ---
  ctx.save();
  ctx.strokeStyle = 'rgba(70,82,102,.5)';
  ctx.lineWidth = 1;
  for (const g of model.clusters) {
    if (g.members.length === 1) continue;
    ctx.beginPath();
    ctx.arc(g.ax, g.ay, 2.4, 0, TWO_PI);
    ctx.stroke();
    for (const f of g.members) {
      ctx.beginPath();
      ctx.moveTo(g.ax, g.ay);
      ctx.lineTo(f.sx, f.sy);
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- signal path to selected craft ---
  const sel = selectedId ? model.craft.find((c) => c.entry.id === selectedId) ?? null : null;
  const earthSxy: [number, number] | null = model.earth
    ? project(...inPlane(model.earth.x, model.earth.y, model.earth.lat), model.earth.z)
    : null;
  if (showPath && sel && earthSxy && sel.entry.status !== 'silent' && sel.entry.status !== 'retired') {
    const [ex, ey] = earthSxy;
    ctx.save();
    ctx.strokeStyle = 'rgba(229,181,113,.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(sel.sx, sel.sy);
    ctx.stroke();
    ctx.restore();
    if (!scene) {
      // flat map: the one travelling pulse — frozen at midpoint under reduced motion
      const u = reducedMotion ? 0.5 : (now / 5200) % 1;
      ctx.fillStyle = PAL.delay;
      ctx.globalAlpha = reducedMotion ? 0.6 : Math.sin(u * Math.PI);
      ctx.fillRect(ex + (sel.sx - ex) * u - 1.6, ey + (sel.sy - ey) * u - 1.6, 3.2, 3.2);
      ctx.globalAlpha = 1;
    }
  }

  // --- tilted only: inbound signals. Every live craft sends a pulse home on a
  // fixed period; each one crosses at a stated scale, so a pulse from Mars
  // lands in about three seconds and one from Voyager 1 takes nearly five
  // minutes, with two dozen of them strung along the way. The data comes
  // *to* Earth, so that is the direction everything moves. Pulses brighten
  // as they close in. Nothing moves under reduced motion. ---
  if (scene && earthSxy && !reducedMotion) {
    const [ex, ey] = earthSxy;
    const tS = now / 1000;
    ctx.save();
    ctx.fillStyle = PAL.delay;
    for (const f of model.craft) {
      if (f.entry.status === 'silent' || f.entry.status === 'retired') continue;
      const owlt = f.eph.owltSeconds;
      if (!(owlt > 0)) continue;
      const trip = owlt / (LIGHT_MIN_PER_S * 60); // seconds on screen, craft to Earth
      const phase = phaseOf(f.entry.id) * PULSE_PERIOD_S;
      const first = Math.floor((tS - trip - phase) / PULSE_PERIOD_S);
      const last = Math.floor((tS - phase) / PULSE_PERIOD_S);
      let lead = -1;
      for (let k = first; k <= last; k++) {
        const u = (tS - (k * PULSE_PERIOD_S + phase)) / trip;
        if (u < 0 || u > 1) continue;
        const px = f.sx + (ex - f.sx) * u;
        const py = f.sy + (ey - f.sy) * u;
        ctx.globalAlpha = 0.3 + 0.7 * u;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        if (u > lead) lead = u;
      }
      // the selected craft's leading pulse carries its remaining light-time
      if (f === sel && lead >= 0) {
        const minutes = ((1 - lead) * owlt) / 60;
        const label = minutes >= 90 ? `${(minutes / 60).toFixed(1)} LIGHT-H OUT` : `${Math.max(1, Math.round(minutes))} LIGHT-MIN OUT`;
        ctx.globalAlpha = 1;
        labelAt(ctx, f.sx + (ex - f.sx) * lead, f.sy + (ey - f.sy) * lead, label, PAL.delay, -8);
      }
    }
    ctx.restore();
    ctx.fillStyle = PAL.faint;
    ctx.font = labelFont;
    ctx.textAlign = 'right';
    ctx.fillText(`SIGNALS INBOUND · 1 S = ${LIGHT_MIN_PER_S} LIGHT-MIN`, w - 16, 112);
  }

  // --- craft markers (imaging craft show their latest frame as a thumbnail).
  // Tilted, far craft paint first. ---
  const craft = scene
    ? [...model.craft].sort((a, b) => depthOf(...inPlane(a.x, a.y, a.lat), a.z) - depthOf(...inPlane(b.x, b.y, b.lat), b.z))
    : model.craft;
  for (const f of craft) {
    const on = f.entry.id === selectedId;
    const col = craftColor(f.entry.status, f.entry.imagery !== null);
    const img = frameImages.get(f.entry.id);
    const quiet = f.entry.status === 'silent' || f.entry.status === 'retired';

    if (ready(img)) {
      f.hitR = Math.max(chipW, chipH) / 2 + 3;
      drawChip(ctx, f.sx, f.sy, chipW, chipH, img, on, now, reducedMotion);
      labelAt(
        ctx,
        f.sx,
        f.sy,
        f.entry.name.toUpperCase(),
        on ? PAL.txt : PAL.delay,
        chipH / 2 + (on ? 15 : 12),
      );
      continue;
    }

    // plain marker (non-imaging craft, or a frame still loading)
    f.hitR = on ? 14 : 12;
    if (on) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = reducedMotion ? 0.7 : 0.55 + Math.sin(now / 420) * 0.25;
      ctx.beginPath();
      ctx.arc(f.sx, f.sy, 11, 0, TWO_PI);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(f.sx - 16, f.sy);
      ctx.lineTo(f.sx - 8, f.sy);
      ctx.moveTo(f.sx + 8, f.sy);
      ctx.lineTo(f.sx + 16, f.sy);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.fillRect(f.sx - 2.5, f.sy - 2.5, 5, 5);
    labelAt(
      ctx,
      f.sx,
      f.sy,
      f.entry.name.toUpperCase(),
      on ? PAL.txt : quiet ? '#39414F' : PAL.dim,
      on ? 24 : 14,
    );
  }
}

/** Draw one craft's frame as a framed, amber-bordered thumbnail centred at (cx,cy). */
export function drawChip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  img: HTMLImageElement,
  selected: boolean,
  now: number,
  reducedMotion: boolean,
): void {
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);

  // object-fit: cover crop
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;

  ctx.save();
  // dark backing + clip
  ctx.fillStyle = '#0A0D12';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  // bottom gradient so the label stays legible over bright terrain
  const grad = ctx.createLinearGradient(0, y + h - h * 0.5, 0, y + h);
  grad.addColorStop(0, 'rgba(6,8,11,0)');
  grad.addColorStop(1, 'rgba(6,8,11,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + h * 0.5, w, h * 0.5);
  ctx.restore();

  // amber frame — imaging craft are amber by the colour rule
  ctx.strokeStyle = PAL.delay;
  ctx.lineWidth = 1;
  ctx.globalAlpha = selected ? 1 : 0.85;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = 1;

  if (selected) {
    // pulsing outer bracket
    ctx.strokeStyle = PAL.delay;
    ctx.globalAlpha = reducedMotion ? 0.8 : 0.5 + Math.sin(now / 420) * 0.25;
    const p = 4;
    ctx.strokeRect(x - p + 0.5, y - p + 0.5, w + 2 * p - 1, h + 2 * p - 1);
    ctx.globalAlpha = 1;
  }
}

function labelAt(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  text: string,
  color: string,
  dy: number,
): void {
  ctx.fillStyle = color;
  ctx.font = labelFont;
  ctx.textAlign = 'center';
  ctx.fillText(text, sx, sy + dy);
}

/** Relative on-map body sizes — not to scale, but roughly true proportions
 *  (gas giants clearly larger, Mercury/Mars/Moon smallest). */
export const PLANET_R: Record<string, number> = {
  mercury: 2.0,
  venus: 2.9,
  earth: 3.1,
  moon: 1.9,
  mars: 2.4,
  jupiter: 6.4,
  saturn: 5.6,
  uranus: 4.2,
  neptune: 4.1,
};
