// ---------------------------------------------------------------------------
// verify.ts — end-of-pipeline sanity checks. Logs every anomaly by craft name.
// Exit code is non-zero only on structural problems (missing fleet.json etc.),
// so the daily job can still publish yesterday-good data; per-craft anomalies
// are warnings the CI surfaces in an issue.
// ---------------------------------------------------------------------------
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Registry, FleetData, FramesData } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s: string[]) => join(ROOT, ...s);

const MAX_OWLT_SECONDS = 48 * 3600;
const MIN_HELIO_AU = 0.05;
const HELIO_EXEMPT = new Set(['parker-solar-probe']); // dips inside 0.05 AU

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const anomalies: string[] = [];
  const warn = (m: string) => {
    anomalies.push(m);
    console.warn(`  ! ${m}`);
  };

  const registry = await readJson<Registry>(p('data', 'registry.json'));

  let fleet: FleetData;
  try {
    fleet = await readJson<FleetData>(p('public', 'data', 'fleet.json'));
  } catch {
    console.error('FATAL: public/data/fleet.json missing or unreadable');
    process.exit(1);
    return;
  }
  const byId = new Map(fleet.craft.map((c) => [c.id, c]));

  console.log('\nverify: ephemerides');
  for (const entry of registry) {
    const c = byId.get(entry.id);
    if (!c) {
      warn(`${entry.name}: no entry in fleet.json`);
      continue;
    }
    if (c.owltSeconds == null || !isFinite(c.owltSeconds) || c.owltSeconds <= 0) {
      warn(`${entry.name}: light time is null/zero/negative (${c.owltSeconds})`);
    } else if (c.owltSeconds > MAX_OWLT_SECONDS) {
      warn(`${entry.name}: light time exceeds 48h (${(c.owltSeconds / 3600).toFixed(1)}h)`);
    }
    if (c.heliocentricAu < MIN_HELIO_AU && !HELIO_EXEMPT.has(entry.id)) {
      warn(`${entry.name}: heliocentric radius < ${MIN_HELIO_AU} AU (${c.heliocentricAu})`);
    }
    if (c.eclipticLonDeg < 0 || c.eclipticLonDeg >= 360) {
      warn(`${entry.name}: ecliptic longitude out of range (${c.eclipticLonDeg})`);
    }
    if (c.stale) console.log(`  · ${entry.name}: stale (reused last good value)`);
  }

  console.log('verify: frames');
  let frames: FramesData = {};
  try {
    frames = await readJson<FramesData>(p('public', 'data', 'frames.json'));
  } catch {
    console.log('  (no frames.json — imaging is optional)');
  }
  for (const [id, f] of Object.entries(frames)) {
    const name = registry.find((r) => r.id === id)?.name ?? id;
    const files = [
      f.file,
      f.full,
      ...(f.recent?.flatMap((t) => [t.file, t.full]) ?? []),
    ].filter(Boolean);
    for (const file of files) {
      const exists = await fileExists(p('public', file.replace(/^\//, '')));
      if (!exists) warn(`${name}: referenced frame missing on disk (${file})`);
    }
    if (!f.capturedUtc || isNaN(Date.parse(f.capturedUtc))) {
      warn(`${name}: frame has no valid capture timestamp`);
    }
  }

  console.log('verify: archive stills');
  try {
    const archive = await readJson<Record<string, { file: string; full: string }>>(
      p('public', 'data', 'archive.json'),
    );
    for (const [id, a] of Object.entries(archive)) {
      const name = registry.find((r) => r.id === id)?.name ?? id;
      for (const file of [a.file, a.full]) {
        if (!(await fileExists(p('public', file.replace(/^\//, ''))))) {
          warn(`${name}: archive image missing on disk (${file})`);
        }
      }
    }
  } catch {
    console.log('  (no archive.json — optional)');
  }

  console.log('verify: body photos');
  try {
    const bodies = await readJson<Record<string, { file: string; full: string }>>(
      p('public', 'data', 'bodyphotos.json'),
    );
    for (const [id, b] of Object.entries(bodies)) {
      for (const file of [b.file, b.full]) {
        if (!(await fileExists(p('public', file.replace(/^\//, ''))))) {
          warn(`${id}: body photo missing on disk (${file})`);
        }
      }
    }
  } catch {
    console.log('  (no bodyphotos.json — optional)');
  }

  console.log(`\nverify complete — ${anomalies.length} anomaly(ies).`);
  // Anomalies are warnings, not build failures (see header). Structural
  // failures already exited above.
}

main().catch((err) => {
  console.error('verify fatal:', err);
  process.exit(1);
});
