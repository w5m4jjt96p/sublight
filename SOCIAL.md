# Sublight daily post

One deterministic post a day, built from the freshly generated data so no number
is ever invented. Generated at the end of the daily GitHub Action
(`.github/workflows/refresh.yml`).

## Default flow: generate + copy-paste (free)
X's API now charges per post (Pay-Per-Use), so by default we do **not** post
automatically. Instead, the daily job opens a **GitHub issue** titled
`🛰️ Post for YYYY-MM-DD` with the ready-to-paste text (and, for rover posts, a
link to the image to attach). You get the notification, paste it to X (or
anywhere), then close the issue.

Test it now without waiting for the 04:00 UTC cron: repo → **Actions** →
**refresh-data** → **Run workflow**. An issue appears within a couple of minutes.

Preview locally, no posting:
```bash
npm run social
```

## Post types (rotated deterministically)
- **light-time** — a craft's current one-way delay and round trip
- **farthest** — the most distant working spacecraft that day
- **fleet-pulse** — how many are still working, and the range of signal ages
- **rover-frame** — a fresh Perseverance/Curiosity frame reference
- **on-this-day** — launch/arrival anniversaries (these take priority)

Every post links back to the relevant page on sublight.observer; the link
unfurls a card via the site's OG image.

## Optional: fully automatic posting to X (paid)
The code still supports posting straight to X via the API if you fund it
(Pay-Per-Use credits, or the paid Basic tier). To switch it back on:
1. In the X developer portal, add credits / a payment method.
2. Add repo secrets `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`,
   `X_ACCESS_SECRET` (OAuth 1.0a, App permissions **Read and write**).
3. In `refresh.yml`, swap the "Generate daily post" / "Open daily post issue"
   steps for a step running `npm run social:live` with those secrets in `env`.

Verified: the OAuth 1.0a signing works end to end — the only blocker on the free
attempt was X returning `402 credits depleted`.
