# Menu icons

Drop your SVGs here, one file per icon, and I convert them for both platforms.
Nothing in this folder is shipped as-is: the web inlines them into
`src/ui/Icons.tsx`, iOS gets symbol sets in `ios/Sublight/Assets.xcassets`.

## The eight files

| file | where it appears |
|---|---|
| `gallery.svg` | bottom nav, web and iOS |
| `mars.svg` | bottom nav, web and iOS |
| `sun.svg` | the centre button of the nav, which returns to the map |
| `deepsky.svg` | bottom nav, web and iOS |
| `settings.svg` | bottom nav, iOS only (the web has no settings screen) |
| `search.svg` | masthead on the web, top bar on iOS |
| `clock.svg` | the UTC readout, web only |
| `tracking.svg` | the craft counter, web only |

Five of them carry the whole nav, so those are the ones to draw first:
gallery, mars, sun, deepsky, settings.

Two notes on what is *not* in this list. Near-Earth is gone: the tab was
removed on 8 September, so no icon is needed. And the iOS nav is icons only
now, with no labels underneath, so those five shapes have to identify their
destination on their own.

## What the file must contain

- `viewBox="0 0 24 24"`, no `width`/`height` attributes
- Monoline strokes, `stroke-width="1.5"`, `stroke-linecap="round"`,
  `stroke-linejoin="round"`. This matches the rules and the type; heavier or
  filled icons read as a different product.
- `stroke="currentColor"` and `fill="none"`. The colour is set by the app so the
  icon can be dim, active cyan or amber without a second file. If your editor
  writes literal colours I strip them, but currentColor saves a round trip.
- No `<style>` blocks, no `class` attributes, no `id`s. Ids collide once several
  icons are inlined on one page.
- Strokes, not outlined shapes. Illustrator's "outline stroke" turns a 1.5pt
  line into a filled shape that cannot be re-coloured or re-weighted.

## Optical size

Draw for 24px but keep the shape inside a ~20px optical square, so it does not
crowd its neighbours. Sizes at render: 23pt in the iOS nav, 25px on the web nav,
19px in the masthead.

## iOS caveat

SwiftUI does not render SVG. I convert each one to a **symbol set** in the asset
catalogue, which is what lets the icon inherit the text colour and weight the
way SF Symbols do. That conversion is lossless for monoline strokes and lossy
for anything with gradients, masks or clipping paths, so avoid those.

If you would rather draw directly in Apple's template, export from the SF
Symbols app and drop the `.svg` here anyway; I detect the template and use it
untouched.
