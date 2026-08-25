// ---------------------------------------------------------------------------
// generate-og.ts — build the 1200×630 Open Graph card at build time.
// A log-radial ring motif evoking the map, with Voyager 1's REAL one-way light
// time (read from fleet.json) overlaid. No invented numbers.
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { FleetData } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLEET = join(ROOT, 'public', 'data', 'fleet.json');
const LOGO = join(ROOT, 'public', 'sublight.svg');
const OUT = join(ROOT, 'public', 'og.png');

const W = 1200;
const H = 630;
const CX = 300;
const CY = 315;

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

  // Embed the Sublight wordmark (strip its outer <svg> wrapper, scale into place).
  let logo = `<text x="720" y="150" font-family="'IBM Plex Sans', sans-serif" font-size="76" fill="#DCE2EC">Sublight</text>`;
  try {
    const raw = await readFile(LOGO, 'utf8');
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    logo = `<g transform="translate(720,92) scale(0.42)">${inner}</g>`;
  } catch {
    console.warn('generate-og: sublight.svg unavailable, using text wordmark');
  }

  // Log-radial rings, matching the map's compression.
  const rings = [1, 5, 30, 120]
    .map((au) => {
      const r = (Math.log10(1 + au * 400) / Math.log10(1 + 200 * 400)) * 520;
      return `<circle cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="none" stroke="#232B37" stroke-width="1"/>`;
    })
    .join('');

  const stars = Array.from({ length: 90 }, () => {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const o = (Math.random() * 0.4 + 0.1).toFixed(2);
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="1.4" height="1.4" fill="#AEB9CC" opacity="${o}"/>`;
  }).join('');

  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#06080B"/>
    ${stars}
    ${rings}
    <circle cx="${CX}" cy="${CY}" r="34" fill="#E5B571" opacity="0.16"/>
    <circle cx="${CX}" cy="${CY}" r="5" fill="#E5B571"/>
    <line x1="${CX}" y1="${CY}" x2="1040" y2="120" stroke="#E5B571" stroke-width="1.5" stroke-dasharray="3 6" opacity="0.5"/>
    ${logo}
    <text x="722" y="205" font-family="'IBM Plex Mono', monospace" font-size="19" fill="#6E7889" letter-spacing="1.2">NOTHING YOU SEE IS HAPPENING NOW.</text>
    <text x="722" y="430" font-family="'IBM Plex Mono', monospace" font-size="17" fill="#454D5C" letter-spacing="3">VOYAGER 1 · ONE-WAY LIGHT TIME</text>
    <text x="722" y="500" font-family="'IBM Plex Mono', monospace" font-size="64" fill="#E5B571" letter-spacing="-1">${owltLabel}</text>
    <text x="722" y="560" font-family="'IBM Plex Mono', monospace" font-size="15" fill="#454D5C" letter-spacing="2">${owltLabel === '—' ? '' : 'MEASURED, NOT IMAGINED · JPL HORIZONS'}</text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(OUT);
  console.log(`Wrote og.png (Voyager 1 OWLT = ${owltLabel}).`);
}

main().catch((err) => {
  console.error('generate-og fatal:', err);
  process.exitCode = 1;
});
