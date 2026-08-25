// ---------------------------------------------------------------------------
// fetch-dsn.ts — optional CI snapshot of the Deep Space Network.
// The browser polls the DSN live (CORS is open), so this snapshot is only a
// seed / fallback for the very first paint. Failure is non-fatal.
// ---------------------------------------------------------------------------
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Registry, DsnSnapshot } from '../src/types.ts';
import { DSN_URL, parseDsnXml, buildLookup, contactsByCraft } from '../src/data/dsn.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'data', 'registry.json');
const OUT = join(ROOT, 'public', 'data', 'dsn.json');

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY, 'utf8')) as Registry;
  const lookup = buildLookup(registry);

  try {
    const res = await fetch(`${DSN_URL}?cachebust=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const byCraft = contactsByCraft(parseDsnXml(xml), lookup);
    const snapshot: DsnSnapshot = { generatedAt: new Date().toISOString(), byCraft };
    await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n');
    const inContact = Object.entries(byCraft).filter(([, c]) => c.inContact).length;
    console.log(`\nDSN snapshot: ${inContact} craft in contact right now.`);
    for (const [id, c] of Object.entries(byCraft)) {
      if (c.inContact) console.log(`  ✓ ${id}: ${c.direction} via ${c.antenna}`);
    }
  } catch (err) {
    console.warn(`DSN snapshot skipped (non-fatal): ${(err as Error).message}`);
    // Write an empty-but-valid snapshot so the client fetch never 404s.
    const snapshot: DsnSnapshot = { generatedAt: new Date().toISOString(), byCraft: {} };
    await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  }
}

main().catch((err) => {
  console.error('fetch-dsn fatal:', err);
  process.exitCode = 1;
});
