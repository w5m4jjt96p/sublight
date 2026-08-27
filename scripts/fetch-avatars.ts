// ---------------------------------------------------------------------------
// fetch-avatars.ts — download a public-domain NASA image of each spacecraft and
// crop it to a square "profile picture" for the gallery feed. Editorial ids in
// data/avatars.json. Output: public/avatars/<craftId>.jpg. Non-fatal per craft.
// ---------------------------------------------------------------------------
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'data', 'avatars.json');
const OUT_DIR = join(ROOT, 'public', 'avatars');
const OUT_JSON = join(ROOT, 'public', 'data', 'avatars.json');
const UA = { 'User-Agent': 'sublight/0.4 (static site build)' };
const https = (u: string) => u.replace(/^http:/, 'https:');

async function resolveAsset(nasaId: string): Promise<string> {
  const res = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`, { headers: UA });
  if (!res.ok) throw new Error(`asset ${nasaId}: HTTP ${res.status}`);
  const json = (await res.json()) as { collection?: { items?: { href: string }[] } };
  const hrefs = (json.collection?.items ?? []).map((i) => https(i.href)).filter((u) => /\.jpe?g$/i.test(u));
  const dl = hrefs.find((u) => /~medium\./i.test(u)) ?? hrefs.find((u) => /~large\./i.test(u)) ?? hrefs[0];
  if (!dl) throw new Error(`asset ${nasaId}: no jpg`);
  return dl;
}

async function main() {
  const catalog = (JSON.parse(await readFile(CATALOG, 'utf8')) as { avatars: Record<string, { nasaId: string; credit: string }> }).avatars;
  await mkdir(OUT_DIR, { recursive: true });
  const meta: Record<string, { credit: string }> = {};

  console.log(`\nAvatars — ${Object.keys(catalog).length} crafts\n`);
  for (const [id, a] of Object.entries(catalog)) {
    try {
      const dl = await resolveAsset(a.nasaId);
      const res = await fetch(dl, { headers: UA });
      if (!res.ok) throw new Error(`image HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf)
        .resize(192, 192, { fit: 'cover', position: 'attention' }) // smart square crop
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(join(OUT_DIR, `${id}.jpg`));
      meta[id] = { credit: a.credit };
      console.log(`  ✓ ${id.padEnd(20)} ${a.nasaId}`);
    } catch (err) {
      console.warn(`  ! ${id}: ${(err as Error).message}`);
    }
  }

  await writeFile(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), avatars: meta }, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(meta).length} avatars.`);
}

main().catch((err) => { console.error('fetch-avatars fatal:', err); process.exitCode = 1; });
