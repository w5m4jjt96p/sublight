# Sublight — iOS (native SwiftUI)

A genuine native SwiftUI app (no WKWebView). It reuses the exact data the web
build generates (`public/data/*.json` + imagery), rebuilding the light-time map,
detail panels, gallery and search natively.

## Architecture
- **SwiftUI + `Canvas`** for the log-radial solar-system map (`MapView.swift`),
  redrawn every frame by a `TimelineView` so the system moves in real time.
- `MapController` holds camera state shared with the HUD and search jump-to.
- `DataStore` decodes the bundled JSON snapshots into a joined model.
- `Projection.swift` mirrors the web projection math exactly
  (`rOf = 1000·log10(1+au·400)/log10(1+200·400)`).
- Design tokens + fonts in `Theme.swift`. Fonts are the same as the web
  (Stack Sans Notch for titles, Roboto Mono for numbers/labels), converted
  woff2 → TTF and registered via `UIAppFonts`.

## Data rule (unchanged)
No numeric value on screen is invented. Positions are a **daily snapshot**
interpolated in real time by fraction of the UTC day. Missing values show "—".
Amber (`--delay`) is used only for light-time values and imaging craft.

## Bundled resources (`ios/Resources/`, folder references)
- `data/` — fleet, planets, frames, archive, bodyphotos, registry, bodies (JSON)
- `frames/` — rover / EPIC / archive imagery (720 + 1600 px)
- `bodies/` — planet + Moon globes, cropped Sun, wordmark PNG
- `fonts/` — the six TTFs (flattened into the bundle root)

## Refreshing data
After the web data pipeline runs, sync the bundled snapshot and regenerate:

```bash
npm run ios:sync
```

## Fonts & licences
Roboto Mono and Stack Sans Notch are bundled under the SIL Open Font License 1.1.
Their licence texts ship alongside the TTFs (`Resources/fonts/*-OFL.txt`) as the
OFL requires. Neither font declares a Reserved Font Name, so the converted /
renamed TTFs keep their family names legally. The About screen credits them and
states the project is not affiliated with NASA.

## Build / run
```bash
cd ios
xcodegen generate            # if not already generated
open Sublight.xcodeproj
```
Then pick a simulator or device and Run.

## TestFlight
Signing and upload require your Apple Developer account and must be done by you
in Xcode: set a real `DEVELOPMENT_TEAM` (Signing & Capabilities), then
Product → Archive → Distribute App → App Store Connect. Bundle id is
`observer.sublight.app` (change it to one your team owns if needed).
