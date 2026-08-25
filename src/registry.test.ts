// Validates data/registry.json against the RegistryEntry contract at build time.
// Run: npm test  (tsx --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry } from './data/registry.ts';
import type { CraftStatus, CraftKind, HostBody } from './types.ts';

const STATUSES: CraftStatus[] = ['active', 'cruise', 'dormant', 'silent', 'retired'];
const KINDS: CraftKind[] = ['rover', 'orbiter', 'flyby', 'observatory', 'lander'];
const HOSTS: HostBody[] = [
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

test('registry is a non-empty array', () => {
  assert.ok(Array.isArray(registry));
  assert.ok(registry.length >= 16, `expected ≥16 craft, got ${registry.length}`);
});

test('craft ids are unique', () => {
  const ids = registry.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate craft id');
});

test('every entry matches the schema', () => {
  for (const c of registry) {
    const where = c.id || '(missing id)';
    assert.equal(typeof c.id, 'string', `${where}: id`);
    assert.equal(typeof c.name, 'string', `${where}: name`);
    assert.ok(c.naifId === null || (typeof c.naifId === 'number' && c.naifId < 0), `${where}: naifId must be negative or null`);
    assert.equal(typeof c.agency, 'string', `${where}: agency`);
    assert.ok(isIsoDate(c.launched), `${where}: launched not ISO date`);
    assert.ok(c.arrived === null || isIsoDate(c.arrived), `${where}: arrived`);
    assert.ok(STATUSES.includes(c.status), `${where}: bad status ${c.status}`);
    assert.ok(KINDS.includes(c.kind), `${where}: bad kind ${c.kind}`);
    assert.ok(c.host === null || HOSTS.includes(c.host), `${where}: bad host ${c.host}`);
    assert.equal(typeof c.location, 'string', `${where}: location`);
    assert.ok(c.imagery === null || typeof c.imagery.source === 'string', `${where}: imagery`);
    assert.equal(typeof c.note, 'string', `${where}: note`);
    assert.ok(c.note.length > 0, `${where}: note empty`);
  }
});

test('craft with null naifId declare a host to fall back to', () => {
  for (const c of registry) {
    if (c.naifId === null) {
      assert.ok(c.host !== null, `${c.id}: null naifId requires a host body`);
    }
  }
});
