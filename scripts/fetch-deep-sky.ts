// ---------------------------------------------------------------------------
// fetch-deep-sky.ts — download the hand-picked NASA Image & Video Library image
// for each deep-sky object and write public/data/deepsky.json. Images are
// public domain; stored locally (720 + 1600) so the site stays self-contained.
// Editorial distances live in data/deep-sky.json. Non-fatal per object.
// ---------------------------------------------------------------------------
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { DeepSkyData, DeepSkyObject } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'data', 'deep-sky.json');
const IMG_DIR = join(ROOT, 'public', 'deep-sky');
const OUT = join(ROOT, 'public', 'data', 'deepsky.json');
const UA = { 'User-Agent': 'sublight/0.4 (static site build)' };

const https = (u: string) => u.replace(/^http:/, 'https:');

interface CatalogEntry {
  id: string; name: string; kind: string; catalog: string;
  distanceLy: number; nasaId: string; credit: string; note: string;
}

async function resolveAsset(nasaId: string): Promise<{ dl: string; orig: string }> {
  const res = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`, { headers: UA });
  if (!res.ok) throw new Error(`asset ${nasaId}: HTTP ${res.status}`);
  const json = (await res.json()) as { collection?: { items?: { href: string }[] } };
  const hrefs = (json.collection?.items ?? []).map((i) => https(i.href));
  const jpgs = hrefs.filter((u) => /\.jpe?g$/i.test(u));
  const orig = hrefs.find((u) => /~orig\./i.test(u)) ?? jpgs[0] ?? hrefs[0];
  const dl =
    jpgs.find((u) => /~large\./i.test(u)) ??
    jpgs.find((u) => /~medium\./i.test(u)) ??
    jpgs[0] ?? orig;
  if (!dl || !orig) throw new Error(`asset ${nasaId}: no image url`);
  return { dl, orig };
}

async function main() {
  const catalog = (JSON.parse(await readFile(CATALOG, 'utf8')) as { objects: CatalogEntry[] }).objects;
  await mkdir(IMG_DIR, { recursive: true });
  const objects: DeepSkyObject[] = [];

  console.log(`\nDeep sky — ${catalog.length} objects\n`);
  for (const o of catalog) {
    try {
      const { dl, orig } = await resolveAsset(o.nasaId);
      const res = await fetch(dl, { headers: UA });
      if (!res.ok) throw new Error(`image HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = `${o.id}.jpg`, full = `${o.id}-full.jpg`;
      await Promise.all([
        sharp(buf).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(IMG_DIR, file)),
        sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(join(IMG_DIR, full)),
      ]);
      objects.push({
        id: o.id, name: o.name, kind: o.kind, catalog: o.catalog,
        distanceLy: o.distanceLy,
        file: `/deep-sky/${file}`, full: `/deep-sky/${full}`,
        sourceUrl: orig, credit: o.credit, note: o.note,
      });
      console.log(`  ✓ ${o.name.padEnd(24)} ${o.nasaId}`);
    } catch (err) {
      console.warn(`  ! ${o.name}: ${(err as Error).message}`);
    }
  }

  if (objects.length === 0) { console.warn('deep sky: 0 objects resolved — keeping previous.'); return; }
  const out: DeepSkyData = { generatedAt: new Date().toISOString(), objects };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote deepsky.json with ${objects.length} objects.`);
}

main().catch((err) => { console.error('fetch-deep-sky fatal:', err); process.exitCode = 1; });
