// Scene flags and constants shared by the two map engines. The 3D map (raw
// WebGL, see gl/GlMapEngine.ts) is the default; the flat Canvas 2D map is the
// fallback when WebGL is missing, and the reader's choice with ?map3d=0.
// Everything here is camera and light: no body moves faster than Horizons
// says, and none sits anywhere other than where Horizons puts it.

export interface SceneFlags {
  /** The WebGL map. */
  gl: boolean;
  /** The earlier tilted Canvas 2D study, on request only. */
  tilt: boolean;
}

export function readSceneFlags(): SceneFlags {
  // The 3D map is the default. `?map3d=0` opts out and is remembered;
  // `?map3d=1` opts back in. `?map3d=tilt` shows the earlier tilted-canvas
  // study for one load, never remembered.
  let gl = true;
  let tilt = false;
  try {
    const q = new URLSearchParams(location.search).get('map3d');
    if (q === '0') localStorage.setItem('sublight.map3d', '0');
    else if (q === '1') localStorage.removeItem('sublight.map3d');
    if (q === 'tilt') { gl = false; tilt = true; }
    else gl = localStorage.getItem('sublight.map3d') !== '0';
  } catch {
    /* storage blocked: the default stands */
  }
  return { gl, tilt };
}

/** Orrery tilt: the ecliptic plane leans away from the viewer by this much. */
export const TILT_DEG = 55;
/** Idle camera yaw, degrees per second. One full turn in forty minutes. */
export const IDLE_YAW_DEG_PER_S = 0.15;
/** Seconds without input before the idle yaw resumes. */
export const IDLE_AFTER_S = 4;

/**
 * Inbound signals: on screen, one second stands for this many light-minutes.
 * A pulse from Mars takes about three seconds to reach Earth; one from
 * Voyager 1, nearly five minutes. The far ones crawl, which is the point.
 */
export const LIGHT_MIN_PER_S = 5;
/** Seconds between two pulses leaving the same craft. */
export const PULSE_PERIOD_S = 12;

export interface Projected {
  px: number;
  py: number;
  /** Grows toward the viewer; sort ascending to paint far things first. */
  depth: number;
}

/**
 * World (x, y, z) → the tilted view plane. Yaw turns the whole scene about the
 * Sun, tilt leans the plane back. Writes into `out` so the hot path allocates
 * nothing.
 */
export function tiltProject(
  x: number,
  y: number,
  z: number,
  yawRad: number,
  tiltRad: number,
  out: Projected,
): Projected {
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const rx = x * cy - y * sy;
  const ry = x * sy + y * cy;
  const ct = Math.cos(tiltRad);
  const st = Math.sin(tiltRad);
  out.px = rx;
  out.py = ry * ct - z * st;
  out.depth = ry * st + z * ct;
  return out;
}

/** What render needs each frame when the scene is on. */
export interface SceneState {
  tiltRad: number;
  yawRad: number;
}

/** Stable per-craft phase in [0,1), so pulses don't all leave in lockstep. */
export function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
