#!/usr/bin/env bash
# Refresh the native iOS app's bundled resources from the generated web data,
# then regenerate the Xcode project. Run after the data pipeline updates
# public/data/*.json. Does NOT sign or upload — that's done in Xcode.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ copying generated data + imagery into ios/Resources"
mkdir -p ios/Resources/data ios/Resources/frames ios/Resources/bodies ios/Resources/tracks
cp public/data/fleet.json public/data/planets.json public/data/frames.json \
   public/data/archive.json public/data/bodyphotos.json public/data/tracks.json \
   public/data/satellites.json public/data/spaceweather.json \
   data/registry.json ios/Resources/data/
cp public/frames/*.jpg ios/Resources/frames/
cp public/bodies/*.jpg ios/Resources/bodies/
cp public/sun.jpg ios/Resources/bodies/sun.jpg
cp public/tracks/*.jpg ios/Resources/tracks/

echo "→ emitting editorial bodies.json"
npx tsx -e "import {BODIES} from './src/data/bodies.ts'; import {writeFileSync} from 'node:fs'; writeFileSync('ios/Resources/data/bodies.json', JSON.stringify(BODIES,null,2)+'\n');"

echo "→ rasterising wordmark"
node -e "import('sharp').then(async ({default:sharp})=>{const {readFileSync}=await import('node:fs');await sharp(readFileSync('public/sublight.svg'),{density:600}).resize({height:144}).png().toFile('ios/Resources/bodies/sublight-wordmark.png');})"

echo "→ regenerating Xcode project"
cd ios && xcodegen generate

echo "✓ ios resources synced. Open ios/Sublight.xcodeproj in Xcode to run / archive."
