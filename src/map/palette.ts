// Canvas cannot easily read CSS custom properties per-pixel, so the token
// values are mirrored here. Keep in lockstep with /src/styles/tokens.css.
export const PAL = {
  txt: '#F5F5F7',
  dim: '#9D9DA5',
  dim2: '#67676F',
  signal: '#74D4F0',
  delay: '#F2B766',
  dead: '#3C3C43',
  rule2: '#2A2A30',
  star: '#C9CDD6',
  planet: '#6A6A74',
  planetLabel: '#5C5C66',
  faint: '#2C2C33',
} as const;

/** The one place craft colour is decided. Amber is imagery-only. */
export function craftColor(status: string, hasImagery: boolean): string {
  if (status === 'silent' || status === 'retired') return PAL.dead;
  if (hasImagery) return PAL.delay;
  if (status === 'cruise') return PAL.dim;
  return PAL.signal;
}
