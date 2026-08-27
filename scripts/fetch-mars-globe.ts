// ---------------------------------------------------------------------------
// fetch-mars-globe.ts — bundle the equirectangular Mars colour map used by the
// 3D Mars globe view. The source is the USGS/NASA Viking colorized global
// mosaic (public domain). It never changes, so this only needs to run once, but
// it lives in the pipeline so the asset is reproducible and provenance is clear.
// Non-fatal: if the download fails, the previous globe.jpg is kept.
// ---------------------------------------------------------------------------
import { mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'mars');
const OUT = join(OUT_DIR, 'globe.jpg');

// USGS Viking MDIM 2.1 colorized global mosaic (public domain, NASA/JPL/USGS).
const SRC =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Mars_G%C3%A9olocalisation.jpg/1280px-Mars_G%C3%A9olocalisation.jpg';

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  try {
    const res = await fetch(SRC, { headers: { 'User-Agent': 'sublight.observer (mars globe texture)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Equirectangular 2:1, downscaled for the client. 1024x512 is plenty for a
    // ~300px globe and keeps the asset small.
    await sharp(buf).resize(1024, 512, { fit: 'fill' }).jpeg({ quality: 82 }).toFile(OUT);
    console.log(`mars globe texture: wrote ${OUT}`);
  } catch (err) {
    if (await exists(OUT)) {
      console.warn(`mars globe texture skipped (kept existing): ${(err as Error).message}`);
    } else {
      console.warn(`mars globe texture FAILED and none bundled: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error('fetch-mars-globe fatal:', err);
  process.exitCode = 1;
});
