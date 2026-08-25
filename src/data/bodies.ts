// Editorial info for the Sun, planets and the Moon — the bodies you can click
// on the map. Facts are hand-authored and time-invariant. Photos come from
// NASA: the Sun live from SDO, Earth live from DSCOVR/EPIC, the rest from a
// hand-picked NASA Image & Video Library still (downloaded by fetch-bodies).
export interface BodyFact {
  label: string;
  value: string;
}

export type BodyPhoto =
  | { kind: 'sun' }
  | { kind: 'epic' }
  | { kind: 'nasa'; id: string; title: string; credit: string };

export interface BodyInfo {
  name: string;
  kind: string;
  blurb: string;
  facts: BodyFact[];
  photo: BodyPhoto;
}

export const BODIES: Record<string, BodyInfo> = {
  sun: {
    name: 'The Sun',
    kind: 'Star · G2V',
    blurb:
      'The star at the centre of it all. Its light, the yardstick of this whole map, takes about eight minutes to reach Earth.',
    facts: [
      { label: 'Diameter', value: '1,392,700 km' },
      { label: 'Mass', value: '333,000 Earths' },
      { label: 'Surface', value: '≈ 5,500 °C' },
      { label: 'Light to Earth', value: '8 min 20 s' },
    ],
    photo: { kind: 'sun' },
  },
  mercury: {
    name: 'Mercury',
    kind: 'Planet · terrestrial',
    blurb: 'The smallest planet and the closest to the Sun, a scorched, cratered world with almost no atmosphere.',
    facts: [
      { label: 'Distance from Sun', value: '0.39 AU' },
      { label: 'Diameter', value: '4,879 km' },
      { label: 'Year', value: '88 days' },
      { label: 'Moons', value: '0' },
    ],
    photo: { kind: 'nasa', id: 'PIA12051', title: 'A global view of Mercury', credit: 'NASA/JHU APL/Carnegie' },
  },
  venus: {
    name: 'Venus',
    kind: 'Planet · terrestrial',
    blurb: 'Earth’s twin in size, wrapped in a runaway greenhouse: a crushing CO₂ atmosphere and a surface hot enough to melt lead.',
    facts: [
      { label: 'Distance from Sun', value: '0.72 AU' },
      { label: 'Diameter', value: '12,104 km' },
      { label: 'Year', value: '225 days' },
      { label: 'Surface', value: '≈ 465 °C' },
    ],
    photo: { kind: 'nasa', id: 'PIA00257', title: 'Venus, global radar view (Magellan)', credit: 'NASA/JPL' },
  },
  earth: {
    name: 'Earth',
    kind: 'Planet · home',
    blurb: 'The only place we know of that everything on this map came from, and the point all the light-times are measured to.',
    facts: [
      { label: 'Distance from Sun', value: '1.00 AU' },
      { label: 'Diameter', value: '12,742 km' },
      { label: 'Year', value: '365.25 days' },
      { label: 'Moons', value: '1' },
    ],
    photo: { kind: 'epic' },
  },
  moon: {
    name: 'The Moon',
    kind: 'Natural satellite',
    blurb: 'Earth’s companion, about 1.3 light-seconds away, the farthest humans have ever travelled.',
    facts: [
      { label: 'Distance from Earth', value: '384,400 km' },
      { label: 'Diameter', value: '3,474 km' },
      { label: 'Orbit', value: '27.3 days' },
      { label: 'Light from Earth', value: '≈ 1.3 s' },
    ],
    photo: { kind: 'nasa', id: 'GSFC_20171208_Archive_e001861', title: 'The full Moon', credit: 'NASA/GSFC' },
  },
  mars: {
    name: 'Mars',
    kind: 'Planet · terrestrial',
    blurb: 'The rusty desert world where most of this fleet’s live cameras are. Perseverance and Curiosity roll across it right now.',
    facts: [
      { label: 'Distance from Sun', value: '1.52 AU' },
      { label: 'Diameter', value: '6,779 km' },
      { label: 'Year', value: '687 days' },
      { label: 'Moons', value: '2' },
    ],
    photo: { kind: 'nasa', id: 'PIA00407', title: 'Global colour views of Mars', credit: 'NASA/JPL' },
  },
  jupiter: {
    name: 'Jupiter',
    kind: 'Planet · gas giant',
    blurb: 'The largest planet, a banded ball of hydrogen and helium with a centuries-old storm wider than Earth.',
    facts: [
      { label: 'Distance from Sun', value: '5.20 AU' },
      { label: 'Diameter', value: '139,820 km' },
      { label: 'Year', value: '11.9 years' },
      { label: 'Moons', value: '95+' },
    ],
    photo: { kind: 'nasa', id: 'PIA01594', title: 'Jupiter, imaged by Hubble', credit: 'NASA/ESA/Hubble' },
  },
  saturn: {
    name: 'Saturn',
    kind: 'Planet · gas giant',
    blurb: 'The ringed jewel of the solar system, its bright rings made of countless chunks of ice.',
    facts: [
      { label: 'Distance from Sun', value: '9.58 AU' },
      { label: 'Diameter', value: '116,460 km' },
      { label: 'Year', value: '29.4 years' },
      { label: 'Moons', value: '140+' },
    ],
    photo: { kind: 'nasa', id: 'PIA21047', title: 'Saturn, imaged by Cassini', credit: 'NASA/JPL-Caltech/SSI' },
  },
  uranus: {
    name: 'Uranus',
    kind: 'Planet · ice giant',
    blurb: 'A pale, featureless ice giant tipped on its side, visited only once, by Voyager 2 in 1986.',
    facts: [
      { label: 'Distance from Sun', value: '19.2 AU' },
      { label: 'Diameter', value: '50,724 km' },
      { label: 'Year', value: '84 years' },
      { label: 'Moons', value: '28' },
    ],
    photo: { kind: 'nasa', id: 'PIA18182', title: 'Uranus, seen by Voyager 2', credit: 'NASA/JPL' },
  },
  neptune: {
    name: 'Neptune',
    kind: 'Planet · ice giant',
    blurb: 'The farthest planet, a deep-blue ice giant with the fastest winds in the solar system. Also visited only by Voyager 2.',
    facts: [
      { label: 'Distance from Sun', value: '30.1 AU' },
      { label: 'Diameter', value: '49,244 km' },
      { label: 'Year', value: '165 years' },
      { label: 'Moons', value: '16' },
    ],
    photo: { kind: 'nasa', id: 'PIA01492', title: 'Neptune, imaged by Voyager 2', credit: 'NASA/JPL' },
  },
};
