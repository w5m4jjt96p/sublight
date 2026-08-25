// Prompt-3 probe: show what Horizons actually returns for one craft, and prove
// the parser agrees, before trusting it across the whole fleet.
//   npm run data:probe            (defaults to Voyager 1)
//   npm run data:probe -- -96     (any NAIF id / body code)
import { fetchHorizonsRaw, parseStateVectors, toEcliptic, magnitude } from './horizons.ts';

const command = process.argv[2] ?? '-31'; // Voyager 1

const helio = await fetchHorizonsRaw(command, '500@10');
const geo = await fetchHorizonsRaw(command, '500@399');

console.log('='.repeat(70));
console.log(`Horizons raw result for COMMAND='${command}', CENTER='500@10'`);
console.log('='.repeat(70));
const soe = helio.raw.indexOf('$$SOE');
console.log(helio.raw.slice(Math.max(0, soe - 400), helio.raw.indexOf('$$EOE') + 6));

try {
  const [h] = parseStateVectors(helio.raw);
  const [g] = parseStateVectors(geo.raw);
  const ecl = toEcliptic(h);
  const rangeAu = magnitude(g);
  console.log('\nParsed:');
  console.log(`  heliocentric radius : ${ecl.radiusAu.toFixed(4)} AU`);
  console.log(`  ecliptic longitude  : ${ecl.lonDeg.toFixed(2)}°`);
  console.log(`  geocentric range    : ${rangeAu.toFixed(4)} AU`);
  console.log(`  one-way light time  : ${(rangeAu * 499.004783836).toFixed(1)} s`);
} catch (err) {
  console.error('\nParse failed:', (err as Error).message);
  process.exitCode = 1;
}
