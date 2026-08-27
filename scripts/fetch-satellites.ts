// ---------------------------------------------------------------------------
// fetch-satellites.ts — daily snapshot of near-Earth orbit mean-elements.
// Pulls a curated set of objects from CelesTrak's GP (general-perturbations)
// service as OMM JSON and writes public/data/satellites.json. The browser
// propagates these live (see src/data/orbits.ts), so a once-a-day snapshot is
// enough: TLE mean elements stay valid for days.
//
// Zero backend: CelesTrak is fetched here in CI, never from the client.
// Failure is non-fatal — the last good satellites.json is kept.
// ---------------------------------------------------------------------------
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { SatelliteRecord, SatellitesData } from '../src/types.ts';
import { bandOf } from '../src/data/orbits.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'data', 'near-earth.json');
const OUT = join(ROOT, 'public', 'data', 'satellites.json');

const GP = 'https://celestrak.org/NORAD/elements/gp.php';

interface Hero {
  norad: number;
  name: string;
  note?: string;
}
interface GroupSpec {
  group: string;
  cap: number;
}
interface Catalog {
  heroes: Hero[];
  groups: GroupSpec[];
}

/** One OMM record as CelesTrak returns it (subset we use). */
interface Omm {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  MEAN_MOTION_DOT: number;
}

async function getOmm(query: string): Promise<Omm[]> {
  const res = await fetch(`${GP}?${query}&FORMAT=json`, {
    headers: { 'User-Agent': 'sublight.observer (near-Earth snapshot)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${query}`);
  const data = (await res.json()) as Omm[];
  if (!Array.isArray(data)) throw new Error(`unexpected payload for ${query}`);
  return data;
}

function toRecord(o: Omm, group: string, name?: string, note?: string): SatelliteRecord {
  const rec: SatelliteRecord = {
    norad: o.NORAD_CAT_ID,
    name: name ?? o.OBJECT_NAME,
    group,
    band: bandOf(o.MEAN_MOTION, o.ECCENTRICITY),
    epochMs: Date.parse(o.EPOCH.endsWith('Z') ? o.EPOCH : `${o.EPOCH}Z`),
    meanMotion: o.MEAN_MOTION,
    eccentricity: o.ECCENTRICITY,
    inclination: o.INCLINATION,
    raan: o.RA_OF_ASC_NODE,
    argPerigee: o.ARG_OF_PERICENTER,
    meanAnomaly: o.MEAN_ANOMALY,
    meanMotionDot: o.MEAN_MOTION_DOT,
  };
  if (note) rec.note = note;
  return rec;
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG, 'utf8')) as Catalog;
  const byId = new Map<number, SatelliteRecord>();

  // Heroes first, so their curated names/notes win over any group duplicate.
  for (const h of catalog.heroes) {
    try {
      const [o] = await getOmm(`CATNR=${h.norad}`);
      if (!o) throw new Error('no element set returned');
      byId.set(h.norad, toRecord(o, 'hero', h.name, h.note));
      console.log(`  ✓ hero ${h.name} (${h.norad}) — ${byId.get(h.norad)!.band}`);
    } catch (err) {
      console.warn(`  ! hero ${h.name} (${h.norad}) skipped: ${(err as Error).message}`);
    }
  }

  for (const g of catalog.groups) {
    try {
      const list = await getOmm(`GROUP=${encodeURIComponent(g.group)}`);
      // Deterministic thinning: sort by NORAD id then take an even stride so a
      // capped group still spans the whole constellation rather than one plane.
      list.sort((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID);
      const stride = Math.max(1, Math.floor(list.length / g.cap));
      let taken = 0;
      for (let i = 0; i < list.length && taken < g.cap; i += stride) {
        const o = list[i]!;
        if (byId.has(o.NORAD_CAT_ID)) continue;
        byId.set(o.NORAD_CAT_ID, toRecord(o, g.group));
        taken++;
      }
      console.log(`  ✓ group ${g.group}: ${taken}/${list.length} kept`);
    } catch (err) {
      console.warn(`  ! group ${g.group} skipped: ${(err as Error).message}`);
    }
  }

  const satellites = [...byId.values()].filter((s) => Number.isFinite(s.epochMs) && s.meanMotion > 0);

  if (satellites.length === 0) {
    console.warn('satellites: 0 objects resolved — keeping the previous snapshot.');
    return;
  }

  const out: SatellitesData = { generatedAt: new Date().toISOString(), satellites };
  await writeFile(OUT, JSON.stringify(out) + '\n');

  const byBand = satellites.reduce<Record<string, number>>((m, s) => {
    m[s.band] = (m[s.band] ?? 0) + 1;
    return m;
  }, {});
  console.log(`\nsatellites.json: ${satellites.length} objects — ${JSON.stringify(byBand)}`);
}

main().catch((err) => {
  console.error('fetch-satellites fatal:', err);
  process.exitCode = 1;
});
