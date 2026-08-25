// Deep Space Network live feed parsing + craft mapping.
// Regex-based so the exact same code runs in the browser (live poll) and in
// Node (CI snapshot) — no DOMParser dependency.
//
// CORS note: eyes.nasa.gov serves `Access-Control-Allow-Origin: *` (verified),
// so the browser fetches this directly. No proxy, no backend.
import type { DsnContact } from '../types.ts';

export const DSN_URL = 'https://eyes.nasa.gov/dsn/data/dsn.xml';

export interface DsnSignal {
  dir: 'up' | 'down';
  active: boolean;
  spacecraft: string | null;
  spacecraftId: number | null;
}

export interface DsnDish {
  name: string;
  signals: DsnSignal[];
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1]! : null;
}

export function parseDsnXml(xml: string): DsnDish[] {
  const dishes: DsnDish[] = [];
  const dishRe = /<dish\b([^>]*)>([\s\S]*?)<\/dish>/g;
  for (const m of xml.matchAll(dishRe)) {
    const name = attr(m[1]!, 'name') ?? '?';
    const body = m[2]!;
    const signals: DsnSignal[] = [];
    const sigRe = /<(up|down)Signal\b([^>]*)\/>/g;
    for (const s of body.matchAll(sigRe)) {
      const dir = s[1] as 'up' | 'down';
      const a = s[2]!;
      const idStr = attr(a, 'spacecraftID');
      const id = idStr != null && idStr !== '' ? Number(idStr) : null;
      signals.push({
        dir,
        active: attr(a, 'active') === 'true',
        spacecraft: attr(a, 'spacecraft'),
        spacecraftId: id != null && isFinite(id) ? id : null,
      });
    }
    dishes.push({ name, signals });
  }
  return dishes;
}

export interface DsnLookup {
  /** NAIF id → craft id. */
  byNaif: Map<number, string>;
  /** Uppercased DSN spacecraft code/name → craft id. */
  byAlias: Map<string, string>;
}

/** DSN spacecraft codes that do not equal our NAIF ids. */
export const DSN_ALIASES: Record<string, string[]> = {
  'voyager-1': ['VGR1'],
  'voyager-2': ['VGR2'],
  curiosity: ['MSL'],
  perseverance: ['M20', 'MARS2020', 'PERS'],
  'new-horizons': ['NHPC', 'NH'],
  jwst: ['JWST', 'JWS'],
  'parker-solar-probe': ['SPP', 'PSP'],
  'solar-orbiter': ['SOLO', 'SOL'],
  bepicolombo: ['BEP', 'MPO', 'MMO'],
  'europa-clipper': ['ECM', 'CLIP'],
  juice: ['JUIC', 'JUICE'],
  psyche: ['PSYC', 'PSY'],
  lucy: ['LUCY', 'LUC'],
  akatsuki: ['AKTS', 'PLC'],
};

export function buildLookup(registry: { id: string; naifId: number | null }[]): DsnLookup {
  const byNaif = new Map<number, string>();
  const byAlias = new Map<string, string>();
  for (const r of registry) {
    if (r.naifId != null) byNaif.set(r.naifId, r.id);
    for (const a of DSN_ALIASES[r.id] ?? []) byAlias.set(a.toUpperCase(), r.id);
  }
  return { byNaif, byAlias };
}

/** Reduce parsed dishes to one contact record per craft id. */
export function contactsByCraft(dishes: DsnDish[], lookup: DsnLookup): Record<string, DsnContact> {
  const out: Record<string, DsnContact> = {};
  for (const dish of dishes) {
    for (const sig of dish.signals) {
      if (!sig.active) continue;
      let craftId: string | undefined;
      if (sig.spacecraftId != null) craftId = lookup.byNaif.get(sig.spacecraftId);
      if (!craftId && sig.spacecraft) craftId = lookup.byAlias.get(sig.spacecraft.toUpperCase());
      if (!craftId) continue;

      const prev = out[craftId];
      const dir = sig.dir;
      let direction: DsnContact['direction'] = dir;
      if (prev?.direction && prev.direction !== dir) direction = 'both';
      out[craftId] = {
        inContact: true,
        direction,
        antenna: prev?.antenna ?? dish.name.toUpperCase(),
      };
    }
  }
  return out;
}
