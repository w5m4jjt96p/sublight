// Client-side light-time interpolation. fleet.json carries the geocentric range
// at 00:00 UTC of the build day (rangeAu) and 24h later (rangeAuNextDay). We
// lerp between them by the fraction of the day elapsed, so the number drifts
// smoothly through the day instead of jumping once at build time.
import type { CraftEphemeris } from '../types.ts';

export const LIGHT_SECONDS_PER_AU = 499.004783836;

/** UTC midnight of the build day, in ms. */
export function anchorMs(generatedAt: string): number {
  const d = new Date(generatedAt);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Fraction [0,1] of the build day elapsed at `nowMs` — the interpolation knob. */
export function dayFraction(anchor: number, nowMs = Date.now()): number {
  return Math.min(1, Math.max(0, (nowMs - anchor) / 86400_000));
}

/** Interpolated one-way light time, seconds, for `nowMs`. */
export function owltAt(eph: CraftEphemeris, generatedAt: string, nowMs = Date.now()): number {
  const t0 = anchorMs(generatedAt);
  const frac = Math.min(1, Math.max(0, (nowMs - t0) / 86400_000));
  const range = eph.rangeAu + (eph.rangeAuNextDay - eph.rangeAu) * frac;
  return range * LIGHT_SECONDS_PER_AU;
}

/** Interpolated geocentric range, AU, for `nowMs`. */
export function rangeAt(eph: CraftEphemeris, generatedAt: string, nowMs = Date.now()): number {
  const t0 = anchorMs(generatedAt);
  const frac = Math.min(1, Math.max(0, (nowMs - t0) / 86400_000));
  return eph.rangeAu + (eph.rangeAuNextDay - eph.rangeAu) * frac;
}
