// Same-origin one-click download. Our /frames files are served by the app, so
// the `download` attribute works (cross-origin NASA URLs would be ignored by the
// browser — those are offered as "open original" links instead).
export function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** A tidy, descriptive filename for a downloaded frame. */
export function frameFilename(
  craftName: string,
  instrument: string,
  sol: number | null,
  capturedUtc: string,
): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const date = capturedUtc.slice(0, 10);
  const solPart = sol != null ? `sol${sol}_` : '';
  return `${slug(craftName)}_${slug(instrument)}_${solPart}${date}.jpg`;
}
