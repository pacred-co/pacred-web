# Google Maps API Key — setup guide

> Pacred uses Google Maps for the drivers GPS map (`/admin/drivers/[id]` route shows assigned forwarder pickup points). The key is required for the page to render the map · without it the page falls back to a static "Map unavailable" placeholder.

## Where it's used

- `app/[locale]/(admin)/admin/drivers/[id]/page.tsx` — GPS map showing forwarder pickup locations
- (potentially) `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` — recipient address verification map
- (future) customer portal address picker

## Env var name

`GOOGLE_MAPS_API_KEY` — read by Server Components only. **Never expose to client** (don't prefix with `NEXT_PUBLIC_`) — the key would be visible in the browser bundle and abusable. Pass the rendered map HTML / static image URL down from the server instead.

## Step-by-step · get the key from Google Cloud

### 1. Go to Google Cloud Console
- URL: https://console.cloud.google.com
- Login with your Google account (use a work Google account · not personal · so billing + access stay with Pacred)

### 2. Create a project (or use an existing one)
- Top bar → project dropdown → **"NEW PROJECT"**
- Name: `pacred-prod` (or whatever you prefer)
- Organization: (leave default)
- Click **CREATE**

### 3. Enable billing
- Left sidebar → **Billing**
- Link a credit card · Google gives **$200 free credit per month** for Maps APIs · we should stay well under that
- Without billing, the APIs return errors after a small free quota

### 4. Enable the right APIs
Left sidebar → **APIs & Services** → **Library** → enable EACH of these:
- ✅ **Maps JavaScript API** — for interactive map rendering
- ✅ **Geocoding API** — convert addresses ↔ lat/lng (for forwarder pickup pins)
- ✅ **Places API** — autocomplete for address picker (optional · enable if we add it later)
- ✅ **Maps Embed API** — for `<iframe>` style embeds (cheaper alternative · use if interactive not needed)

### 5. Create the API key
- Left sidebar → **APIs & Services** → **Credentials**
- Top → **+ CREATE CREDENTIALS** → **API key**
- Copy the key (starts with `AIza...`) — **DO NOT share or commit** — paste into `.env.local` only

### 6. Restrict the key (security · IMPORTANT)

Click on the key just created → **"EDIT API KEY"** screen:

**Application restrictions:**
- Choose **HTTP referrers (web sites)**
- Add these referrers:
  - `https://pacred.co.th/*`
  - `https://*.pacred.co.th/*`
  - `https://pacred-web.vercel.app/*` (Vercel preview · or whatever the deploy URL is)
  - `https://*.vercel.app/*` (preview deploys)
  - `http://localhost:3000/*` (local dev)

**API restrictions:**
- Choose **Restrict key**
- Check ONLY the APIs from step 4 (Maps JS · Geocoding · Places · Embed) — block everything else

Click **SAVE**.

### 7. Add to Pacred

**Local dev (your machine):**
```bash
# Add to .env.local (gitignored)
echo "GOOGLE_MAPS_API_KEY=AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" >> .env.local
```

**Vercel prod:**
- Go to https://vercel.com/pacred-co/pacred-web/settings/environment-variables
- Add new var:
  - **Key:** `GOOGLE_MAPS_API_KEY`
  - **Value:** the same `AIzaXXXX...` key
  - **Environments:** ✅ Production · ✅ Preview · ✅ Development
- Click **Save**
- Next deploy will pick it up

**Vercel CLI alternative (if you have it):**
```bash
vercel env add GOOGLE_MAPS_API_KEY production
# paste value when prompted
```

### 8. Verify it works

After deploy:
- Open `/admin/drivers/[any driver id]`
- The map should render with markers at forwarder pickup addresses
- If it shows "Map unavailable" → check the deploy logs for `GOOGLE_MAPS_API_KEY undefined`

## Cost monitoring

- Dashboard → **APIs & Services** → **Dashboard** → see request counts per API
- $200 free credit / month = ~28,000 Maps JS loads OR ~40,000 geocoding requests
- Set a billing alert at $20/month so you get pinged before hitting the free quota
- If costs spike (compromised key) → regenerate key + update env vars in Vercel

## Reference

- Maps Platform pricing: https://mapsplatform.google.com/pricing/
- API restrictions guide: https://cloud.google.com/docs/authentication/api-keys
- Existing Pacred env vars: [`docs/env.md`](../env.md)
