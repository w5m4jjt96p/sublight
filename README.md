# Sublight

A static map of the solar system's ~16 active robotic probes, built around one
idea: **nothing you see is happening now.** Every distance is a light-time, and
every light-time is measured, not imagined.

Live map · fleet register · real Mars rover frames with their true capture times
· live Deep Space Network contact. No backend, no API keys in the client.

## How it works

```
data/registry.json         hand-edited editorial truth (time-invariant)
        │
        ▼   daily GitHub Action
scripts/fetch-ephemerides   JPL Horizons  → public/data/fleet.json + planets.json
scripts/fetch-frames        JPL raw feeds → public/data/frames.json + /public/frames
scripts/fetch-dsn           DSN snapshot  → public/data/dsn.json (client also polls live)
scripts/generate-og         → public/og.png
scripts/verify              sanity checks, logs anomalies by craft
        │
        ▼
src/  (Vite + React + Canvas 2D)  reads the JSON, renders the map
```

The client **only reads static JSON**. The single live call the browser makes is
to the DSN feed (`eyes.nasa.gov`), which serves `Access-Control-Allow-Origin: *`
— verified, so no proxy is needed. If a feature ever seems to need a server,
that's a bug in the design, not a reason to add one.

## Develop

```bash
npm install
npm run data:ephemerides   # generate real fleet.json / planets.json
npm run data:frames        # download + resize rover frames
npm run dev                # http://localhost:5173
```

Other scripts: `npm run data:dsn`, `npm run og`, `npm run data:verify`,
`npm run data:probe -- -31` (inspect one Horizons body), `npm test`,
`npm run build`.

## Adding a craft

**It is one JSON entry — nothing else.** Append an object to
[`data/registry.json`](data/registry.json):

```json
{
  "id": "hera",
  "name": "Hera",
  "naifId": -91,
  "agency": "ESA",
  "launched": "2024-10-07",
  "arrived": null,
  "status": "cruise",
  "kind": "flyby",
  "host": null,
  "location": "Cruise to Didymos",
  "imagery": null,
  "note": "One sober, factual sentence. No space lyricism."
}
```

Rules the pipeline relies on:

- **`naifId`** is the JPL NAIF ID (negative for spacecraft). **Verify it** on
  [Horizons](https://ssd.jpl.nasa.gov/horizons/) — don't trust memory. If the
  craft has none (e.g. a lunar rover), set `naifId: null` and give it a `host`.
- **`host`** is the body the pipeline falls back to when the craft itself has no
  queryable trajectory (surface rovers, lapsed ephemerides). Required whenever
  `naifId` is `null`.
- **`imagery`** — set `{ "source": "mars2020" | "msl" | "epic" }` only if a
  no-key raw feed exists (Perseverance, Curiosity, DSCOVR respectively). Add new
  sources as adapters in `scripts/fetch-frames.ts`. Leave `null` otherwise; the
  craft keeps an empty "telemetry only" frame, which is part of the story.
- Everything time-varying (distance, light-time, last contact) is generated.
  Never put such a value in the registry.

Then run `npm run data:ephemerides` (and `data:frames` if it images), or just
let the daily Action do it. `npm test` validates the registry against the type.

## Colour rule

Amber (`--delay`) means exactly two things: a light-time value, or a craft that
returns public imagery. Never decoration. See [CLAUDE.md](CLAUDE.md).

## Deploy

Static build, no server functions.

```bash
npm run build     # → dist/
```

Cloudflare Pages: build command `npm run build`, output directory `dist`.
The daily [`refresh.yml`](.github/workflows/refresh.yml) Action commits fresh
data to `main`; Pages redeploys on push. A day-stale site is acceptable; a
broken one is not, so a failing fetch keeps the last good value and opens an
issue instead of failing the build.

## Data & credits

Positions/distances: NASA/JPL [Horizons](https://ssd.jpl.nasa.gov/horizons/).
Rover frames: JPL public raw-image feeds (Mars 2020, MSL), public domain,
credited per frame (NASA/JPL-Caltech and instrument teams). Contact state:
NASA [Deep Space Network](https://eyes.nasa.gov/dsn/dsn.html). Nothing here
implies a partnership with or endorsement by NASA/JPL. If ESA sources are added
later, their licence differs (CC BY-SA 3.0 IGO) — the `credit` field already
exists for that.
