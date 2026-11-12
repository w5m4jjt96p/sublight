# Sublight

Static showcase site. A map of the solar system showing the ~16 active robotic
probes, with one central thesis: **nothing you see is happening now.** Everything
is already as old as the signal's travel time.

## Stack
- Vite + React + TypeScript
- The map is raw WebGL (hand-written shaders and matrices, `src/map/gl/`), with a
  Canvas 2D overlay for chips and labels. The flat Canvas 2D map is the fallback
  when WebGL is missing, and the reader's choice with `?map3d=0`. No 3D lib, no D3
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

## Brand and design tokens
The brand (logo, colour, type, voice) is specified in `docs/brand.md`; the
values live in `src/styles/tokens.css`, mirrored in `src/map/palette.ts` and
`ios/Sublight/Theme.swift`. Do not invent values outside those files.
```
--void:#000000  --panel:#0B0B0D  --panel-2:#131316  --panel-3:#1B1B1F
--rule: white 8%  --rule-2: white 14%
--txt:#F5F5F7   --dim:#9D9DA5    --dim-2:#67676F
--signal:#74D4F0  (active, interactive)
--delay:#F2B766   (RESERVED for light-time values and imaging craft)
--dead:#3C3C43    (silent / retired)
--alert:#FF7A66   (storm-level space weather only)
```
Type: Stack Sans Notch for titles and craft names (`--display`), Geist for
everything else people read (`--sans`), Geist Mono only for measured values,
units, timestamps and counts (`--mono`). The logo is unchanged
(`public/sublight.svg`). Micro-labels naming a value are
Geist Mono 11px, uppercase, +0.08em: the only uppercase text. Paragraphs are
never mono.

## Colour rule
Amber `--delay` serves ONLY TWO things: light-time values, and craft that
return public imagery. Never use it as decoration, for buttons, prices or headlines.

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

## Suivi STATUS.md (Établi)

Après chaque tâche terminée qui a modifié ce repo, et avant de rendre la main, crée ou mets à jour `STATUS.md` à la racine du repo, au format suivant :

```markdown
---
app: <identifiant court en minuscules, stable>
nom: <nom de l'app>
statut: idee|dev|testflight|review|live|pause
plateformes: [iOS, watchOS, tvOS, web]
attente: bloquant|valider|relire|aucune
date: AAAA-MM-JJ
session: <id de la session Claude Code en cours>
dossier: <chemin absolu du repo>
---

## Ce qui attend Florian
<une phrase, ou "Rien">

## Prochaine étape
<une phrase>

## Fait aujourd'hui
<quelques puces>
```

Garde `app` identique d'une session à l'autre. Remplace le contenu à chaque mise à jour, sans historique.
