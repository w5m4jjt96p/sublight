// ---------------------------------------------------------------------------
// fetch-frames.ts
// Pulls the most recent raw frame for each imaging rover, stores a resized
// thumbnail under /public/frames, and writes /public/data/frames.json.
//
// Source decision (Prompt 4): both rovers use JPL raw-image feeds that need NO
// key and carry `date_taken_utc`, the real capture time the product is built
// around. api.nasa.gov/mars-photos was rejected — it 404s on DEMO_KEY and only
// exposes a date, not a UTC timestamp.
//   · Perseverance → mars.nasa.gov/rss/api        (category=mars2020)
//   · Curiosity    → mars.nasa.gov/api/v1/raw_image_items  (msl:mission)
//     (the older category=msl RSS feed now returns 0 images.)
//
// If a feed stops giving a trustworthy timestamp, that rover is skipped and
// logged — we never derive a fake capture time from the sol number.
// ---------------------------------------------------------------------------
import { readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { Registry, FramesData, FrameData, FrameThumb } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'data', 'registry.json');
const FRAMES_DIR = join(ROOT, 'public', 'frames');
const FRAMES_OUT = join(ROOT, 'public', 'data', 'frames.json');
const SUN_OUT = join(ROOT, 'public', 'sun.jpg');
// Recent full-disk Sun (SDO/AIA 171 — gold corona), NASA, no key.
const SUN_URL = 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg';

const MAX_AGE_DAYS = 30;
const THUMB_WIDTH = 720; // map chip / HUD / strip
const FULL_WIDTH = 1600; // full-screen viewer + one-click HQ download
const RECENT_COUNT = 30;
const UA = { 'User-Agent': 'out-there/0.4 (static site build)' };

/** Surface cameras make better hero frames than sky/engineering cams. */
const PREFERRED = ['NAVCAM', 'MASTCAM', 'MAST', 'ZCAM', 'MCZ', 'FHAZ', 'RHAZ', 'HAZCAM'];

/** Normalised frame, source-agnostic. */
interface Frame {
  sol: number | null;
  instrument: string;
  capturedUtc: string; // ISO
  /** Best-resolution image to download locally from. */
  url: string;
  /** Original full-resolution image at the source, for "view original". */
  sourceUrl: string;
  credit: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Collision-proof basename (no extension) for a frame. */
function frameBase(craftId: string, f: Frame): string {
  const h = createHash('sha1').update(f.url).digest('hex').slice(0, 6);
  return `${craftId}-${f.sol ?? 'x'}-${slug(f.instrument)}-${h}`;
}

/**
 * Order frames for display: the newest surface-camera frame leads (it becomes
 * the hero), then a round-robin across every camera so the wall stays varied
 * instead of showing a burst from one instrument. A sol can carry 500+ frames
 * dominated by a single camera; interleaving keeps the colour Mastcam-Z / Navcam
 * views in the mix. The first RECENT_COUNT entries feed the gallery strip.
 */
function orderFrames(frames: Frame[]): Frame[] {
  // De-dupe, newest first.
  const seen = new Set<string>();
  const uniq = frames
    .filter((f) => {
      if (seen.has(f.url)) return false;
      seen.add(f.url);
      return true;
    })
    .sort((a, b) => Date.parse(b.capturedUtc) - Date.parse(a.capturedUtc));

  // Bucket by camera, each bucket already newest-first.
  const buckets = new Map<string, Frame[]>();
  for (const f of uniq) {
    const cam = f.instrument.toUpperCase();
    const b = buckets.get(cam);
    if (b) b.push(f);
    else buckets.set(cam, [f]);
  }

  // Camera order: surface cameras first (ranked by their newest frame), so the
  // hero is a real landscape, not a sky/engineering shot.
  const cams = [...buckets.keys()].sort((a, b) => {
    const pa = PREFERRED.some((p) => a.includes(p)) ? 0 : 1;
    const pb = PREFERRED.some((p) => b.includes(p)) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return Date.parse(buckets.get(b)![0]!.capturedUtc) - Date.parse(buckets.get(a)![0]!.capturedUtc);
  });

  // Round-robin: one frame from each camera per pass.
  const out: Frame[] = [];
  for (let i = 0, added = true; added; i++) {
    added = false;
    for (const cam of cams) {
      const bucket = buckets.get(cam)!;
      if (i < bucket.length) {
        out.push(bucket[i]!);
        added = true;
      }
    }
  }
  return out;
}

// ---- source adapters -------------------------------------------------------

async function fetchMars2020(): Promise<Frame[]> {
  const url =
    'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=120&order=sol+desc';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`mars2020 feed HTTP ${res.status}`);
  const json = (await res.json()) as {
    images?: {
      sol?: number;
      date_taken_utc?: string;
      credit?: string;
      camera?: { instrument?: string };
      image_files?: { large?: string; full_res?: string; medium?: string; small?: string };
    }[];
  };
  return (json.images ?? [])
    .filter((im) => im.date_taken_utc && im.camera?.instrument)
    .map((im) => {
      const f = im.image_files ?? {};
      // full_res is the native original (often PNG); fall back downward.
      const best = f.full_res ?? f.large ?? f.medium ?? f.small;
      return best
        ? {
            sol: im.sol ?? null,
            instrument: im.camera!.instrument!,
            capturedUtc: new Date(im.date_taken_utc!).toISOString(),
            url: best,
            sourceUrl: f.full_res ?? best,
            credit: im.credit?.trim() || 'NASA/JPL-Caltech',
          }
        : null;
    })
    .filter((f): f is Frame => f !== null);
}

async function fetchMsl(): Promise<Frame[]> {
  const url =
    'https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=120&condition_1=msl:mission';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`msl feed HTTP ${res.status}`);
  const json = (await res.json()) as {
    // this endpoint names the capture time `date_taken` (already UTC ISO).
    // Every full frame ships with a low-res `is_thumbnail` twin; keep only the
    // full ones so the wall isn't half grainy previews.
    items?: { sol?: number; instrument?: string; date_taken?: string; url?: string; is_thumbnail?: boolean }[];
  };
  return (json.items ?? [])
    .filter((im) => im.date_taken && im.instrument && im.url && !im.is_thumbnail)
    .map((im) => ({
      sol: im.sol ?? null,
      instrument: im.instrument!,
      capturedUtc: new Date(im.date_taken!).toISOString(),
      url: im.url!,
      sourceUrl: im.url!,
      credit: 'NASA/JPL-Caltech/MSSS',
    }));
}

async function fetchEpic(): Promise<Frame[]> {
  // DSCOVR/EPIC full-disk Earth. No key; epic.gsfc.nasa.gov serves CORS `*`.
  const res = await fetch('https://epic.gsfc.nasa.gov/api/natural', { headers: UA });
  if (!res.ok) throw new Error(`epic feed HTTP ${res.status}`);
  const json = (await res.json()) as { image?: string; date?: string; caption?: string }[];
  return (json ?? [])
    .filter((im) => im.image && im.date)
    .map((im) => {
      // date looks like "2026-08-17 23:45:00" (UTC). Build the archive JPG path.
      const iso = im.date!.replace(' ', 'T') + 'Z';
      const [y, mo, d] = im.date!.slice(0, 10).split('-');
      const dir = `https://epic.gsfc.nasa.gov/archive/natural/${y}/${mo}/${d}`;
      return {
        sol: null,
        instrument: 'EPIC',
        capturedUtc: new Date(iso).toISOString(),
        url: `${dir}/jpg/${im.image}.jpg`, // 2048px jpg — download source
        sourceUrl: `${dir}/png/${im.image}.png`, // native PNG — max quality
        credit: 'NASA / NOAA / DSCOVR EPIC',
      };
    })
    .reverse(); // API returns oldest→newest; we want newest first
}

const ADAPTERS: Record<string, () => Promise<Frame[]>> = {
  mars2020: fetchMars2020,
  msl: fetchMsl,
  epic: fetchEpic,
};

// ---- image + housekeeping --------------------------------------------------

/**
 * Download an image once and write two local sizes:
 *   {base}.jpg      ~720px  (map chip / HUD / strip)
 *   {base}-full.jpg ~1600px (full-screen viewer + one-click HQ download)
 * Returns the two public paths.
 */
async function downloadFrame(
  url: string,
  base: string,
): Promise<{ file: string; full: string }> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`image download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const thumbName = `${base}.jpg`;
  const fullName = `${base}-full.jpg`;
  await Promise.all([
    sharp(buf)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(join(FRAMES_DIR, thumbName)),
    sharp(buf)
      .resize({ width: FULL_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(join(FRAMES_DIR, fullName)),
  ]);
  return { file: `/frames/${thumbName}`, full: `/frames/${fullName}` };
}

async function pruneOldFrames(keep: Set<string>): Promise<void> {
  let files: string[];
  try {
    files = await readdir(FRAMES_DIR);
  } catch {
    return;
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;
  for (const f of files) {
    if (!f.endsWith('.jpg') || keep.has(f)) continue;
    const p = join(FRAMES_DIR, f);
    const s = await stat(p);
    if (s.mtimeMs < cutoff) {
      await unlink(p);
      console.log(`  pruned ${f} (>${MAX_AGE_DAYS}d old)`);
    }
  }
}

/** Download the latest full-disk Sun image (non-fatal on failure). */
async function fetchSun(): Promise<void> {
  try {
    const res = await fetch(SUN_URL, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Crop to the solar disc (the 512px frame has margins + a bottom text bar).
    await sharp(buf)
      .extract({ left: 21, top: 16, width: 470, height: 470 })
      .resize({ width: 560 })
      .jpeg({ quality: 86 })
      .toFile(SUN_OUT);
    console.log('  ✓ Sun (SDO/AIA 171)');
  } catch (err) {
    console.warn(`  ! Sun image skipped (non-fatal): ${(err as Error).message}`);
  }
}

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY, 'utf8')) as Registry;
  const imaging = registry.filter((c) => c.imagery);
  const out: FramesData = {};
  const kept = new Set<string>();

  let previous: FramesData = {};
  try {
    previous = JSON.parse(await readFile(FRAMES_OUT, 'utf8')) as FramesData;
  } catch {
    /* first run */
  }

  console.log(`\nRaw frames — ${imaging.length} imaging craft\n`);

  for (const craft of imaging) {
    const source = craft.imagery!.source;
    const adapter = ADAPTERS[source];
    if (!adapter) {
      console.warn(`  ! ${craft.name}: no adapter for source "${source}" — skipped`);
      continue;
    }
    try {
      const ordered = orderFrames(await adapter());
      if (ordered.length === 0) {
        console.warn(`  ! ${craft.name}: no frame with a trustworthy timestamp — skipped`);
        continue;
      }
      const recent: FrameThumb[] = [];
      for (const f of ordered.slice(0, RECENT_COUNT)) {
        const base = frameBase(craft.id, f);
        let paths: { file: string; full: string };
        try {
          paths = await downloadFrame(f.url, base);
        } catch (e) {
          console.warn(`    · ${craft.name}: skipped a frame (${(e as Error).message})`);
          continue;
        }
        kept.add(`${base}.jpg`);
        kept.add(`${base}-full.jpg`);
        recent.push({
          file: paths.file,
          full: paths.full,
          sourceUrl: f.sourceUrl,
          instrument: f.instrument,
          capturedUtc: f.capturedUtc,
          sol: f.sol,
        });
      }
      if (recent.length === 0) {
        console.warn(`  ! ${craft.name}: all frame downloads failed — skipped`);
        continue;
      }
      const hero = recent[0]!;
      const primaryFrame = ordered[0]!;
      const entry: FrameData = {
        sol: hero.sol,
        instrument: hero.instrument,
        capturedUtc: hero.capturedUtc,
        file: hero.file,
        full: hero.full,
        sourceUrl: hero.sourceUrl,
        credit: primaryFrame.credit,
        recent,
      };
      out[craft.id] = entry;
      console.log(
        `  ✓ ${craft.name.padEnd(14)} sol ${hero.sol}  ${hero.instrument}  ${entry.capturedUtc}  (+${recent.length - 1} recent)`,
      );
    } catch (err) {
      console.warn(`  ! ${craft.name}: ${(err as Error).message} — keeping previous frame if any`);
      const prev = previous[craft.id];
      if (prev) {
        out[craft.id] = prev;
        const base = (p: string) => p.replace('/frames/', '');
        kept.add(base(prev.file));
        if (prev.full) kept.add(base(prev.full));
        for (const t of prev.recent ?? []) {
          kept.add(base(t.file));
          if (t.full) kept.add(base(t.full));
        }
      }
    }
  }

  await pruneOldFrames(kept);
  await writeFile(FRAMES_OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote frames.json with ${Object.keys(out).length} entries.`);

  console.log('\nSun:');
  await fetchSun();
}

main().catch((err) => {
  console.error('fetch-frames fatal:', err);
  process.exitCode = 1;
});
