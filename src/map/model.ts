// The render model: registry + live ephemerides fused into the objects the
// canvas actually draws. Positions move in real time: each body carries its
// heliocentric position today and at J+1, and `advance()` interpolates between
// them by the fraction of the day elapsed — so the whole system creeps along
// its orbits at true speed. Screen coordinates (`sx`,`sy`) are filled by render.
import type { RegistryEntry, CraftEphemeris, PlanetEphemeris } from '../types.ts';
import { worldPos, type WorldPoint } from './projection.ts';
import { anchorMs, dayFraction } from '../data/lightTime.ts';

/** Heliocentric position today / next-day, in the form the interpolator needs. */
interface Orbit {
  auT: number;
  auN: number;
  lonT: number;
  lonN: number;
}

export interface Cluster {
  /** Anchor in world space (first member's current position). */
  x: number;
  y: number;
  /** Unit vector pointing away from the Sun; the fan opens along it. */
  ux: number;
  uy: number;
  members: MapCraft[];
  /** Per-frame anchor in screen space. */
  ax: number;
  ay: number;
}

export interface MapCraft extends Orbit {
  entry: RegistryEntry;
  eph: CraftEphemeris;
  /** Current world position (updated each frame by advance()). */
  x: number;
  y: number;
  /** Screen position (fanned), set during render. */
  sx: number;
  sy: number;
  cluster: Cluster;
  clusterIndex: number;
  /** Click radius in screen px, updated each frame (larger for thumbnails). */
  hitR: number;
}

export interface MapPlanet extends Orbit {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Drawn screen position + click radius, set during render. */
  sx: number;
  sy: number;
  hitR: number;
}

export interface MapModel {
  craft: MapCraft[];
  planets: MapPlanet[];
  earth: MapPlanet | null;
  clusters: Cluster[];
  generatedAt: string;
  /** UTC midnight of the build day — the interpolation anchor. */
  anchorMs: number;
}

/** Co-location threshold in world units (matches the prototype's 16). */
const CLUSTER_DIST = 16;

/** Interpolated world position between today and next-day (shortest-arc in lon). */
function interpPosition(o: Orbit, frac: number): WorldPoint {
  const au = o.auT + (o.auN - o.auT) * frac;
  const d = ((((o.lonN - o.lonT) % 360) + 540) % 360) - 180; // [-180,180]
  return worldPos(au, o.lonT + d * frac);
}

export function buildModel(
  registry: RegistryEntry[],
  fleet: CraftEphemeris[],
  planetsRaw: PlanetEphemeris[],
  generatedAt: string,
): MapModel {
  const anchor = anchorMs(generatedAt);
  const frac = dayFraction(anchor);
  const ephById = new Map(fleet.map((c) => [c.id, c]));

  const craft: MapCraft[] = [];
  for (const entry of registry) {
    const eph = ephById.get(entry.id);
    if (!eph) continue; // omitted from fleet.json (no data, no previous) — skip honestly
    const orbit: Orbit = {
      auT: eph.heliocentricAu,
      auN: eph.heliocentricAuNextDay ?? eph.heliocentricAu,
      lonT: eph.eclipticLonDeg,
      lonN: eph.eclipticLonDegNextDay ?? eph.eclipticLonDeg,
    };
    const w = interpPosition(orbit, frac);
    craft.push({
      ...orbit,
      entry,
      eph,
      x: w.x,
      y: w.y,
      sx: w.x,
      sy: w.y,
      cluster: null as unknown as Cluster,
      clusterIndex: 0,
      hitR: 18,
    });
  }

  // --- clustering (membership fixed at build; anchors move with the bodies) ---
  const clusters: Cluster[] = [];
  for (const c of craft) {
    let g = clusters.find((g) => Math.hypot(g.x - c.x, g.y - c.y) < CLUSTER_DIST);
    if (!g) {
      g = { x: c.x, y: c.y, ux: 0, uy: 0, members: [], ax: 0, ay: 0 };
      clusters.push(g);
    }
    c.cluster = g;
    c.clusterIndex = g.members.length;
    g.members.push(c);
  }
  for (const g of clusters) {
    const d = Math.hypot(g.x, g.y) || 1;
    g.ux = g.x / d;
    g.uy = g.y / d;
  }

  const planets: MapPlanet[] = planetsRaw.map((p) => {
    const orbit: Orbit = {
      auT: p.heliocentricAu,
      auN: p.heliocentricAuNextDay ?? p.heliocentricAu,
      lonT: p.eclipticLonDeg,
      lonN: p.eclipticLonDegNextDay ?? p.eclipticLonDeg,
    };
    const w = interpPosition(orbit, frac);
    return { id: p.id, name: p.name, ...orbit, x: w.x, y: w.y, sx: w.x, sy: w.y, hitR: 12 };
  });
  const earth = planets.find((p) => p.id === 'earth') ?? null;

  return { craft, planets, earth, clusters, generatedAt, anchorMs: anchor };
}

/** Recompute every body's world position (and cluster anchors) for `nowMs`. */
export function advance(model: MapModel, nowMs: number): void {
  const frac = dayFraction(model.anchorMs, nowMs);
  for (const c of model.craft) {
    const w = interpPosition(c, frac);
    c.x = w.x;
    c.y = w.y;
  }
  for (const p of model.planets) {
    const w = interpPosition(p, frac);
    p.x = w.x;
    p.y = w.y;
  }
  for (const g of model.clusters) {
    const m0 = g.members[0];
    if (!m0) continue;
    g.x = m0.x;
    g.y = m0.y;
    const d = Math.hypot(g.x, g.y) || 1;
    g.ux = g.x / d;
    g.uy = g.y / d;
  }
}
