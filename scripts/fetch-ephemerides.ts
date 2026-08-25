// ---------------------------------------------------------------------------
// fetch-ephemerides.ts
// Reads the editorial registry, resolves every craft's live geometry from JPL
// Horizons, and writes /public/data/fleet.json + /public/data/planets.json.
//
// Failure rule (from the brief): a craft that cannot be resolved keeps its last
// good value with `stale: true`. We never invent a number, and one bad craft
// never fails the whole build.
// ---------------------------------------------------------------------------
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
  Registry,
  RegistryEntry,
  FleetData,
  CraftEphemeris,
  PlanetEphemeris,
  PlanetsData,
  HostBody,
} from '../src/types.ts';
import { fetchGeometry } from './horizons.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'data', 'registry.json');
const FLEET_OUT = join(ROOT, 'public', 'data', 'fleet.json');
const PLANETS_OUT = join(ROOT, 'public', 'data', 'planets.json');

/** Horizons centre codes for host bodies. */
const HOST_CODE: Record<HostBody, string> = {
  mercury: '199',
  venus: '299',
  earth: '399',
  moon: '301',
  mars: '499',
  jupiter: '599',
  saturn: '699',
  uranus: '799',
  neptune: '899',
};

/** Bodies plotted as rings/icons: the eight planets (Earth = origin) + the Moon. */
const PLANETS: { id: string; name: string; code: string }[] = [
  { id: 'mercury', name: 'Mercury', code: '199' },
  { id: 'venus', name: 'Venus', code: '299' },
  { id: 'earth', name: 'Earth', code: '399' },
  { id: 'moon', name: 'Moon', code: '301' },
  { id: 'mars', name: 'Mars', code: '499' },
  { id: 'jupiter', name: 'Jupiter', code: '599' },
  { id: 'saturn', name: 'Saturn', code: '699' },
  { id: 'uranus', name: 'Uranus', code: '799' },
  { id: 'neptune', name: 'Neptune', code: '899' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ordered list of Horizons commands to try for a craft. */
function candidates(entry: RegistryEntry): string[] {
  const list: string[] = [];
  if (entry.naifId !== null) list.push(String(entry.naifId));
  if (entry.host) list.push(HOST_CODE[entry.host]);
  return list;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readPrevious(): Promise<Map<string, CraftEphemeris>> {
  try {
    const prev = await readJson<FleetData>(FLEET_OUT);
    return new Map(prev.craft.map((c) => [c.id, c]));
  } catch {
    return new Map();
  }
}

async function resolveCraft(
  entry: RegistryEntry,
  previous: Map<string, CraftEphemeris>,
): Promise<CraftEphemeris | null> {
  const cmds = candidates(entry);
  if (cmds.length === 0) {
    console.warn(`  ! ${entry.name}: no naifId and no host — cannot resolve, skipping`);
    return staleOrNull(entry, previous);
  }

  for (const cmd of cmds) {
    try {
      const g = await fetchGeometry(cmd);
      const via = cmd === String(entry.naifId) ? 'direct' : 'host';
      console.log(
        `  ✓ ${entry.name.padEnd(20)} ${g.helio.radiusAu.toFixed(3).padStart(8)} AU  ` +
          `owlt ${fmtOwlt(g.owltSeconds).padStart(7)}  via ${cmd} (${via})`,
      );
      return {
        id: entry.id,
        heliocentricAu: round(g.helio.radiusAu, 6),
        eclipticLonDeg: round(g.helio.lonDeg, 4),
        heliocentricAuNextDay: round(g.helioNextDay.radiusAu, 6),
        eclipticLonDegNextDay: round(g.helioNextDay.lonDeg, 4),
        rangeAu: round(g.rangeAu, 6),
        rangeAuNextDay: round(g.rangeAuNextDay, 6),
        owltSeconds: round(g.owltSeconds, 3),
        source: `horizons:${cmd}`,
      };
    } catch (err) {
      console.warn(`    · ${entry.name}: command ${cmd} failed (${(err as Error).message})`);
      await sleep(200);
    }
  }

  console.warn(`  ! ${entry.name}: all commands failed — reusing last good value`);
  return staleOrNull(entry, previous);
}

function staleOrNull(
  entry: RegistryEntry,
  previous: Map<string, CraftEphemeris>,
): CraftEphemeris | null {
  const prev = previous.get(entry.id);
  if (!prev) {
    console.error(`  !! ${entry.name}: no previous value either — omitted from fleet.json`);
    return null;
  }
  return { ...prev, stale: true };
}

// horizons.ts returns a plain number; this tiny shim keeps the log column tidy.
function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
function fmtOwlt(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

async function main() {
  const registry = await readJson<Registry>(REGISTRY);
  const previous = await readPrevious();
  const generatedAt = new Date().toISOString();

  console.log(`\nHorizons ephemerides — ${registry.length} craft, ${PLANETS.length} planets`);
  console.log(`generatedAt = ${generatedAt}\n`);

  // --- craft ---
  const craft: CraftEphemeris[] = [];
  for (const entry of registry) {
    const resolved = await resolveCraft(entry, previous);
    if (resolved) craft.push(resolved);
    await sleep(250);
  }

  // --- planets + Moon ---
  console.log('\nPlanets:');
  const planets: PlanetEphemeris[] = [];
  for (const p of PLANETS) {
    try {
      const g = await fetchGeometry(p.code);
      planets.push({
        id: p.id,
        name: p.name,
        heliocentricAu: round(g.helio.radiusAu, 6),
        eclipticLonDeg: round(g.helio.lonDeg, 4),
        heliocentricAuNextDay: round(g.helioNextDay.radiusAu, 6),
        eclipticLonDegNextDay: round(g.helioNextDay.lonDeg, 4),
      });
      console.log(`  ✓ ${p.name.padEnd(10)} ${g.helio.radiusAu.toFixed(3)} AU`);
    } catch (err) {
      console.warn(`  ! ${p.name}: ${(err as Error).message}`);
    }
    await sleep(250);
  }

  await writeFile(FLEET_OUT, JSON.stringify({ generatedAt, craft } satisfies FleetData, null, 2) + '\n');
  await writeFile(
    PLANETS_OUT,
    JSON.stringify({ generatedAt, planets } satisfies PlanetsData, null, 2) + '\n',
  );

  const staleCount = craft.filter((c) => c.stale).length;
  console.log(`\nWrote ${craft.length} craft (${staleCount} stale) and ${planets.length} planets.`);
  if (craft.length < registry.length) {
    console.warn(`WARNING: ${registry.length - craft.length} craft missing from fleet.json`);
  }
}

main().catch((err) => {
  console.error('fetch-ephemerides fatal:', err);
  process.exitCode = 1;
});
