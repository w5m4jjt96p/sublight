// Log-radial projection — ported verbatim from the prototype.
// World space is heliocentric: the Sun sits at (0,0). A body's map radius is a
// logarithmic function of its true distance in AU, so Voyager (170 AU) and Mars
// (1.5 AU) can share one frame. Angle is the real ecliptic longitude.

export const R_MAX = 1000;
export const K = 400;
const DEN = Math.log10(1 + 200 * K);

/** AU → world radius (log-compressed). */
export function rOf(au: number): number {
  return (R_MAX * Math.log10(1 + au * K)) / DEN;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/** (AU, ecliptic-longitude °) → world coordinates. deg-90 keeps 0° pointing up. */
export function worldPos(au: number, deg: number): WorldPoint {
  const a = ((deg - 90) * Math.PI) / 180;
  const r = rOf(au);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}
