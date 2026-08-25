// ---------------------------------------------------------------------------
// fetch-mars-tracks.ts
// Builds the surface-traverse data for the imaging rovers: the real driven
// path (lat/lon per waypoint, with sol + odometry) and a georeferenced HiRISE
// basemap crop of the landing region, so the client can lay the path over the
// terrain at the correct pixel for every point.
//
// Sources (all NASA, no key, same data the official "Where is the rover" maps
// use). Tiles are the standard Web-Mercator slippy grid (verified against the
// layer's gdal2tiles tilemapresource.xml), so lon/lat -> pixel is exact.
//   · Waypoints  → mars.nasa.gov/mmgis-maps/<M>/Layers/json/<M>_waypoints.json
//   · Basemap    → the HiRISE colour mosaic named in the MMGIS mission config
// Tiles require a maps-app Referer header; fetched server-side at build time.
//
// Nothing here is interpolated or invented: every plotted point is a published
// end-of-drive localisation. If the basemap can't be built the rover is skipped
// and logged, never faked.
// ---------------------------------------------------------------------------
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRACKS_DIR = join(ROOT, 'public', 'tracks');
const TRACKS_OUT = join(ROOT, 'public', 'data', 'tracks.json');

const D2R = Math.PI / 180;
const R_MARS = 3396200; // equatorial radius, metres
const TILE = 256;
const TILE_BUDGET = 200;    // max tiles to fetch per rover
const MAX_WIDTH = 2600;     // downscale the stitched crop to this longest side
const PAD = 0.12;           // bbox padding (fraction of span)

interface Rover {
  id: string;
  mission: string;          // MMGIS mission key (M20 / MSL)
  label: string;
}
const ROVERS: Rover[] = [
  { id: 'perseverance', mission: 'M20', label: 'Perseverance' },
  { id: 'curiosity', mission: 'MSL', label: 'Curiosity' },
];

// Standard slippy-map normalised coordinates (0..1), Web Mercator.
const wx = (lon: number) => (lon + 180) / 360;
const wy = (lat: number) =>
  0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)) / (2 * Math.PI);

interface TileLayer { name: string; url: string; bbox: number[]; maxZoom: number; }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': 'sublight/0.4 (build)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

/** Pull candidate basemap tile layers from the MMGIS mission config. */
async function basemapLayers(mission: string): Promise<TileLayer[]> {
  const cfg = await getJson<any>(
    `https://mars.nasa.gov/maps/location/api/configure/get?mission=${mission}`,
  );
  const root = cfg.body ?? cfg;
  const out: TileLayer[] = [];
  const walk = (ls: any[]) => {
    for (const l of ls ?? []) {
      if (l.type === 'tile' && typeof l.url === 'string' && l.url.includes('{z}')) {
        out.push({
          name: l.name,
          url: l.url,
          bbox: l.boundingBox ?? l.bounds ?? [],
          maxZoom: l.maxNativeZoom ?? 18,
        });
      }
      if (l.sublayers) walk(l.sublayers);
    }
  };
  walk(root.layers);
  return out;
}

const covers = (b: number[], W: number, S: number, E: number, N: number) =>
  b.length === 4 && b[0] <= W && b[1] <= S && b[2] >= E && b[3] >= N;

async function fetchWaypoints(mission: string) {
  const fc = await getJson<any>(
    `https://mars.nasa.gov/mmgis-maps/${mission}/Layers/json/${mission}_waypoints.json`,
  );
  const pts = (fc.features ?? [])
    .map((f: any) => ({
      lon: f.geometry?.coordinates?.[0],
      lat: f.geometry?.coordinates?.[1],
      sol: f.properties?.sol ?? null,
      dist_km: f.properties?.dist_km ?? null,
      site: f.properties?.site ?? null,
      drive: f.properties?.drive ?? null,
    }))
    .filter((p: any) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  return pts;
}

async function fetchTile(url: string, mission: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, {
      headers: {
        Referer: `https://mars.nasa.gov/maps/location/?mission=${mission}`,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,*/*',
      },
    });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function buildRover(rover: Rover) {
  const pts = await fetchWaypoints(rover.mission);
  if (pts.length === 0) { console.warn(`  ! ${rover.id}: no waypoints, skipped`); return null; }

  // Waypoint bbox, padded.
  let W = 180, E = -180, S = 90, N = -90;
  for (const p of pts) { W = Math.min(W, p.lon); E = Math.max(E, p.lon); S = Math.min(S, p.lat); N = Math.max(N, p.lat); }
  const padLon = (E - W) * PAD, padLat = (N - S) * PAD;
  W -= padLon; E += padLon; S -= padLat; N += padLat;

  // Choose the sharpest colour basemap that fully covers the padded bbox.
  const layers = await basemapLayers(rover.mission);
  const covering = layers.filter((l) => covers(l.bbox, W, S, E, N));
  const pick = (covering.length ? covering : layers).sort((a, b) => {
    const colour = (l: TileLayer) => /color|rgb|lrgb|hirise/i.test(l.name) ? 1 : 0;
    return colour(b) - colour(a) || b.maxZoom - a.maxZoom;
  })[0];
  if (!pick) { console.warn(`  ! ${rover.id}: no basemap layer, skipped`); return null; }

  // Largest zoom within tile budget and the layer's native resolution.
  let zoom = pick.maxZoom;
  const tilesAt = (z: number) => {
    const x0 = Math.floor(wx(W) * 2 ** z), x1 = Math.floor(wx(E) * 2 ** z);
    const y0 = Math.floor(wy(N) * 2 ** z), y1 = Math.floor(wy(S) * 2 ** z);
    return { x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
  };
  while (zoom > 6 && tilesAt(zoom).count > TILE_BUDGET) zoom--;
  const { x0, x1, y0, y1 } = tilesAt(zoom);
  const nX = x1 - x0 + 1, nY = y1 - y0 + 1;
  console.log(`  ${rover.id}: "${pick.name}" z${zoom} — ${nX}×${nY}=${nX * nY} tiles`);

  // Fetch + stitch (XYZ y from north; tiles are served TMS, so flip y for the URL).
  const canvasW = nX * TILE, canvasH = nY * TILE;
  const composites: sharp.OverlayOptions[] = [];
  let got = 0;
  const jobs: Promise<void>[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const tmsY = 2 ** zoom - 1 - ty;
      const url = pick.url
        .replace('{z}', String(zoom)).replace('{x}', String(tx)).replace('{y}', String(tmsY));
      const left = (tx - x0) * TILE, top = (ty - y0) * TILE;
      jobs.push(
        fetchTile(url, rover.mission).then((buf) => {
          if (buf) { composites.push({ input: buf, left, top }); got++; }
        }),
      );
      if (jobs.length >= 8) { await Promise.all(jobs.splice(0)); }
    }
  }
  await Promise.all(jobs);
  if (got === 0) { console.warn(`  ! ${rover.id}: every tile failed, skipped`); return null; }

  // Crop to the exact padded bbox within the stitched canvas.
  const gpx = (v: number) => v * 2 ** zoom * TILE; // normalised -> global pixels
  const cropLeft = Math.round(gpx(wx(W)) - x0 * TILE);
  const cropTop = Math.round(gpx(wy(N)) - y0 * TILE);
  const cropRight = Math.round(gpx(wx(E)) - x0 * TILE);
  const cropBottom = Math.round(gpx(wy(S)) - y0 * TILE);
  const cw = Math.max(1, Math.min(canvasW - cropLeft, cropRight - cropLeft));
  const ch = Math.max(1, Math.min(canvasH - cropTop, cropBottom - cropTop));

  const scale = Math.min(1, MAX_WIDTH / Math.max(cw, ch));
  const outW = Math.round(cw * scale), outH = Math.round(ch * scale);

  await mkdir(TRACKS_DIR, { recursive: true });
  const imgPath = join(TRACKS_DIR, `${rover.id}.jpg`);
  await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: { r: 8, g: 10, b: 14 } } })
    .composite(composites)
    .extract({ left: cropLeft, top: cropTop, width: cw, height: ch })
    .resize(outW, outH)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(imgPath);

  // Exact image frame in normalised slippy coords (client re-projects lon/lat).
  const frame = { wxWest: wx(W), wxEast: wx(E), wyNorth: wy(N), wySouth: wy(S) };
  const midLat = (S + N) / 2;
  const metresWidth = 2 * Math.PI * R_MARS * Math.cos(midLat * D2R) * (frame.wxEast - frame.wxWest);
  const metersPerPixel = metresWidth / outW;

  const last = pts[pts.length - 1];
  const sols = pts.map((p: any) => p.sol).filter((s: any) => s != null);
  const dist = pts.map((p: any) => p.dist_km).filter((d: any) => d != null);

  console.log(`  ${rover.id}: ${outW}×${outH}px, ${metersPerPixel.toFixed(1)} m/px, ${pts.length} waypoints`);
  return {
    id: rover.id,
    label: rover.label,
    basemap: pick.name,
    image: `/tracks/${rover.id}.jpg`,
    w: outW, h: outH,
    frame,
    metersPerPixel,
    distanceKm: dist.length ? Math.max(...dist) : null,
    solFirst: sols.length ? Math.min(...sols) : null,
    solLast: sols.length ? Math.max(...sols) : null,
    current: { lon: last.lon, lat: last.lat, sol: last.sol, site: last.site, drive: last.drive },
    waypoints: pts.map((p: any) => ({ lon: p.lon, lat: p.lat, sol: p.sol })),
  };
}

async function main() {
  console.log('Building Mars traverse maps…');
  const out: Record<string, any> = { generatedAt: new Date().toISOString(), rovers: {} };
  for (const rover of ROVERS) {
    try {
      const data = await buildRover(rover);
      if (data) out.rovers[rover.id] = data;
    } catch (e) {
      console.warn(`  ! ${rover.id}: ${(e as Error).message}`);
    }
  }
  await writeFile(TRACKS_OUT, JSON.stringify(out) + '\n');
  console.log(`Wrote ${TRACKS_OUT} (${Object.keys(out.rovers).length} rovers)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
