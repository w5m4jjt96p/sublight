# Sublight brand

Sublight is an instrument that shows you the solar system's robots and what they
send home. One idea runs through all of it: **nothing you see is happening
now.** Everything is as old as the light that carried it here.

The brand should feel like a precise piece of equipment made by a large,
careful company: calm, exact, quiet. The photos are the colour; the frame
around them stays out of their way.

## Principles

1. **The content is the colour.** True black, neutral greys, white type. The
   only colours are the three signals below, and each has one job.
2. **Three faces, three jobs.** Stack Sans Notch for titles and craft names,
   Geist for everything else people read, Geist Mono only for what an
   instrument measured.
3. **Fewer, larger, calmer.** One headline per screen. Generous space. No
   decoration that does not carry information.
4. **Glass floats, panels hold.** Translucent material is for chrome that sits
   over content (navigation, map panels, sheets). Content sits on solid panels.
5. **Say it plainly.** Short sentences, sentence case, no exclamation marks, no
   em dashes in interface copy.

## Logo

The original Sublight logo is kept: the light glint followed by the wordmark
set in Stack Sans Notch.

- Files: `public/sublight.svg` (wordmark, white), `public/favicon.svg` (glint on
  black), `ios/Sublight/Assets.xcassets/AppIcon.appiconset/icon-1024.png`.
- White on dark. Never tinted, never outlined, never on a busy photo without a
  scrim. Minimum height 18 px.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--void` | `#000000` | Canvas |
| `--panel` | `#0B0B0D` | Content surfaces |
| `--panel-2` | `#131316` | Raised surfaces, image wells |
| `--panel-3` | `#1B1B1F` | Highest surfaces, placeholders |
| `--rule` | white 8 % | Hairlines |
| `--rule-2` | white 14 % | Borders on floating chrome |
| `--txt` | `#F5F5F7` | Primary text |
| `--dim` | `#9D9DA5` | Secondary text |
| `--dim-2` | `#67676F` | Tertiary text, micro-labels |
| `--signal` | `#74D4F0` | Active, selected, interactive |
| `--delay` | `#F2B766` | **Reserved:** light-time values and craft that return imagery |
| `--dead` | `#3C3C43` | Silent or retired craft |
| `--alert` | `#FF7A66` | Storm-level space weather, nothing else |

Amber is never decoration, never a button, never a price, never a headline.

## Type

| Role | Face | Size / weight / tracking |
|---|---|---|
| Display | Stack Sans Notch | 40–64 px / 500 / −0.03 em |
| Title 1 | Stack Sans Notch | 30–40 px / 500 / −0.02 em |
| Title 2 | Stack Sans Notch | 24 px / 500 / −0.02 em |
| Title 3 | Stack Sans Notch | 20 px / 500 / −0.02 em |
| Headline, craft names | Stack Sans Notch | 17 px / 500 |
| Body | Geist | 17 px / 400 / −0.011 em, line height 1.5–1.6 |
| Footnote | Geist | 13 px / 400 |
| Value | Geist Mono | any size / 500, tabular figures |
| Micro-label | Geist Mono | 11 px / 500 / +0.08 em / UPPERCASE |

Micro-labels name a value ("LIGHT-TIME", "RANGE"). They are the only uppercase
text. Paragraphs are never set in mono.

## Geometry and material

- Radii: 6 (chips), 10 (thumbnails), 14 (cards, buttons in groups), 22
  (panels, sheets), pill (buttons, navigation).
- Glass: `rgb(22 22 26 / 0.7)` with `saturate(180%) blur(24px)`, a 14 % white
  hairline and a soft shadow.
- Buttons: primary is white on black text, pill. Secondary is glass, pill.
  Tinted actions use the signal colour at 10 % behind signal text.

## Motion

Ease `cubic-bezier(0.22, 0.61, 0.36, 1)`; out `cubic-bezier(0.16, 1, 0.3, 1)`.
0.15 s for state, 0.28 s for panels, 0.5 s for images settling. Everything
respects reduced motion.

## Voice

- Precise and calm. State what was measured, where it came from, how old it is.
- "Light-time 11m 51s", not "Its light took 11 min 51 s to cross the void".
- The thesis line is the only flourish: "Nothing you see is happening now."
- No invented numbers. A missing value is "—".
