# Blocking scrapers, staying AI-visible, and clean analytics

Decision: search engines **and** AI assistants are welcome (we want to be found
and cited). Only aggressive SEO/backlink scrapers are turned away.

## Layer 1 — robots.txt (in place)
`public/robots.txt` allows everything, including AI crawlers (GPTBot, ClaudeBot,
PerplexityBot, OAI-SearchBot, Google-Extended, Applebot-Extended, …), and
disallows only junk scrapers (AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot,
DataForSeoBot, Bytespider). Advisory only — polite bots obey it.

## Layer 2 — Cloudflare edge (hard block)
The junk scrapers above mostly ignore robots.txt, so enforce it at the edge.

### Option A — apply it from code (recommended, reproducible)
```bash
npx tsx scripts/cloudflare-harden.ts            # dry run, prints the rule
CF_API_TOKEN=xxxx npx tsx scripts/cloudflare-harden.ts --apply
```
Creates/updates one WAF custom rule blocking those scraper user-agents, leaving
any existing rules untouched. Token scopes: **Zone:Read + Zone WAF:Edit**,
scoped to the `sublight.observer` zone (create it at
dash.cloudflare.com → My Profile → API Tokens). AI and search crawlers are left
allowed on purpose.

### Option B — the dashboard, by hand
Security → WAF → Custom rules → Create: expression matching those user-agents,
action Block.

### Do NOT enable the managed "Block AI bots" toggle
Cloudflare's one-click "Block AI Scrapers and Crawlers" would block the AI
assistants you want to stay visible to. Same reason to be cautious with a blanket
**Bot Fight Mode** — it can challenge AI-search crawlers. The targeted rule above
is the right tool given the "stay AI-visible" choice.

## Layer 3 — analytics that ignore bots (the real lever)
A JS analytics beacon only fires in a real browser running JS; almost all
crawlers fetch raw HTML and never trigger it, so they're already invisible. Pick
a tool that also filters the bots which do run JS:

- **Cloudflare Web Analytics** (recommended — free, cookieless, on your stack):
  dashboard → Analytics & Logs → Web Analytics → add `sublight.observer`.
  Automatic setup injects the beacon (no code change). Or paste the snippet into
  `index.html` and I'll wire it:
  ```html
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token":"YOUR_TOKEN"}'></script>
  ```
- Alternatives: Plausible (paid) or Umami (self-hosted). Avoid raw Google
  Analytics if clean numbers matter.
