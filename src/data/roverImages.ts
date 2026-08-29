// Live, on-demand access to a rover's raw images for a single sol.
//
// The full archive is enormous (Perseverance alone has >560,000 raw frames), so
// nothing is bundled. Both feeds send `Access-Control-Allow-Origin: *`, so — like
// the DSN feed — the browser reads them directly when the user opens a drive stop.
// Every frame stays linked; none is hosted or invented.
import type { FrameThumb } from '../types.ts';

export interface SolImages {
  sol: number;
  count: number;      // total frames that sol (may exceed the loaded sample)
  frames: FrameThumb[];
  more: string;       // deep link to the full set on mars.nasa.gov
}

const cache = new Map<string, SolImages>();

export async function fetchSolImages(
  roverId: string,
  sol: number,
  limit = 120,
): Promise<SolImages> {
  const key = `${roverId}:${sol}:${limit}`;
  const hit = cache.get(key);
  if (hit) return hit;

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
      full: f.large ?? f.full_res ?? f.medium ?? f.small,
      sourceUrl: im.link ?? f.full_res ?? f.large,
      instrument: im.camera?.instrument ?? 'CAMERA',
      capturedUtc: im.date_taken_utc ?? im.date_taken_mars ?? '',
      sol: im.sol ?? sol,
    };
  }).filter((f) => f.file);
  return {
    sol,
    count: data.num_images ?? frames.length,
    frames: frames.slice(0, limit), // the feed ignores `num` when filtering by sol
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
    file: im.url,
    full: im.url,
    sourceUrl: im.url,
    instrument: im.instrument ?? 'CAMERA',
    capturedUtc: im.date_taken ?? '',
    sol: im.sol ?? sol,
  })).filter((f) => f.file).slice(0, limit);
  return {
    sol,
    count: items.length,
    frames,
    more: `https://mars.nasa.gov/msl/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=${sol}&end_sol=${sol}`,
  };
}
