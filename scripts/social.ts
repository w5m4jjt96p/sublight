// ---------------------------------------------------------------------------
// social.ts — the daily Sublight post to X.
//
// Runs after the data refresh in CI. Every post is DETERMINISTIC and built from
// the generated JSON, so no number is ever invented (the project's data rule).
// Posts carry the site link, which unfurls a card via the OG image.
//
//   --dry (default)  print today's post + a 7-day preview, post nothing
//   --live           post to X if credentials are in the env
//
// Credentials (env / GitHub Actions secrets):
//   X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET   (OAuth 1.0a)
// ---------------------------------------------------------------------------
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://sublight.observer';

// ---- formatting (self-contained; never invents a value) -------------------
function fmtDur(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} min ${r} s` : `${m} min`; }
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return m ? `${h} h ${m} min` : `${h} h`; }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return h ? `${d} d ${h} h` : `${d} d`;
}
function fmtAu(au: number): string {
  if (au >= 100) return `${au.toFixed(0)} AU`;
  if (au >= 10) return `${au.toFixed(1)} AU`;
  return `${au.toFixed(2)} AU`;
}
function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} days`;
}

// ---- data -----------------------------------------------------------------
interface Post { kind: string; text: string; link: string; imagePath?: string; alt?: string }

async function loadJson(p: string): Promise<any> {
  return JSON.parse(await readFile(join(ROOT, p), 'utf8'));
}

async function loadData() {
  const [fleet, registry, frames] = await Promise.all([
    loadJson('public/data/fleet.json'),
    loadJson('data/registry.json'),
    loadJson('public/data/frames.json').catch(() => ({})),
  ]);
  const regById: Record<string, any> = Object.fromEntries(registry.map((r: any) => [r.id, r]));
  const ephById: Record<string, any> = Object.fromEntries(fleet.craft.map((c: any) => [c.id, c]));
  return { fleet, registry, frames, regById, ephById };
}

// ---- content generators ---------------------------------------------------
// Curated craft that make punchy light-time posts, rotated by day-of-year.
const SPOTLIGHT = [
  'voyager-1', 'perseverance', 'new-horizons', 'jwst', 'voyager-2',
  'parker-solar-probe', 'curiosity', 'psyche', 'europa-clipper', 'juice', 'lucy',
];
const REGION: Record<string, string> = { perseverance: 'Jezero Crater', curiosity: 'Gale Crater' };

function link(id?: string) { return id ? `${SITE}/#c/${id}` : SITE; }

function genLightTime(d: any, dayOfYear: number): Post | null {
  const id = SPOTLIGHT[dayOfYear % SPOTLIGHT.length]!;
  const reg = d.regById[id], eph = d.ephById[id];
  if (!reg || !eph) return null;
  const owlt = eph.owltSeconds;
  return {
    kind: 'light-time',
    text: `Right now, a signal to ${reg.name} takes ${fmtDur(owlt)} to reach Earth. A round trip is ${fmtDur(owlt * 2)}. Everything we see of it is already that old.`,
    link: link(id),
  };
}

function genFarthest(d: any): Post | null {
  let far: any = null;
  for (const c of d.fleet.craft) if (!far || c.rangeAu > far.rangeAu) far = c;
  if (!far) return null;
  const reg = d.regById[far.id];
  return {
    kind: 'farthest',
    text: `The most distant working spacecraft, ${reg?.name ?? far.id}, is ${fmtAu(far.rangeAu)} from Earth. Its signal takes ${fmtDur(far.owltSeconds)} to arrive. Nothing we know of it is happening now.`,
    link: link(far.id),
  };
}

function genFleetPulse(d: any): Post {
  const ranges = d.fleet.craft.map((c: any) => c.owltSeconds);
  const near = Math.min(...ranges), farr = Math.max(...ranges);
  return {
    kind: 'fleet-pulse',
    text: `${d.fleet.craft.length} robotic explorers are still working across the solar system tonight, from rovers on Mars to two probes in interstellar space. Their signals reach us between ${fmtDur(near)} and ${fmtDur(farr)} old.`,
    link: SITE,
  };
}

function genRoverFrame(d: any, maxAgeDays = 4): Post | null {
  const now = Date.now();
  for (const id of ['perseverance', 'curiosity']) {
    const f = d.frames[id];
    if (!f?.capturedUtc) continue;
    const ageDays = (now - new Date(f.capturedUtc).getTime()) / 86400000;
    if (ageDays > maxAgeDays) continue;
    const reg = d.regById[id];
    return {
      kind: 'rover-frame',
      text: `${reg?.name ?? id} sent home a new view of ${REGION[id] ?? 'Mars'} (sol ${f.sol}). This light left Mars ${fmtAgo(f.capturedUtc, now)} ago.`,
      link: link(id),
      imagePath: join('public', f.file.replace(/^\//, '')),
      alt: `Raw ${f.instrument} frame from ${reg?.name ?? id} on Mars, sol ${f.sol}.`,
    };
  }
  return null;
}

function genOnThisDay(d: any, date: Date): Post | null {
  const mm = date.getUTCMonth(), dd = date.getUTCDate();
  for (const r of d.registry) {
    for (const [field, verb] of [['arrived', 'arrived at'], ['launched', 'launched toward']] as const) {
      const iso = r[field];
      if (!iso) continue;
      const ev = new Date(iso + 'T00:00:00Z');
      if (ev.getUTCMonth() !== mm || ev.getUTCDate() !== dd) continue;
      const years = date.getUTCFullYear() - ev.getUTCFullYear();
      if (years < 1) continue;
      const eph = d.ephById[r.id];
      const tail = eph ? ` Today its signal takes ${fmtDur(eph.owltSeconds)} to reach us.` : '';
      const dest = r.location || 'space';
      return {
        kind: 'on-this-day',
        text: `${years} year${years > 1 ? 's' : ''} ago today, ${r.name} ${verb} ${dest}.${tail}`,
        link: link(r.id),
      };
    }
  }
  return null;
}

// Deterministic pick: anniversaries win; otherwise a weekly rhythm with a fresh
// rover frame taking priority on two days.
function pickPost(d: any, date: Date): Post {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  const dow = date.getUTCDay(); // 0 Sun .. 6 Sat

  const anniversary = genOnThisDay(d, date);
  if (anniversary) return anniversary;

  const rover = genRoverFrame(d);
  const schedule: (Post | null)[] = {
    0: [genFleetPulse(d)],
    1: [genLightTime(d, dayOfYear + 3)],
    2: [genLightTime(d, dayOfYear)],
    3: [rover, genLightTime(d, dayOfYear + 6)],
    4: [genFarthest(d)],
    5: [rover, genLightTime(d, dayOfYear + 9)],
    6: [genLightTime(d, dayOfYear + 1)],
  }[dow] as (Post | null)[];
  return schedule.find(Boolean) ?? genFleetPulse(d);
}

// ---- rendering ------------------------------------------------------------
function render(post: Post): string {
  return `${post.text}\n\n${post.link}`;
}

// ---- X / Twitter (API v2, OAuth 1.0a user context) ------------------------
function oauthHeader(method: string, url: string): string {
  const k = {
    key: process.env.X_API_KEY!, secret: process.env.X_API_SECRET!,
    token: process.env.X_ACCESS_TOKEN!, tokenSecret: process.env.X_ACCESS_SECRET!,
  };
  const enc = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const oauth: Record<string, string> = {
    oauth_consumer_key: k.key,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: k.token,
    oauth_version: '1.0',
  };
  // JSON body params are not part of the signature base (no query params here).
  const paramStr = Object.keys(oauth).sort().map((key) => `${enc(key)}=${enc(oauth[key]!)}`).join('&');
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramStr)}`;
  const signingKey = `${enc(k.secret)}&${enc(k.tokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort().map((key) => `${enc(key)}="${enc(oauth[key]!)}"`).join(', ');
}

async function postX(post: Post): Promise<void> {
  if (!process.env.X_API_KEY || !process.env.X_ACCESS_TOKEN) { console.log('  · X: no credentials, skipped'); return; }
  const url = 'https://api.twitter.com/2/tweets';
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: oauthHeader('POST', url), 'content-type': 'application/json' },
    body: JSON.stringify({ text: render(post) }),
  });
  if (!res.ok) throw new Error(`X ${res.status}: ${await res.text()}`);
  console.log('  · X: posted');
}

// ---- main -----------------------------------------------------------------
function imageUrl(post: Post): string | null {
  return post.imagePath ? `${SITE}/${post.imagePath.replace(/^public\//, '')}` : null;
}

async function main() {
  const live = process.argv.includes('--live');
  const outIdx = process.argv.indexOf('--out');
  const d = await loadData();
  const today = new Date();
  const post = pickPost(d, today);

  console.log(`\nPost of the day [${post.kind}] — ${render(post).length} chars`);
  console.log('┌────────────────────────────────────────────');
  render(post).split('\n').forEach((l) => console.log('│ ' + l));
  if (post.imagePath) console.log('│ 🖼  ' + post.imagePath);
  console.log('└────────────────────────────────────────────');

  // Write the ready-to-paste post to a file (for the manual copy-paste flow).
  if (outIdx !== -1 && process.argv[outIdx + 1]) {
    const img = imageUrl(post);
    const body = render(post) + (img ? `\n\nImage to attach: ${img}` : '') + '\n';
    await writeFile(process.argv[outIdx + 1]!, body);
    console.log(`\nWrote ${process.argv[outIdx + 1]}`);
    return;
  }

  if (!live) {
    console.log('\n7-day preview:');
    for (let i = 0; i < 7; i++) {
      const dt = new Date(today.getTime() + i * 86400000);
      const p = pickPost(d, dt);
      console.log(`  ${dt.toISOString().slice(0, 10)}  [${p.kind}]  ${p.text.slice(0, 88)}${p.text.length > 88 ? '…' : ''}`);
    }
    console.log('\n(dry run — pass --live with credentials in the env to publish)');
    return;
  }

  console.log('\nPublishing:');
  try { await postX(post); } catch (e) { console.error('  ! ' + (e as Error).message); }
}

main().catch((e) => { console.error(e); process.exit(1); });
