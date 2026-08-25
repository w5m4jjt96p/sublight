// ---------------------------------------------------------------------------
// fetch-archive.ts — download the hand-picked NASA Image & Video Library still
// for each craft that has no live raw feed. No key. Stored locally (720 + 1600)
// so the site stays self-contained; writes /public/data/archive.json.
// ---------------------------------------------------------------------------
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { Registry, ArchiveData, ArchiveEntry } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'data', 'registry.json');
const FRAMES_DIR = join(ROOT, 'public', 'frames');
const OUT = join(ROOT, 'public', 'data', 'archive.json');
const UA = { 'User-Agent': 'sublight/0.4 (static site build)' };

const https = (u: string) => u.replace(/^http:/, 'https:');

/** Resolve a NASA library id to [downloadUrl, originalUrl]. */
async function resolveAsset(nasaId: string): Promise<{ dl: string; orig: string }> {
  const res = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`, {
    headers: UA,
  });
  if (!res.ok) throw new Error(`asset ${nasaId}: HTTP ${res.status}`);
  const json = (await res.json()) as { collection?: { items?: { href: string }[] } };
  const hrefs = (json.collection?.items ?? []).map((i) => https(i.href));
  const jpgs = hrefs.filter((u) => /\.jpe?g$/i.test(u));
  const orig = hrefs.find((u) => /~orig\./i.test(u)) ?? jpgs[0] ?? hrefs[0];
  // Prefer a mid/large jpg to resize from (orig can be a huge PNG).
  const dl =
    jpgs.find((u) => /~large\./i.test(u)) ??
    jpgs.find((u) => /~medium\./i.test(u)) ??
    jpgs[0] ??
    orig;
  if (!dl || !orig) throw new Error(`asset ${nasaId}: no image url`);
  return { dl, orig };
}

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY, 'utf8')) as Registry;
  const withArchive = registry.filter((c) => c.archiveImage);
  const out: ArchiveData = {};

  console.log(`\nArchive stills — ${withArchive.length} craft\n`);

  for (const craft of withArchive) {
    const a = craft.archiveImage!;
    try {
      const { dl, orig } = await resolveAsset(a.nasaId);
      const res = await fetch(dl, { headers: UA });
      if (!res.ok) throw new Error(`image HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = `archive-${craft.id}.jpg`;
      const full = `archive-${craft.id}-full.jpg`;
      await Promise.all([
        sharp(buf).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(FRAMES_DIR, file)),
        sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(join(FRAMES_DIR, full)),
      ]);
      const entry: ArchiveEntry = {
        file: `/frames/${file}`,
        full: `/frames/${full}`,
        sourceUrl: orig,
        title: a.title,
        credit: a.credit,
      };
      out[craft.id] = entry;
      console.log(`  ✓ ${craft.name.padEnd(14)} ${a.nasaId}  “${a.title}”`);
    } catch (err) {
      console.warn(`  ! ${craft.name}: ${(err as Error).message}`);
    }
  }

  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote archive.json with ${Object.keys(out).length} entries.`);
}

main().catch((err) => {
  console.error('fetch-archive fatal:', err);
  process.exitCode = 1;
});
