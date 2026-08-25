// ---------------------------------------------------------------------------
// cloudflare-harden.ts — add a WAF custom rule that hard-blocks aggressive
// SEO / backlink scrapers at Cloudflare's edge (the bots that ignore
// robots.txt). AI assistants and search engines are deliberately NOT blocked,
// so the site stays citable and findable.
//
// This is a one-off ops script, not part of the served site — no backend is
// added to the product. It just calls the Cloudflare API on your behalf.
//
//   npx tsx scripts/cloudflare-harden.ts            # dry run: print the rule
//   npx tsx scripts/cloudflare-harden.ts --apply    # create/update the rule
//
// Env:
//   CF_API_TOKEN   required to --apply. Scopes: Zone:Read + Zone WAF:Edit,
//                  limited to the sublight.observer zone.
//   CF_ZONE_ID     optional; otherwise resolved from CF_ZONE_NAME.
//   CF_ZONE_NAME   optional; defaults to sublight.observer.
// ---------------------------------------------------------------------------
const API = 'https://api.cloudflare.com/client/v4';
const RULE_DESC = 'sublight: block SEO/backlink scrapers';

// Same list as public/robots.txt, enforced here for the bots that ignore it.
const BAD_UA = ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'BLEXBot', 'DataForSeoBot', 'Bytespider'];

const expression =
  BAD_UA.map((ua) => `(lower(http.user_agent) contains "${ua.toLowerCase()}")`).join(' or ');

async function cf(path: string, init: RequestInit = {}) {
  const token = process.env.CF_API_TOKEN;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const json: any = await res.json();
  if (!json.success) throw new Error(`CF ${path}: ${JSON.stringify(json.errors)}`);
  return json.result;
}

async function resolveZoneId(): Promise<string> {
  if (process.env.CF_ZONE_ID) return process.env.CF_ZONE_ID;
  const name = process.env.CF_ZONE_NAME || 'sublight.observer';
  const zones = await cf(`/zones?name=${encodeURIComponent(name)}`);
  if (!zones.length) throw new Error(`No Cloudflare zone found for ${name}`);
  return zones[0].id;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rule = { action: 'block', description: RULE_DESC, expression, enabled: true };

  console.log('WAF custom rule to enforce:');
  console.log(`  action:      block`);
  console.log(`  description: ${RULE_DESC}`);
  console.log(`  expression:  ${expression}\n`);

  if (!apply) {
    console.log('Dry run. Blocks these user-agents:', BAD_UA.join(', '));
    console.log('Note: AI + search crawlers are intentionally left allowed.');
    console.log('\nRe-run with --apply and CF_API_TOKEN set to create/update it.');
    return;
  }
  if (!process.env.CF_API_TOKEN) throw new Error('CF_API_TOKEN is required to --apply');

  const zoneId = await resolveZoneId();
  console.log(`Zone: ${zoneId}`);

  // Read the custom-firewall entrypoint ruleset (create it if missing).
  let ruleset: any;
  try {
    ruleset = await cf(`/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`);
  } catch {
    ruleset = { rules: [] };
  }

  // Replace any prior copy of our rule; keep everything else.
  const others = (ruleset.rules || []).filter((r: any) => r.description !== RULE_DESC);
  const rules = [...others, rule];

  await cf(`/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`, {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
  console.log(`✓ Applied. ${others.length} existing rule(s) preserved, 1 scraper-block rule active.`);
}

main().catch((e) => { console.error('✗', (e as Error).message); process.exit(1); });
