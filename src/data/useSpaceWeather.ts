// Live space-weather poll. Seeds from the CI snapshot (public/data/spaceweather.json)
// for an instant first paint, then refreshes directly from NOAA SWPC every 60s
// (CORS is open). Failures degrade silently to the last good value.
import { useEffect, useState } from 'react';
import type { SpaceWeather } from '../types.ts';
import { fetchSpaceWeather } from './spaceWeather.ts';

const POLL_MS = 60_000;

export function useSpaceWeather(): SpaceWeather | null {
  const [w, setW] = useState<SpaceWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL;

    // Seed from the snapshot first (never blocks on the live fetch).
    fetch(`${base}data/spaceweather.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((seed) => {
        if (!cancelled && seed) setW((prev) => prev ?? (seed as SpaceWeather));
      })
      .catch(() => {});

    const poll = async () => {
      try {
        const fresh = await fetchSpaceWeather();
        if (!cancelled) setW(fresh);
      } catch {
        // keep the previous value
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return w;
}
