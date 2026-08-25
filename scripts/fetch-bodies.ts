// ---------------------------------------------------------------------------
// fetch-bodies.ts — download the hand-picked NASA library still for each planet
// / Moon (the clickable bodies). Sun (SDO) and Earth (EPIC) are live images
// handled elsewhere. Writes /public/data/bodyphotos.json. No key.
// ---------------------------------------------------------------------------
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { BODIES } from '../src/data/bodies.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BODIES_DIR = join(ROOT, 'public', 'bodies');
const OUT = join(ROOT, 'public', 'data', 'bodyphotos.json');
const UA = { 'User-Agent': 'sublight/0.4 (static site build)' };
const https = (u: string) => u.replace(/^http:/, 'https:');

async function resolveAsset(nasaId: string): Promise<{ dl: string; orig: string }> {
  const res = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`, { headers: UA });
  if (!res.ok) throw new Error(`asset ${nasaId}: HTTP ${res.status}`);
  const json = (await res.json()) as { collection?: { items?: { href: string }[] } };
  const hrefs = (json.collection?.items ?? []).map((i) => https(i.href));
  const jpgs = hrefs.filter((u) => /\.jpe?g$/i.test(u));
  const orig = hrefs.find((u) => /~orig\./i.test(u)) ?? jpgs[0] ?? hrefs[0];
  const dl = jpgs.find((u) => /~large\./i.test(u)) ?? jpgs.find((u) => /~medium\./i.test(u)) ?? jpgs[0] ?? orig;
  if (!dl || !orig) throw new Error(`asset ${nasaId}: no image url`);
  return { dl, orig };
}

async function main() {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(BODIES_DIR, { recursive: true });

  const out: Record<string, { file: string; full: string; sourceUrl: string }> = {};
  const nasaBodies = Object.entries(BODIES).filter(([, b]) => b.photo.kind === 'nasa');

  console.log(`\nBody photos — ${nasaBodies.length} NASA library stills\n`);

  for (const [id, body] of nasaBodies) {
    const photo = body.photo as { kind: 'nasa'; id: string };
    try {
      const { dl, orig } = await resolveAsset(photo.id);
      const res = await fetch(dl, { headers: UA });
      if (!res.ok) throw new Error(`image HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = `${id}.jpg`;
      const full = `${id}-full.jpg`;
      await Promise.all([
        sharp(buf).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(BODIES_DIR, file)),
        sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(join(BODIES_DIR, full)),
      ]);
      out[id] = { file: `/bodies/${file}`, full: `/bodies/${full}`, sourceUrl: orig };
      console.log(`  ✓ ${body.name.padEnd(12)} ${photo.id}`);
    } catch (err) {
      console.warn(`  ! ${body.name}: ${(err as Error).message}`);
    }
  }

  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote bodyphotos.json with ${Object.keys(out).length} entries.`);
}

main().catch((err) => {
  console.error('fetch-bodies fatal:', err);
  process.exitCode = 1;
});
