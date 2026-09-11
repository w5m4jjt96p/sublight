// ---------------------------------------------------------------------------
// fetch-planet-maps.ts — bundle the equirectangular colour maps the 3D map
// wraps on its planets. Every source is NASA/USGS material in the public
// domain, mirrored on Wikimedia Commons or served by NASA directly. The maps
// never change, so this runs once, but it lives in the pipeline so each asset
// is reproducible and its provenance is written down (see public/licenses).
// Non-fatal per body: a failed download keeps the previous file.
// ---------------------------------------------------------------------------
import { mkdir, access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'bodies', 'maps');

interface Source {
  id: string;
  url: string | null; // null: taken from a file already in the repo
  local?: string;
  credit: string;
}

const SOURCES: Source[] = [
  {
    id: 'mercury',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Mercury_global_map_2013-05-14_bright.png',
    credit: 'MESSENGER MDIS global mosaic, NASA/JHUAPL/Carnegie Institution of Washington',
  },
  {
    id: 'venus',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Cylindrical_Map_of_Venus.jpg',
    credit: 'Magellan radar mosaic, NASA/JPL/USGS',
  },
  {
    id: 'earth',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg',
    credit: 'Blue Marble, NASA Visible Earth (Reto Stöckli, NASA Earth Observatory)',
  },
  {
    id: 'moon',
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg',
    credit: 'LRO LROC WAC mosaic, NASA/GSFC Scientific Visualization Studio (CGI Moon Kit)',
  },
  {
    id: 'mars',
    url: null,
    local: join(ROOT, 'public', 'mars', 'globe.jpg'),
    credit: 'Viking MDIM 2.1 colorized mosaic, NASA/JPL/USGS',
  },
  {
    id: 'jupiter',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Jupiter_Cylindrical_Map_-_Dec_2000_PIA07782.jpg',
    credit: 'Cassini ISS cylindrical map PIA07782, NASA/JPL/Space Science Institute',
  },
];

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const s of SOURCES) {
    const out = join(OUT_DIR, `${s.id}.jpg`);
    try {
      let buf: Buffer;
      if (s.url) {
        const res = await fetch(s.url, { headers: { 'User-Agent': 'sublight.observer (planet map textures; contact via github.com/w5m4jjt96p/sublight)' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        buf = await readFile(s.local!);
      }
      // 1024x512: power of two so WebGL can mipmap it, and the spheres are
      // small on screen until the reader approaches one.
      await sharp(buf).resize(1024, 512, { fit: 'fill' }).jpeg({ quality: 85 }).toFile(out);
      console.log(`planet map ${s.id}: wrote ${out} (${s.credit})`);
    } catch (err) {
      const kept = await exists(out);
      console.warn(`planet map ${s.id} ${kept ? 'skipped (kept existing)' : 'FAILED and none bundled'}: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error('fetch-planet-maps fatal:', err);
  process.exitCode = 1;
});
