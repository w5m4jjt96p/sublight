# Menu icons

Drop your SVGs here, one file per icon, and I convert them for both platforms.
Nothing in this folder is shipped as-is: the web inlines them into
`src/ui/Icons.tsx`, iOS gets symbol sets in `ios/Sublight/Assets.xcassets`.

## Filenames I expect

| file | where it appears |
|---|---|
| `gallery.svg` | bottom nav, both platforms |
| `mars.svg` | bottom nav, both platforms |
| `sun.svg` | the centre button of the nav (returns to the map) |
| `deepsky.svg` | bottom nav, both platforms |
| `settings.svg` | bottom nav, iOS only |
| `clock.svg` | masthead UTC readout, web only |
| `tracking.svg` | masthead craft counter, web only |
| `search.svg` | masthead, both platforms |

Anything extra is fine, just tell me where it goes.

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
