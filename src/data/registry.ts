// The editorial registry, imported at build time. Time-invariant by contract.
import registryJson from '../../data/registry.json';
import type { Registry } from '../types.ts';

export const registry = registryJson as Registry;
