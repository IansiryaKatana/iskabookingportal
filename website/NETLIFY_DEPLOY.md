# Netlify deployment – Urban Hub website

Deploy the marketing website (urbanhub.uk) from the **website** folder.

## 1. Netlify site setup

- **Build command:** `npm run build`  
- **Publish directory:** `dist`  
- **Base directory:** `website` (so Netlify runs commands and uses config from `website/`)

If the repo root is the website app (no `website/` subfolder), leave base directory empty and use the root `netlify.toml` instead.

## 2. Environment variables

In **Site settings → Environment variables** add:

- `VITE_SUPABASE_URL` – Supabase project URL  
- `VITE_SUPABASE_PUBLISHABLE_KEY` – Supabase anon/public key  
- `VITE_PORTAL_URL` – *(optional)* Booking portal base URL (defaults to `https://portal.urbanhub.uk`). Room grade "Book Now" links and sign-in/register links point here.

Use the same names as in `website/.env.example` so Vite can read them at build time.

## 3. What this config does

- **Build:** `npm run build` → output in `dist`
- **Redirects (in `website/netlify.toml`):**
  - 301s from old urbanhub.uk paths to new paths or portal
  - SPA fallback: `/*` → `/index.html` (200) so client-side routing works
- **Headers:** security headers and long-lived cache for `/assets/*`

## 4. Custom domain (urbanhub.uk)

In **Domain management**:

1. Add custom domain `urbanhub.uk` (and `www.urbanhub.uk` if needed).
2. Set DNS at your registrar:
   - **A** or **CNAME** as shown in Netlify (e.g. load balancer or `xxx.netlify.app`).
3. Enable HTTPS (Netlify provisioned certificate).

## 5. Portal links (room grades and sign-in)

All links to the booking portal use `VITE_PORTAL_URL` (default: `https://portal.urbanhub.uk`):

- **Room grade "Book Now"** → `https://portal.urbanhub.uk/studios/{year}/{slug}` (e.g. `/studios/2025-2026/silver`)
- **Sign in** → `https://portal.urbanhub.uk/portal/login`
- **Create account** → `https://portal.urbanhub.uk/portal/login?mode=register`
- **Account dropdown** → Dashboard or Admin as appropriate

Set `VITE_PORTAL_URL=https://portal.urbanhub.uk` in Netlify env vars if your portal is at that domain. Otherwise set it to your portal’s base URL.

## 6. After deploy

- Confirm old URLs (e.g. `/terms-condition/`, `/urban-hub-keyworkers/`) 301 to the new URLs.
- Confirm `/short-term?tab=keyworker` opens the Keyworker tab.
- Check Supabase Auth **Redirect URLs** include: `https://urbanhub.uk`, `https://www.urbanhub.uk`, and `https://<your-site>.netlify.app`.
