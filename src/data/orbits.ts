// ---------------------------------------------------------------------------
// orbits.ts — a small, self-contained orbital propagator for the near-Earth
// view. No npm dependency (the app ships "no runtime dependency beyond React"),
// so this is a hand-written Keplerian propagation of the TLE mean elements with
// the two dominant J2 secular drifts (nodal regression, apsidal precession,
// mean-anomaly correction) applied.
//
// What is honest here: every DISPLAYED number — altitude, orbital speed, period
// and light-time — derives from the mean motion via Kepler's third law and
// vis-viva, so it is accurate to well within a light-millisecond. What is
// approximate is the exact on-screen ANGLE (we omit SGP4's short-period and
// drag terms); no numeric value is shown for it, and today's epoch keeps the
// along-track drift small. See About copy.
// ---------------------------------------------------------------------------
import type { SatelliteRecord, OrbitBand } from '../types.ts';

export const MU = 398600.4418; // Earth GM, km^3/s^2
export const R_EARTH = 6378.137; // equatorial radius, km
const J2 = 1.08262668e-3;
const C_KM_S = 299792.458; // speed of light, km/s
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const DAY_S = 86400;

/** Semi-major axis (km) from mean motion in rev/day. */
export function semiMajorAxis(meanMotionRevPerDay: number): number {
  const n = (meanMotionRevPerDay * TWO_PI) / DAY_S; // rad/s
  return Math.cbrt(MU / (n * n));
}

/** Coarse altitude band from mean motion, used at fetch time. */
export function bandOf(meanMotionRevPerDay: number, eccentricity: number): OrbitBand {
  const a = semiMajorAxis(meanMotionRevPerDay);
  const perigee = a * (1 - eccentricity) - R_EARTH;
  const apogee = a * (1 + eccentricity) - R_EARTH;
  if (apogee - perigee > 20000) return 'HEO'; // highly eccentric (Molniya etc.)
  const alt = a - R_EARTH;
  if (alt < 2000) return 'LEO';
  if (alt < 30000) return 'MEO';
  return 'GEO';
}

export interface OrbitState {
  /** ECI position, km. */
  x: number;
  y: number;
  z: number;
  /** Geocentric distance, km. */
  r: number;
  /** Altitude above the mean surface, km. */
  altitude: number;
  /** Instantaneous orbital speed, km/s (vis-viva). */
  speed: number;
  /** Orbital period, minutes. */
  periodMin: number;
  /** One-way light time from the surface directly below (altitude / c), seconds. */
  lightSeconds: number;
}

/** Solve Kepler's equation M = E - e sinE for E (radians), Newton-Raphson. */
function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Propagate one satellite's mean elements to time `atMs`.
 * Keplerian orbit + J2 secular rates on Ω, ω and M. Returns geocentric ECI
 * position and the derived scalar quantities we display.
 */
export function propagate(sat: SatelliteRecord, atMs: number): OrbitState {
  const n0 = (sat.meanMotion * TWO_PI) / DAY_S; // rad/s
  const a = Math.cbrt(MU / (n0 * n0)); // km
  const e = sat.eccentricity;
  const i = sat.inclination * DEG;

  const dt = (atMs - sat.epochMs) / 1000; // seconds since epoch

  // J2 secular rates (rad/s). p is the semi-latus rectum.
  const p = a * (1 - e * e);
  const cosi = Math.cos(i);
  const sini2 = Math.sin(i) * Math.sin(i);
  const factor = 1.5 * J2 * (R_EARTH / p) * (R_EARTH / p) * n0;
  const raanDot = -factor * cosi;
  const argpDot = factor * (2 - 2.5 * sini2);
  const mDot = n0 + factor * Math.sqrt(1 - e * e) * (1 - 1.5 * sini2);

  const raan = sat.raan * DEG + raanDot * dt;
  const argp = sat.argPerigee * DEG + argpDot * dt;
  const M = sat.meanAnomaly * DEG + mDot * dt;

  const E = eccentricAnomaly(((M % TWO_PI) + TWO_PI) % TWO_PI, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = a * (1 - e * cosE); // km

  // Position in the perifocal frame.
  const xp = a * (cosE - e);
  const yp = a * Math.sqrt(1 - e * e) * sinE;

  // Rotate perifocal → ECI by (argp, inclination, raan).
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosw = Math.cos(argp);
  const sinw = Math.sin(argp);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);

  const x11 = cosO * cosw - sinO * sinw * cosI;
  const x12 = -cosO * sinw - sinO * cosw * cosI;
  const x21 = sinO * cosw + cosO * sinw * cosI;
  const x22 = -sinO * sinw + cosO * cosw * cosI;
  const x31 = sinw * sinI;
  const x32 = cosw * sinI;

  const x = x11 * xp + x12 * yp;
  const y = x21 * xp + x22 * yp;
  const z = x31 * xp + x32 * yp;

  const altitude = r - R_EARTH;
  const speed = Math.sqrt(MU * (2 / r - 1 / a)); // km/s
  const periodMin = (TWO_PI / n0) / 60;
  const lightSeconds = Math.max(0, altitude) / C_KM_S;

  return { x, y, z, r, altitude, speed, periodMin, lightSeconds };
}

/** Perigee altitude (km) — the decay indicator. */
export function perigeeAltitude(sat: SatelliteRecord): number {
  const a = semiMajorAxis(sat.meanMotion);
  return a * (1 - sat.eccentricity) - R_EARTH;
}
