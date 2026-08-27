// Shared formatters. The em dash is the honest placeholder for missing data.
export const EMDASH = '—';

/** Seconds → compact duration, e.g. "16m 48s", "23h 42m", "4.20 s". */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return EMDASH;
  const s = seconds;
  if (s < 60) return `${s.toFixed(2).replace(/\.?0+$/, '')} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

/**
 * Light-time with a unit that suits its scale: milliseconds for near-Earth
 * (ISS ~1.4 ms), seconds up to a minute, then the compact duration form.
 */
export function fmtLight(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return EMDASH;
  if (seconds < 1) return `${(seconds * 1000).toFixed(seconds < 0.1 ? 1 : 0)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2).replace(/\.?0+$/, '')} s`;
  return fmtDuration(seconds);
}

/**
 * A light-year distance rendered as the age of the light: "1,344 years",
 * "2.5 million years", "13.2 billion years". This is the light-travel time.
 */
export function fmtLightYears(ly: number | null | undefined): string {
  if (ly == null || !isFinite(ly)) return EMDASH;
  if (ly >= 1e9) return `${(ly / 1e9).toFixed(1).replace(/\.0$/, '')} billion years`;
  if (ly >= 1e6) return `${(ly / 1e6).toFixed(1).replace(/\.0$/, '')} million years`;
  if (ly >= 1e5) return `${Math.round(ly / 1e3)},000 years`;
  return `${Math.round(ly).toLocaleString('en-US')} years`;
}

/** Kilometres with adaptive precision + thousands separators. */
export function fmtKm(km: number | null | undefined): string {
  if (km == null || !isFinite(km)) return EMDASH;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** Seconds → clock-style age, e.g. "16:48" or "23:42:07". */
export function fmtClock(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return EMDASH;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** AU with adaptive precision. */
export function fmtAu(au: number | null | undefined): string {
  if (au == null || !isFinite(au)) return EMDASH;
  return `${au < 0.01 ? au.toFixed(4) : au.toFixed(2)} AU`;
}

/** UTC HH:MM from an ISO string. */
export function fmtUtcHm(iso: string | null | undefined): string {
  if (!iso) return EMDASH;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return EMDASH;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Elapsed time since an ISO instant → "4h 12m", "9d", "just now". */
export function fmtSince(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return EMDASH;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return EMDASH;
  const s = Math.max(0, (nowMs - then) / 1000);
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Whole days between two ISO dates (mission duration). */
export function fmtMissionDays(launched: string, nowMs = Date.now()): string {
  const start = new Date(launched).getTime();
  if (isNaN(start)) return EMDASH;
  const days = Math.floor((nowMs - start) / 86400_000);
  const years = (days / 365.25).toFixed(1);
  return `${days.toLocaleString('en-US')} days · ${years} yr`;
}
