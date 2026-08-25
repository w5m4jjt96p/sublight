// ---------------------------------------------------------------------------
// Thin, well-documented client for the JPL Horizons API.
//   https://ssd.jpl.nasa.gov/api/horizons.api
// No key required. Horizons answers with JSON whose `result` field is a block
// of semi-structured text; we pull the vector table out of it.
// ---------------------------------------------------------------------------

const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/** 1 AU expressed in light-seconds (IAU 2012 definition). */
export const LIGHT_SECONDS_PER_AU = 499.004783836;

export interface StateVector {
  /** AU */
  x: number;
  y: number;
  z: number;
}

export interface EclipticPosition {
  /** Heliocentric (or centre-relative) radius, AU. */
  radiusAu: number;
  /** Ecliptic longitude, degrees in [0,360). */
  lonDeg: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build the query for a geometric cartesian-state request. */
function vectorParams(command: string, center: string, start: Date): URLSearchParams {
  const stop = new Date(start.getTime() + 2 * 86400_000); // +2d guarantees ≥2 rows
  return new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'${center}'`,
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    VEC_TABLE: '1', // position only — all we need
    OUT_UNITS: 'AU-D',
    START_TIME: `'${isoDay(start)}'`,
    STOP_TIME: `'${isoDay(stop)}'`,
    STEP_SIZE: '1d',
    CSV_FORMAT: 'NO',
  });
}

export interface HorizonsRawResult {
  ok: boolean;
  raw: string;
  signature?: unknown;
}

/** Low-level: return the raw `result` text, no parsing. Used by the probe. */
export async function fetchHorizonsRaw(
  command: string,
  center: string,
  start = new Date(),
): Promise<HorizonsRawResult> {
  const url = `${HORIZONS}?${vectorParams(command, center, start)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return { ok: false, raw: `HTTP ${res.status}` };
  const json = (await res.json()) as { result?: string; signature?: unknown };
  return { ok: true, raw: json.result ?? '', signature: json.signature };
}

const NUM = '[-+]?\\d+\\.?\\d*(?:E[-+]?\\d+)?';

/**
 * Parse the first two state-vector rows from a Horizons result block.
 * Returns [today, nextDay]; nextDay is null if only one row is present.
 * Throws when the block has no $$SOE section (craft not resolvable).
 */
export function parseStateVectors(raw: string): [StateVector, StateVector | null] {
  const soe = raw.indexOf('$$SOE');
  const eoe = raw.indexOf('$$EOE');
  if (soe < 0 || eoe < 0) {
    throw new Error('no ephemeris block ($$SOE) in Horizons response');
  }
  const block = raw.slice(soe + 5, eoe);
  const re = new RegExp(`X\\s*=\\s*(${NUM})\\s+Y\\s*=\\s*(${NUM})\\s+Z\\s*=\\s*(${NUM})`, 'g');
  const rows: StateVector[] = [];
  for (const m of block.matchAll(re)) {
    rows.push({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) });
    if (rows.length === 2) break;
  }
  if (rows.length === 0) throw new Error('found $$SOE but no X/Y/Z rows');
  return [rows[0]!, rows[1] ?? null];
}

/** Magnitude of a state vector, AU. */
export function magnitude(v: StateVector): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Radius + ecliptic longitude from a state vector. */
export function toEcliptic(v: StateVector): EclipticPosition {
  const lon = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  return { radiusAu: magnitude(v), lonDeg: (lon + 360) % 360 };
}

export interface HorizonsGeometry {
  helio: EclipticPosition;
  /** Heliocentric position at J+1, for smooth client-side orbital motion. */
  helioNextDay: EclipticPosition;
  rangeAu: number;
  rangeAuNextDay: number;
  owltSeconds: number;
}

/**
 * Resolve a body's map geometry: heliocentric position (CENTER 500@10) plus
 * geocentric range today and next-day (CENTER 500@399) for client interpolation.
 * Throws if either query has no ephemeris block.
 */
export async function fetchGeometry(command: string, start = new Date()): Promise<HorizonsGeometry> {
  const [helioRes, geoRes] = await Promise.all([
    fetchHorizonsRaw(command, '500@10', start),
    fetchHorizonsRaw(command, '500@399', start),
  ]);
  if (!helioRes.ok) throw new Error(`heliocentric request failed: ${helioRes.raw}`);
  if (!geoRes.ok) throw new Error(`geocentric request failed: ${geoRes.raw}`);

  const [helioToday, helioNext] = parseStateVectors(helioRes.raw);
  const [geoToday, geoNext] = parseStateVectors(geoRes.raw);

  const rangeAu = magnitude(geoToday);
  const rangeAuNextDay = geoNext ? magnitude(geoNext) : rangeAu;

  return {
    helio: toEcliptic(helioToday),
    helioNextDay: toEcliptic(helioNext ?? helioToday),
    rangeAu,
    rangeAuNextDay,
    owltSeconds: rangeAu * LIGHT_SECONDS_PER_AU,
  };
}
