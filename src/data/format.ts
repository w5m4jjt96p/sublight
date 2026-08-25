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
