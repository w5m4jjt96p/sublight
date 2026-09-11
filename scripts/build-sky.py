#!/usr/bin/env python3
"""
Bake the 3D map's sky from NASA's Deep Star Maps 2020.

Source: https://svs.gsfc.nasa.gov/4851 — starmap_2020_4k.exr (4096x2048, linear
HDR, plate carrée in ICRF/J2000 right ascension and declination, RA 0h at the
centre and increasing to the left, north up). Stars from Gaia DR2 and
Hipparcos, composited over the diffuse Milky Way.
Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio.
Gaia DR2: ESA/Gaia/DPAC. Public domain (NASA).

The EXR is 35 MB; the site ships an sRGB JPEG at two sizes. The tone curve is
deliberate: the unresolved-star floor sits near the site's void colour, the
Milky Way reads at mid grey, only real stars reach white. The shader applies
one more gain on top, so this is the ceiling, not the final look.

Run (one-off, not part of the daily refresh):
  python3 -m venv .venv-sky && .venv-sky/bin/pip install OpenEXR numpy pillow
  .venv-sky/bin/python scripts/build-sky.py path/to/starmap_2020_4k.exr
"""
import sys
from pathlib import Path

import numpy as np
import OpenEXR
from PIL import Image

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "public" / "sky"
out.mkdir(parents=True, exist_ok=True)

with OpenEXR.File(str(src)) as f:
    ch = f.channels()
    lin = ch["RGB"].pixels.astype(np.float32) if "RGB" in ch else np.stack([ch[c].pixels for c in "RGB"], -1).astype(np.float32)

# Linear → sRGB, then a black point so the sky floor is nearly the void.
BLACK = 0.09
srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, 1), 1 / 2.4) - 0.055)
lvl = np.clip((srgb - BLACK) / (1 - BLACK), 0, 1)
img8 = (lvl * 255 + 0.5).astype(np.uint8)
im = Image.fromarray(img8, "RGB")

for name, w in (("starmap-4k.jpg", 4096), ("starmap-2k.jpg", 2048)):
    r = im if w == im.width else im.resize((w, w // 2), Image.LANCZOS)
    r.save(out / name, "JPEG", quality=86, optimize=True, progressive=True)
    print(name, r.size, (out / name).stat().st_size // 1024, "KB")
