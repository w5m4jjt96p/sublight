// Canvas cannot easily read CSS custom properties per-pixel, so the token
// values are mirrored here. Keep in lockstep with /src/styles/tokens.css.
export const PAL = {
  txt: '#DCE2EC',
  dim: '#6E7889',
  dim2: '#454D5C',
  signal: '#8FD6E6',
  delay: '#E5B571',
  dead: '#3B4250',
  rule2: '#232B37',
  star: '#AEB9CC',
  planet: '#5A6678',
  planetLabel: '#4A5464',
  faint: '#2E3644',
} as const;

/** The one place craft colour is decided. Amber is imagery-only. */
export function craftColor(status: string, hasImagery: boolean): string {
  if (status === 'silent' || status === 'retired') return PAL.dead;
  if (hasImagery) return PAL.delay;
  if (status === 'cruise') return PAL.dim;
  return PAL.signal;
}
