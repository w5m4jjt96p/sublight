// The tilted, three-dimensional reading of the map, behind a flag while it is
// a prototype. Everything in here is camera and light: no body moves faster
// than Horizons says, and none sits anywhere other than where Horizons puts
// it. The plane leans back, the view turns slowly on its own, and fronts of
// light leave the Sun at a stated scale. That is the whole trick.
//
// Enable with ?map3d=1 (sticks in localStorage), disable with ?map3d=0.

export interface SceneFlags {
  tilt: boolean;
}

export function readSceneFlags(): SceneFlags {
  let on = false;
  try {
    const q = new URLSearchParams(location.search).get('map3d');
    if (q === '1') {
      localStorage.setItem('sublight.map3d', '1');
      on = true;
    } else if (q === '0') {
      localStorage.removeItem('sublight.map3d');
    } else {
      on = localStorage.getItem('sublight.map3d') === '1';
    }
  } catch {
    /* storage blocked: the flag simply stays off */
  }
  return { tilt: on };
}

/** Orrery tilt: the ecliptic plane leans away from the viewer by this much. */
export const TILT_DEG = 55;
/** Idle camera yaw, degrees per second. One full turn in forty minutes. */
export const IDLE_YAW_DEG_PER_S = 0.15;
/** Seconds without input before the idle yaw resumes. */
export const IDLE_AFTER_S = 4;

/** Light fronts: on screen, one second stands for this many light-minutes. */
export const LIGHT_MIN_PER_S = 5;
/** Seconds between two fronts leaving the Sun. */
export const FRONT_PERIOD_S = 12;
/** Fronts in flight at once. */
export const FRONT_MAX = 3;
/** Light-time from the Sun to 1 AU, seconds (IAU 2012 au, c). */
export const SECONDS_PER_AU = 499.004784;
/** How far a front has travelled, in AU, per second on screen. */
export const AU_PER_S = (LIGHT_MIN_PER_S * 60) / SECONDS_PER_AU;

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
  /** `performance.now()` at which each front left the Sun, oldest first. */
  fronts: number[];
}
