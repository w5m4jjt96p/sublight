// Editorial, time-invariant: notable places on Mars, plotted on the globe.
// Coordinates are published historical facts (landing sites) or standard
// feature centres, in areocentric East longitude [0,360) and planetographic
// latitude. Rovers link to their live surface traverse; their live position is
// taken from tracks.json at runtime, this landing point is the fallback.

export type MarsSiteKind = 'rover' | 'lander' | 'feature';

export interface MarsSite {
  id: string;
  name: string;
  lat: number; // deg, +N
  lon: number; // deg East, 0..360
  kind: MarsSiteKind;
  year?: number;
  /** Registry / tracks id, for rovers that have a surface traverse. */
  craftId?: string;
  note: string;
}

export const MARS_SITES: MarsSite[] = [
  // Active rovers (live position from tracks.json; these are the landing sites).
  { id: 'perseverance', name: 'Perseverance', lat: 18.44, lon: 77.45, kind: 'rover', year: 2021, craftId: 'perseverance', note: 'Jezero Crater, a dried river delta. Still driving.' },
  { id: 'curiosity', name: 'Curiosity', lat: -4.59, lon: 137.44, kind: 'rover', year: 2012, craftId: 'curiosity', note: 'Gale Crater, climbing Mount Sharp. Still driving.' },

  // Landers and past rovers.
  { id: 'viking-1', name: 'Viking 1', lat: 22.27, lon: 312.05, kind: 'lander', year: 1976, note: 'The first fully successful Mars landing, Chryse Planitia.' },
  { id: 'viking-2', name: 'Viking 2', lat: 47.64, lon: 134.29, kind: 'lander', year: 1976, note: 'Utopia Planitia.' },
  { id: 'pathfinder', name: 'Mars Pathfinder', lat: 19.13, lon: 326.79, kind: 'lander', year: 1997, note: 'Carried Sojourner, the first Mars rover, to Ares Vallis.' },
  { id: 'spirit', name: 'Spirit', lat: -14.57, lon: 175.47, kind: 'lander', year: 2004, note: 'Gusev Crater. Twin of Opportunity.' },
  { id: 'opportunity', name: 'Opportunity', lat: -1.95, lon: 354.47, kind: 'lander', year: 2004, note: 'Meridiani Planum. Drove for 14 years.' },
  { id: 'phoenix', name: 'Phoenix', lat: 68.22, lon: 234.25, kind: 'lander', year: 2008, note: 'High northern plains. Confirmed subsurface water ice.' },
  { id: 'insight', name: 'InSight', lat: 4.50, lon: 135.62, kind: 'lander', year: 2018, note: 'Elysium Planitia. Listened for marsquakes.' },
  { id: 'zhurong', name: 'Zhurong', lat: 25.1, lon: 109.9, kind: 'lander', year: 2021, note: "China's first Mars rover, Utopia Planitia." },

  // Landmarks.
  { id: 'olympus', name: 'Olympus Mons', lat: 18.65, lon: 226.2, kind: 'feature', note: 'The tallest volcano in the solar system, about 22 km high.' },
  { id: 'valles', name: 'Valles Marineris', lat: -13.9, lon: 301.4, kind: 'feature', note: 'A canyon system over 4000 km long.' },
  { id: 'hellas', name: 'Hellas Planitia', lat: -42.4, lon: 70.5, kind: 'feature', note: 'One of the largest impact basins in the solar system.' },
];
