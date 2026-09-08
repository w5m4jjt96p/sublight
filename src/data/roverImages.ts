// Live, on-demand access to a rover's raw images for a single sol.
//
// The full archive is enormous (Perseverance alone has >560,000 raw frames), so
// nothing is bundled. Both feeds send `Access-Control-Allow-Origin: *`, so — like
// the DSN feed — the browser reads them directly when the user opens a drive stop.
// Every frame stays linked; none is hosted or invented.
import type { FrameThumb } from '../types.ts';

// mars.nasa.gov serves size variants of every MSL frame by suffix, and the
// saving is dramatic: a NAVCAM frame is 536 KB raw, 113 KB as -br, 8 KB as
// -thm. Serving the raw frame into a 34px filmstrip cell was what made the
// feed feel slow. Verified present on every MSL camera.
const mslVariant = (url: string, suffix: string) =>
  url.replace(/\.(jpg|JPG)$/, (ext) => `${suffix}${ext}`);

/**
 * Rovers shoot in stereo: the same instant through a left and a right eye, and
 * both eyes are published as separate frames. A sol of 214 Perseverance frames
 * is really about 149 scenes. Keep the left eye when a right one shares its
 * capture time and its camera differs only by which eye it is.
 *
 * Measured on Perseverance sol 1972: 214 frames in, 149 out, and Mastcam-Z
 * drops from 71+71 to 41+41. On Curiosity the two eyes rarely share a
 * timestamp, so this removes almost nothing there — which is correct, they are
 * genuinely separate exposures.
 */
function dropStereoTwins(frames: FrameThumb[]): FrameThumb[] {
  const seen = new Map<string, number>();
  const out: FrameThumb[] = [];
  for (const f of frames) {
    const base = f.instrument.replace(/_(LEFT|RIGHT)/, '');
    const key = `${f.capturedUtc}|${base}`;
    const at = seen.get(key);
    if (at === undefined) { seen.set(key, out.length); out.push(f); continue; }
    if (/LEFT/.test(f.instrument) && /RIGHT/.test(out[at]!.instrument)) out[at] = f;
  }
  return out;
}

/**
 * How much a camera is worth opening a post on, highest first. The raw feeds
 * carry no "featured" or "interesting" flag; the closest thing NASA publishes
 * is MSL's `instrument_sort` (Mastcam 1, ChemCam RMI 4, Navcam 7-8), and this
 * ordering matches it while also covering Perseverance, whose feed has no
 * equivalent field.
 */
const CAMERA_RANK: [RegExp, number][] = [
  [/MCZ|MAST|ZCAM/, 0],        // colour, scenic
  [/NAVCAM|NAV_/, 1],          // wide, grey
  [/RMI|SUPERCAM|CHEMCAM/, 2], // distant detail
  [/HAZ/, 3],                  // wheels and ground
];
export function openingFrame(frames: { instrument: string }[]): number {
  let best = 0;
  let bestRank = 99;
  for (let i = 0; i < frames.length; i++) {
    const inst = frames[i]!.instrument;
    const rank = CAMERA_RANK.find(([re]) => re.test(inst))?.[1] ?? 4;
    if (rank < bestRank) { bestRank = rank; best = i; if (rank === 0) break; }
  }
  return best;
}

export interface SolImages {
  sol: number;
  count: number;      // total frames that sol (may exceed the loaded sample)
  frames: FrameThumb[];
  more: string;       // deep link to the full set on mars.nasa.gov
}

const cache = new Map<string, SolImages>();

// ---- newest published frames ------------------------------------------------
// The bundled snapshot is only as fresh as the last data refresh, and NASA
// publishes in bursts through the day, so the feed asks for the most recently
// *published* frames (ordered by date_received) rather than guessing a sol.
const latestCache = new Map<string, { at: number; frames: FrameThumb[] }>();
const LATEST_TTL_MS = 5 * 60 * 1000;

/**
 * `force` skips the cache on the way in, never on the way out. A poll that
 * reads a five-minute-old answer defeats the point of polling, and the sol a
 * rover is filling right now keeps growing under the same key.
 */
export async function fetchLatestFrames(
  roverId: string,
  limit = 48,
  force = false,
): Promise<FrameThumb[]> {
  const key = `${roverId}:${limit}`;
  const hit = latestCache.get(key);
  if (!force && hit && Date.now() - hit.at < LATEST_TTL_MS) return hit.frames;

  const url =
    roverId === 'curiosity'
      ? `https://mars.nasa.gov/api/v1/raw_image_items/?order=date_received+desc&per_page=${limit * 2}&page=0&condition_1=msl%3Amission`
      : `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=${limit}&page=0&order=date_received+desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${roverId} latest: HTTP ${res.status}`);
  const data = await res.json();

  const frames: FrameThumb[] =
    roverId === 'curiosity'
      ? ((data.items ?? []) as any[])
          .filter((im) => !im.is_thumbnail && im.url)
          .map((im) => ({
            file: mslVariant(im.url, '-thm'),
            view: mslVariant(im.url, '-br'),
            full: im.url,
            sourceUrl: im.url,
            instrument: im.instrument ?? 'CAMERA',
            capturedUtc: im.date_taken ?? '',
            receivedUtc: im.date_received ?? '',
            sol: im.sol ?? null,
          }))
          .slice(0, limit)
      : ((data.images ?? []) as any[])
          .map((im) => {
            const f = im.image_files ?? {};
            return {
              file: f.small ?? f.medium ?? f.large ?? f.full_res,
              view: f.medium ?? f.large ?? f.small,
              full: f.large ?? f.full_res ?? f.medium ?? f.small,
              sourceUrl: im.link ?? f.full_res ?? f.large,
              instrument: im.camera?.instrument ?? 'CAMERA',
              capturedUtc: im.date_taken_utc ?? '',
              receivedUtc: im.date_received ?? '',
              sol: im.sol ?? null,
            };
          })
          .filter((f) => f.file);

  const deduped = dropStereoTwins(frames);
  latestCache.set(key, { at: Date.now(), frames: deduped });
  return deduped;
}

export async function fetchSolImages(
  roverId: string,
  sol: number,
  limit = 120,
  force = false,
): Promise<SolImages> {
  const key = `${roverId}:${sol}:${limit}`;
  const hit = cache.get(key);
  if (!force && hit) return hit;

  const result =
    roverId === 'curiosity'
      ? await fetchCuriosity(sol, limit)
      : await fetchPerseverance(sol, limit);
  cache.set(key, result);
  return result;
}

async function fetchPerseverance(sol: number, limit: number): Promise<SolImages> {
  const url =
    `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json` +
    `&num=${limit}&page=0&order=sol+desc&sol=${sol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mars2020 sol ${sol}: HTTP ${res.status}`);
  const data = await res.json();
  const imgs: any[] = data.images ?? [];
  const frames: FrameThumb[] = imgs.map((im) => {
    const f = im.image_files ?? {};
    return {
      file: f.small ?? f.medium ?? f.large ?? f.full_res,
      view: f.medium ?? f.large ?? f.small,
      full: f.large ?? f.full_res ?? f.medium ?? f.small,
      sourceUrl: im.link ?? f.full_res ?? f.large,
      instrument: im.camera?.instrument ?? 'CAMERA',
      capturedUtc: im.date_taken_utc ?? im.date_taken_mars ?? '',
      receivedUtc: im.date_received ?? '',
      sol: im.sol ?? sol,
    };
  }).filter((f) => f.file);
  return {
    sol,
    count: data.num_images ?? frames.length,
    frames: dropStereoTwins(frames).slice(0, limit), // the feed ignores `num` when filtering by sol
    more: `https://mars.nasa.gov/mars2020/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=${sol}&end_sol=${sol}`,
  };
}

async function fetchCuriosity(sol: number, limit: number): Promise<SolImages> {
  // Each full frame has a low-res `is_thumbnail` twin, so over-fetch and drop
  // the thumbnails before trimming to `limit` full-resolution frames.
  const url =
    `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=${limit * 2}&page=0` +
    `&condition_1=msl%3Amission&condition_2=${sol}%3Asol%3Agte&condition_3=${sol}%3Asol%3Alte`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`msl sol ${sol}: HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = (data.items ?? []).filter((im: any) => !im.is_thumbnail);
  const frames: FrameThumb[] = items.map((im) => ({
    file: mslVariant(im.url, '-thm'),
    view: mslVariant(im.url, '-br'),
    full: im.url,
    sourceUrl: im.url,
    instrument: im.instrument ?? 'CAMERA',
    capturedUtc: im.date_taken ?? '',
    receivedUtc: im.date_received ?? '',
    sol: im.sol ?? sol,
  })).filter((f) => f.file).slice(0, limit);
  return {
    sol,
    count: items.length,
    frames: dropStereoTwins(frames),
    more: `https://mars.nasa.gov/msl/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=${sol}&end_sol=${sol}`,
  };
}
