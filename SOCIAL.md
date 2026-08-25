# Sublight social posts (X)

One deterministic post a day, built from the freshly generated data so no number
is ever invented. Runs at the end of the daily GitHub Action
(`.github/workflows/refresh.yml`), only on the scheduled cron. Secrets never
touch the client — they live in GitHub Actions secrets, in keeping with the
zero-backend rule.

## Preview locally (no credentials needed)
```bash
npm run social
```
Prints today's post and a 7-day preview. Nothing is published.

## Post types (rotated deterministically)
- **light-time** — a craft's current one-way delay and round trip
- **farthest** — the most distant working spacecraft that day
- **fleet-pulse** — how many are still working, and the range of signal ages
- **rover-frame** — a fresh Perseverance/Curiosity frame reference
- **on-this-day** — launch/arrival anniversaries (these take priority)

Every post links back to the relevant page on sublight.observer; the link
unfurls a card via the site's OG image.

## Going live — what you need to create (I can't create accounts or hold keys)
1. Create the X account, then apply for a developer app at developer.x.com.
2. In the app: set permissions to **Read and write**, generate **OAuth 1.0a**
   API key/secret and an access token/secret **for the posting account**.
3. Add GitHub repo secrets:
   - `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`
   - The free API tier covers one post a day. Text posts are supported; the
     link card provides the visual.
4. Test end to end before the cron with the env vars set:
   ```bash
   npm run social:live
   ```

The job no-ops if the secrets are missing, so nothing breaks before you set it up.
