import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propagate, bandOf, semiMajorAxis, R_EARTH } from './orbits.ts';
import type { SatelliteRecord } from '../types.ts';

// Real ISS mean elements (CelesTrak GP, 2026-08-26T16:37 epoch).
const ISS: SatelliteRecord = {
  norad: 25544,
  name: 'ISS',
  group: 'stations',
  band: 'LEO',
  epochMs: Date.parse('2026-08-26T16:37:01.243Z'),
  meanMotion: 15.49643784,
  eccentricity: 0.00077171,
  inclination: 51.6325,
  raan: 311.1239,
  argPerigee: 86.5581,
  meanAnomaly: 273.629,
  meanMotionDot: 8.818e-5,
};

test('ISS altitude, speed and period are physically correct', () => {
  const s = propagate(ISS, ISS.epochMs); // at epoch
  assert.ok(s.altitude > 400 && s.altitude < 440, `altitude ${s.altitude} km out of ISS range`);
  assert.ok(s.speed > 7.6 && s.speed < 7.72, `speed ${s.speed} km/s out of ISS range`);
  assert.ok(s.periodMin > 92 && s.periodMin < 93.5, `period ${s.periodMin} min out of ISS range`);
  // Light-time to the ground below: ~1.4 ms.
  assert.ok(s.lightSeconds > 0.0012 && s.lightSeconds < 0.0016, `lightSeconds ${s.lightSeconds}`);
});

test('propagation actually moves the satellite over time', () => {
  const a = propagate(ISS, ISS.epochMs);
  const b = propagate(ISS, ISS.epochMs + 60_000); // +1 min
  const moved = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  assert.ok(moved > 300, `expected >300 km travelled in 60 s, got ${moved}`);
});

test('the geocentric distance stays near-constant for a near-circular orbit', () => {
  const rs = [0, 20, 40, 60, 80].map((min) => propagate(ISS, ISS.epochMs + min * 60_000).r);
  const spread = Math.max(...rs) - Math.min(...rs);
  assert.ok(spread < 20, `near-circular r should barely vary, spread ${spread} km`);
});

test('band classification by mean motion', () => {
  assert.equal(bandOf(15.5, 0.0007), 'LEO');
  assert.equal(bandOf(2.0056, 0.0002), 'MEO'); // GPS ~20200 km
  assert.equal(bandOf(1.0027, 0.0002), 'GEO'); // geostationary ~35786 km
});

test('GEO semi-major axis ~42164 km', () => {
  const a = semiMajorAxis(1.0027);
  assert.ok(Math.abs(a - R_EARTH - 35786) < 200, `GEO altitude ${a - R_EARTH}`);
});
