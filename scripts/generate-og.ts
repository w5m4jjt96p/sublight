// ---------------------------------------------------------------------------
// generate-og.ts — build the 1200×630 Open Graph card at build time.
// The brand card: the wordmark, the thesis, and one real number, Voyager 1's
// one-way light time read from fleet.json. No invented numbers.
// The type is Stack Sans Notch and Geist Mono, from scripts/og-fonts, turned into outlines with
// opentype.js: no system font is involved, so the card is the same on a laptop
// and in CI.
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';
import type { FleetData } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(ROOT, 'scripts', 'og-fonts');
const FLEET = join(ROOT, 'public', 'data', 'fleet.json');
const LOGO = join(ROOT, 'public', 'sublight.svg');
const OUT = join(ROOT, 'public', 'og.png');

const W = 1200;
const H = 630;

function fmtOwlt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

async function main() {
  let owltLabel = '—';
  try {
    const fleet = JSON.parse(await readFile(FLEET, 'utf8')) as FleetData;
    const v1 = fleet.craft.find((c) => c.id === 'voyager-1');
    if (v1) owltLabel = fmtOwlt(v1.owltSeconds);
  } catch {
    console.warn('generate-og: fleet.json unavailable, using em dash');
  }

  // The wordmark is paths already (public/sublight.svg); scale it into place.
  let logo = `<text x="80" y="118" font-family="Stack Sans Notch" font-size="44" fill="#F5F5F7">Sublight</text>`;
  try {
    const raw = await readFile(LOGO, 'utf8');
    const vb = raw.match(/viewBox="([^"]+)"/)![1]!.split(/\s+/).map(Number);
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const h = 40, k = h / vb[3]!;
    logo = `<g fill="#F5F5F7" transform="translate(80,80) scale(${k.toFixed(5)}) translate(${-vb[0]!},${-vb[1]!})">${inner}</g>`;
  } catch {
    console.warn('generate-og: sublight.svg unavailable, using text wordmark');
  }

  // Log-radial rings, matching the map's compression, rising off the bottom right.
  const RX = 1040, RY = 640;
  const rings = [1, 5, 30, 120]
    .map((au, i) => {
      const r = (Math.log10(1 + au * 400) / Math.log10(1 + 200 * 400)) * 560;
      return `<circle cx="${RX}" cy="${RY}" r="${r.toFixed(1)}" fill="none" stroke="#FFFFFF" stroke-opacity="${(0.1 - i * 0.015).toFixed(3)}" stroke-width="1"/>`;
    })
    .join('');

  // Type as outlines: x, baseline y, size px, tracking in em.
  const semi = await opentype.load(join(FONTS, 'StackSansNotch-SemiBold.ttf'));
  const mono = await opentype.load(join(FONTS, 'GeistMono-Medium.ttf'));
  const set = (font: opentype.Font, text: string, x: number, y: number, size: number, trackEm: number, fill: string) => {
    const k = size / font.unitsPerEm;
    const glyphs = font.stringToGlyphs(text);
    let d = '';
    glyphs.forEach((g, i) => {
      d += g.getPath(x, y, size).toPathData(2);
      const next = glyphs[i + 1];
      x += (g.advanceWidth ?? 0) * k + (next ? font.getKerningValue(g, next) * k : 0) + trackEm * size;
    });
    return `<path d="${d}" fill="${fill}"/>`;
  };
  const type = [
    set(semi, 'Nothing you see', 78, 290, 68, -0.03, '#F5F5F7'),
    set(semi, 'is happening now.', 78, 368, 68, -0.03, '#67676F'),
    set(mono, 'VOYAGER 1 · ONE-WAY LIGHT-TIME', 80, 500, 15, 0.08, '#67676F'),
    set(mono, owltLabel, 78, 558, 48, -0.03, '#F2B766'),
  ].join('');

  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="${RX}" cy="${RY}" r="420" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#F2B766" stop-opacity="0.16"/><stop offset="1" stop-color="#F2B766" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#000000"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${rings}
    <circle cx="${RX}" cy="${RY}" r="7" fill="#F2B766"/>
    ${logo}
    ${type}
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(OUT);
  console.log(`Wrote og.png (Voyager 1 OWLT = ${owltLabel}).`);
}

main().catch((err) => {
  console.error('generate-og fatal:', err);
  process.exitCode = 1;
});
