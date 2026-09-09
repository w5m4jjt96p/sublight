// Static geometry for the 3D map, built once. World units are the map's
// log-compressed ones (see projection.ts), so nothing here knows about AU.

/** A unit sphere as an indexed triangle mesh, positions doubling as normals. */
export function sphere(lat = 14, lon = 22): { pos: Float32Array; idx: Uint16Array } {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= lat; i++) {
    const t = (i / lat) * Math.PI;
    const st = Math.sin(t), ct = Math.cos(t);
    for (let j = 0; j <= lon; j++) {
      const p = (j / lon) * Math.PI * 2;
      pos.push(st * Math.cos(p), ct, st * Math.sin(p));
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j;
      const b = a + lon + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
}

/**
 * A ring of radius R in the ecliptic (XZ) plane, as LINES pairs. `gap` skips
 * every other segment, which is how a dashed heliopause is drawn without a
 * dash pattern: WebGL lines have none.
 */
export function ring(R: number, segments = 128, dashed = false): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    if (dashed && i % 2) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    out.push(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R);
  }
  return new Float32Array(out);
}

/**
 * Stars on a far sphere. Position, size and alpha interleaved per point.
 * Deterministic, so the sky does not reshuffle on every mount.
 */
export function stars(count = 2200, radius = 12000): Float32Array {
  let seed = 1337;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = new Float32Array(count * 5);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const bright = rnd() < 0.1;
    out[i * 5] = s * Math.cos(t) * radius;
    out[i * 5 + 1] = u * radius;
    out[i * 5 + 2] = s * Math.sin(t) * radius;
    out[i * 5 + 3] = bright ? 2.2 + rnd() * 1.4 : 1.1 + rnd() * 0.9;
    out[i * 5 + 4] = bright ? 0.7 + rnd() * 0.3 : 0.28 + rnd() * 0.45;
  }
  return out;
}

/** Kuiper-belt speckle, matching the flat map's spiral scatter. */
export function speckle(rOf: (au: number) => number): Float32Array {
  const out = new Float32Array(220 * 5);
  for (let i = 0; i < 220; i++) {
    const a = i * 137.508 * (Math.PI / 180);
    const R = rOf(32 + (i % 17) * 1.6);
    out[i * 5] = Math.cos(a) * R;
    out[i * 5 + 1] = 0;
    out[i * 5 + 2] = Math.sin(a) * R;
    out[i * 5 + 3] = 1.6;
    out[i * 5 + 4] = 0.5;
  }
  return out;
}
