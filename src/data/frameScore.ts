// What a raw frame is worth showing. The feeds carry no "featured" flag, and
// the raw stream is mostly engineering: of a rover's sol, a good share is night
// noise, flat sky, narrowband repeats of one scene and tiny sun-finding crops.
// Opening a post on one of those is the worst first impression the product can
// make, so every frame is scored from its metadata alone. That keeps it
// deterministic: the frame a post opens on is known before any pixel loads, and
// it never swaps under the reader.
//
// Calibrated by reading the pixels of 1,271 frames across eight sols: every
// frame the night and sky rules reject turned out to be noise, flat sky or the
// Sun. Ported to ios/Sublight/RoverImages.swift; keep the two in step.

export interface FrameFacts {
  instrument: string;
  /** Any URL or file name of the frame; the name encodes the colour filter. */
  name: string;
  /** Local Mars time as the feeds write it: "Sol-02024M12:55:51.155". */
  lmst?: string | null;
  /** Camera elevation in degrees; the feeds send it as a string. */
  mastEl?: string | number | null;
  /** "(1648,1200)" (Perseverance) or "(1,321,1024,384)" (Curiosity). */
  rect?: string | null;
}

/** Below zero: hidden outright. */
export const SCORE_HIDDEN = 0;
/** Below this: repeats, hidden as soon as the post has better frames to show. */
export const SCORE_GOOD = 20;

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : NaN;
};

function localHour(lmst?: string | null): number | null {
  const m = /M(\d\d):(\d\d)/.exec(lmst ?? '');
  return m ? +m[1]! + +m[2]! / 60 : null;
}

function size(rect?: string | null): [number, number] | null {
  const parts = (rect ?? '').match(/\d+/g)?.map(Number);
  if (!parts || parts.length < 2) return null;
  return [parts[parts.length - 2]!, parts[parts.length - 1]!];
}

export function frameScore(f: FrameFacts): number {
  const inst = f.instrument.toUpperCase();
  const file = f.name.split('/').pop() ?? '';
  const mastCam = /MCZ|MAST|ZCAM/.test(inst);
  const scene = mastCam || /NAV|RMI|SUPERCAM|CHEMCAM/.test(inst);
  const armCam = /WATSON|MAHLI/.test(inst); // carry their own lights

  const hour = localHour(f.lmst);
  if (!armCam && hour != null && (hour < 6.5 || hour > 18)) return -1; // night noise
  if (scene && num(f.mastEl) > 15) return -1;                          // sky, Sun
  const dims = size(f.rect);
  if (dims && Math.min(dims[0], dims[1]) < 200) return -1;             // sun-finding crops

  // Filter 0 is Mastcam-Z's colour; 1 to 7 are grey narrowband repeats of the
  // same scene. E01 is Curiosity's colour product. Confirmed on the pixels:
  // these frames measure 20 to 49 of saturation, the others 0.
  const colour = /^Z[LR]0_/.test(file) || /E01_DXXX/.test(file);
  const zoomCam = /RMI|SUPERCAM|CHEMCAM/.test(inst);

  let score: number;
  // A mast frame that is not colour is a filter repeat or a flat grey product.
  if (mastCam) score = colour ? 100 : 10;
  else if (/NAV/.test(inst)) score = 55;
  else if (armCam) score = 50;
  else if (zoomCam) score = 38; // a round vignette: detail, not a view
  else if (/HAZ/.test(inst)) score = 30;
  else score = 15;

  if (dims) {
    const [w, h] = dims;
    if (Math.max(w, h) / Math.max(1, Math.min(w, h)) > 2) score -= 15; // strips
    if (Math.min(w, h) < 300) score -= 10;
  }
  return Math.max(SCORE_HIDDEN, score);
}

/** The frames a post actually shows, in the order given. */
export function visibleFrames<T extends { score?: number }>(frames: T[]): T[] {
  const kept = frames.filter((f) => (f.score ?? SCORE_GOOD) >= SCORE_HIDDEN);
  const good = kept.filter((f) => (f.score ?? SCORE_GOOD) >= SCORE_GOOD);
  return good.length >= 3 ? good : kept;
}

/** Plain name for a camera; the raw ids mean nothing to a reader. */
export function cameraName(instrument: string): string {
  const i = instrument.toUpperCase();
  if (/MCZ|ZCAM/.test(i)) return 'Mastcam-Z';
  if (/MAST/.test(i)) return 'Mastcam';
  if (/NAV/.test(i)) return 'Navcam';
  if (/FHAZ|FRONT_HAZ/.test(i)) return 'Front Hazcam';
  if (/RHAZ|REAR_HAZ/.test(i)) return 'Rear Hazcam';
  if (/SUPERCAM/.test(i)) return 'SuperCam';
  if (/CHEMCAM/.test(i)) return 'ChemCam';
  if (/WATSON/.test(i)) return 'WATSON';
  if (/MAHLI/.test(i)) return 'MAHLI';
  if (/MARDI/.test(i)) return 'MARDI';
  if (/SKYCAM/.test(i)) return 'SkyCam';
  return instrument.replace(/_/g, ' ');
}
