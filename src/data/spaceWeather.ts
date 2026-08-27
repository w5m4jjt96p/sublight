// ---------------------------------------------------------------------------
// spaceWeather.ts — NOAA SWPC fetch + assembly, shared by the CI snapshot and
// the browser's live poll (SWPC serves Access-Control-Allow-Origin: *, so the
// client fetches directly, exactly like the DSN feed).
//
// Every field is a measured value or a dash; nothing is invented. Individual
// products can fail independently without taking down the rest.
// ---------------------------------------------------------------------------
import type { SpaceWeather } from '../types.ts';

const BASE = 'https://services.swpc.noaa.gov';
export const SWPC = {
  kp: `${BASE}/products/noaa-planetary-k-index.json`,
  scales: `${BASE}/products/noaa-scales.json`,
  wind: `${BASE}/products/summary/solar-wind-speed.json`,
  mag: `${BASE}/products/summary/solar-wind-mag-field.json`,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(`${url}?cachebust=${Math.floor(Date.now() / 60000)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Latest planetary Kp from the [time_tag, Kp, ...] product. */
export function parseKp(rows: Array<{ Kp?: number }> | unknown): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const last = rows[rows.length - 1] as { Kp?: number };
  return typeof last?.Kp === 'number' ? last.Kp : null;
}

interface ScaleBlock {
  R?: { Scale?: string | null };
  S?: { Scale?: string | null };
  G?: { Scale?: string | null };
}
/** Current observed R/S/G scales from noaa-scales.json (key "0"). */
export function parseScales(obj: unknown): Pick<SpaceWeather, 'rScale' | 'sScale' | 'gScale'> {
  const cur = (obj as Record<string, ScaleBlock> | null)?.['0'];
  const num = (v: string | null | undefined) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return { rScale: num(cur?.R?.Scale), sScale: num(cur?.S?.Scale), gScale: num(cur?.G?.Scale) };
}

/** Assemble a SpaceWeather record from the four (possibly failed) payloads. */
export function assemble(
  kpRows: unknown,
  scales: unknown,
  wind: unknown,
  mag: unknown,
): SpaceWeather {
  const windRow = Array.isArray(wind) ? (wind[0] as { proton_speed?: number; time_tag?: string }) : null;
  const magRow = Array.isArray(mag) ? (mag[0] as { bt?: number; bz_gsm?: number; time_tag?: string }) : null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    generatedAt: new Date().toISOString(),
    kp: parseKp(kpRows),
    ...parseScales(scales),
    windSpeed: num(windRow?.proton_speed),
    bz: num(magRow?.bz_gsm),
    bt: num(magRow?.bt),
    sampledAt: windRow?.time_tag ?? magRow?.time_tag ?? null,
  };
}

/** Fetch all four products in parallel; tolerate individual failures. */
export async function fetchSpaceWeather(): Promise<SpaceWeather> {
  const [kp, scales, wind, mag] = await Promise.all([
    getJson(SWPC.kp).catch(() => null),
    getJson(SWPC.scales).catch(() => null),
    getJson(SWPC.wind).catch(() => null),
    getJson(SWPC.mag).catch(() => null),
  ]);
  return assemble(kp, scales, wind, mag);
}

/** NOAA storm level → short human label, for the headline line. */
export function stormLabel(w: SpaceWeather): { text: string; level: number } {
  const g = w.gScale ?? 0;
  const level = g;
  if (g >= 4) return { text: 'Severe geomagnetic storm', level };
  if (g >= 3) return { text: 'Strong geomagnetic storm', level };
  if (g >= 1) return { text: 'Geomagnetic storm', level };
  if ((w.kp ?? 0) >= 4) return { text: 'Unsettled field', level };
  return { text: 'Quiet field', level };
}
