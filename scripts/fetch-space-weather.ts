// ---------------------------------------------------------------------------
// fetch-space-weather.ts — daily NOAA SWPC snapshot → public/data/spaceweather.json.
// Only a seed / fallback: the browser also polls SWPC live (CORS is open).
// Non-fatal: on failure an empty-but-valid record is written so the client
// fetch never 404s.
// ---------------------------------------------------------------------------
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { SpaceWeather } from '../src/types.ts';
import { fetchSpaceWeather } from '../src/data/spaceWeather.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'spaceweather.json');

async function main() {
  let w: SpaceWeather;
  try {
    w = await fetchSpaceWeather();
    console.log(
      `space weather: Kp ${w.kp ?? '—'} · G${w.gScale ?? 0} R${w.rScale ?? 0} S${w.sScale ?? 0} · ` +
        `wind ${w.windSpeed ?? '—'} km/s · Bz ${w.bz ?? '—'} nT`,
    );
  } catch (err) {
    console.warn(`space weather snapshot skipped (non-fatal): ${(err as Error).message}`);
    w = {
      generatedAt: new Date().toISOString(),
      kp: null, gScale: null, rScale: null, sScale: null,
      windSpeed: null, bz: null, bt: null, sampledAt: null,
    };
  }
  await writeFile(OUT, JSON.stringify(w, null, 2) + '\n');
}

main().catch((err) => {
  console.error('fetch-space-weather fatal:', err);
  process.exitCode = 1;
});
