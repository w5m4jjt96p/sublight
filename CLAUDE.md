# Sublight

Static showcase site. A map of the solar system showing the ~16 active robotic
probes, with one central thesis: **nothing you see is happening now.** Everything
is already as old as the signal's travel time.

## Stack
- Vite + React + TypeScript
- Canvas 2D for the map (no 3D lib, no D3)
- No runtime dependency beyond React
- Static deployment (Cloudflare Pages)

## Absolute architectural constraint
ZERO BACKEND. No API key is ever exposed to the client.
All external data is fetched by a daily GitHub Action that writes static JSON
files into `/public/data/`. The client only reads those files.
The one exception is the DSN live feed, which the browser fetches directly
because `eyes.nasa.gov` serves `Access-Control-Allow-Origin: *` (verified).
If a feature seems to require a server, stop and flag it rather than
improvising a proxy.

## Design tokens (from the prototype, do not invent)
```
--void:#06080B  --panel:#0C0F15  --rule:#171C25  --rule-2:#232B37
--txt:#DCE2EC   --dim:#6E7889    --dim-2:#454D5C
--signal:#8FD6E6  (active)
--delay:#E5B571   (RESERVED for light-time values and imaging craft)
--dead:#3B4250    (silent / retired)
```
Type: Roboto Mono for numbers + small text (`--mono`), Stack Sans Notch for big
titles / craft names (`--sans`). IBM Plex Mono/Sans stay bundled as per-glyph
fallbacks for symbols the display faces lack (— · ↗ ≈ °).

## Colour rule
Amber `--delay` serves ONLY TWO things: light-time values, and craft that
return public imagery. Never use it as decoration.

## Data rule
No displayed numeric value may be invented or hard-coded.
If a value is unavailable, show "—" and log a build warning.
Never fill a gap with a plausible estimate.

## Data pipeline (see /scripts)
- `fetch-ephemerides.ts` — JPL Horizons vectors → position + light-time → `fleet.json`
- `fetch-frames.ts` — mars.nasa.gov raw images → `frames.json` + thumbnails
- `fetch-dsn.ts` — optional CI snapshot of the DSN (client also polls it live)
- `verify.ts` — post-build sanity checks, logs every anomaly by craft name

Editorial truth lives in `/data/registry.json` (hand-versioned, time-invariant).
Everything time-varying is generated. See README for adding a craft.
