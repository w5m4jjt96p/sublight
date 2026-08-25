// Background starfield. Stored in normalised [0,1) screen space and wrapped
// across the viewport each frame, so it ALWAYS fills the screen at any zoom
// (no empty edges when zoomed out) while still drifting with a subtle parallax.
export interface Star {
  /** Normalised position in [0,1). */
  u: number;
  v: number;
  r: number;
  a: number;
  /** A few bright standout stars get a faint halo. */
  bright: boolean;
}

export function makeStars(count = 1100): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const bright = Math.random() < 0.1; // ~10% brighter stars
    stars.push({
      u: Math.random(),
      v: Math.random(),
      r: bright ? Math.random() * 1.1 + 1.3 : Math.random() * 1.0 + 0.45,
      a: bright ? Math.random() * 0.25 + 0.7 : Math.random() * 0.5 + 0.28,
      bright,
    });
  }
  return stars;
}
