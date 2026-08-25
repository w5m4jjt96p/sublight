// ---------------------------------------------------------------------------
// Sublight — shared types.
// The registry is editorial and time-invariant. The generated files carry
// everything that changes over time. Keep that separation strict.
// ---------------------------------------------------------------------------

export type CraftStatus =
  | 'active' // routinely returning science / telemetry
  | 'cruise' // in transit to its target
  | 'dormant' // powered but quiet by design
  | 'silent' // lost contact, still tracked geometrically
  | 'retired'; // mission ended

export type CraftKind = 'rover' | 'orbiter' | 'flyby' | 'observatory' | 'lander';

/** A body Horizons can be queried for by centre code (planet, moon...). */
export type HostBody =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

export interface ImagerySource {
  /** Raw-image feed category, e.g. "mars2020" | "msl". */
  source: string;
}

/** One hand-authored registry entry. No value here changes over time. */
export interface RegistryEntry {
  id: string;
  name: string;
  /** JPL NAIF ID (negative for spacecraft). null when Horizons has none. */
  naifId: number | null;
  agency: string;
  launched: string; // ISO date
  arrived: string | null; // ISO date, or null if still cruising / n.a.
  status: CraftStatus;
  kind: CraftKind;
  /** Body the craft sits on/around; drives host-fallback in the fetcher. */
  host: HostBody | null;
  location: string;
  imagery: ImagerySource | null;
  /** Curated NASA Image Library still, shown when there is no live raw feed. */
  archiveImage?: ArchiveRef | null;
  note: string;
}

/** Hand-picked archive still: a NASA Image & Video Library id + its attribution. */
export interface ArchiveRef {
  nasaId: string;
  title: string;
  credit: string;
}

export type Registry = RegistryEntry[];

// --------------------------- generated: fleet.json --------------------------

/** One craft's time-varying geometry, produced by fetch-ephemerides.ts. */
export interface CraftEphemeris {
  id: string;
  /** Heliocentric radius, AU. Drives radial position on the map. */
  heliocentricAu: number;
  /** Ecliptic longitude, degrees [0,360). Drives angular position. */
  eclipticLonDeg: number;
  /** Heliocentric radius at J+1, AU — for smooth real-time orbital motion. */
  heliocentricAuNextDay: number;
  /** Ecliptic longitude at J+1, degrees — for smooth real-time orbital motion. */
  eclipticLonDegNextDay: number;
  /** Geocentric range today, AU. Drives one-way light time. */
  rangeAu: number;
  /** Geocentric range at J+1, AU. For smooth client-side interpolation. */
  rangeAuNextDay: number;
  /** One-way light time today, seconds. */
  owltSeconds: number;
  /** Traceability: which body actually answered, e.g. "horizons:499". */
  source: string;
  /** True when this entry reused the last good build (Horizons failed). */
  stale?: boolean;
}

export interface FleetData {
  generatedAt: string; // ISO
  craft: CraftEphemeris[];
}

// --------------------------- generated: planets.json ------------------------

/** A solar-system body plotted as a ring + icon (the 8 planets + the Moon). */
export interface PlanetEphemeris {
  id: string;
  name: string;
  heliocentricAu: number;
  eclipticLonDeg: number;
  heliocentricAuNextDay: number;
  eclipticLonDegNextDay: number;
}

export interface PlanetsData {
  generatedAt: string;
  planets: PlanetEphemeris[];
}

// --------------------------- generated: frames.json -------------------------

export interface FrameThumb {
  /** Small local thumbnail (~720px) for the map chip / HUD / strip. */
  file: string;
  /** Large local image (~1600px) for the full-screen viewer + HQ download. */
  full: string;
  /** Original full-resolution image at the source (NASA), for "view original". */
  sourceUrl: string;
  instrument: string;
  capturedUtc: string;
  sol: number | null;
}

export interface FrameData {
  sol: number | null;
  instrument: string;
  /** Real capture time, UTC ISO. The heart of the product. */
  capturedUtc: string;
  /** Small local thumbnail (~720px). */
  file: string;
  /** Large local image (~1600px) for the viewer + HQ download. */
  full: string;
  /** Original full-resolution image at the source. */
  sourceUrl: string;
  credit: string;
  /** Up to 6 recent frames for the detail panel strip (newest first). */
  recent?: FrameThumb[];
}

/** Keyed by craft id. */
export type FramesData = Record<string, FrameData>;

// --------------------------- generated: archive.json ------------------------
// Curated NASA Image & Video Library stills for craft that have no live feed.

export interface ArchiveEntry {
  /** Small local thumbnail (~720px). */
  file: string;
  /** Large local image (~1600px) for the viewer + HQ download. */
  full: string;
  /** Original image at the NASA library, for "view original". */
  sourceUrl: string;
  title: string;
  credit: string;
}

/** Keyed by craft id. */
export type ArchiveData = Record<string, ArchiveEntry>;

// --------------------------- generated: dsn.json ----------------------------
// Optional CI snapshot; the client also polls the live DSN when CORS allows.

export interface DsnContact {
  inContact: boolean;
  direction: 'up' | 'down' | 'both' | null;
  antenna: string | null;
}

export interface DsnSnapshot {
  generatedAt: string;
  /** Keyed by craft id. */
  byCraft: Record<string, DsnContact>;
}

// --- Mars rover surface traverses (public/data/tracks.json) ---------------
export interface TrackWaypoint {
  lon: number;
  lat: number;
  sol: number | null;
}
export interface RoverTrack {
  id: string;
  label: string;
  basemap: string;
  image: string;
  w: number;
  h: number;
  /** Image edges in normalised Web-Mercator slippy coords (0..1). */
  frame: { wxWest: number; wxEast: number; wyNorth: number; wySouth: number };
  metersPerPixel: number;
  distanceKm: number | null;
  solFirst: number | null;
  solLast: number | null;
  current: { lon: number; lat: number; sol: number | null; site: number | null; drive: number | null };
  waypoints: TrackWaypoint[];
}
export interface TracksData {
  generatedAt: string;
  rovers: Record<string, RoverTrack>;
}
