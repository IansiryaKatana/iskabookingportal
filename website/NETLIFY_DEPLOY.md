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
- `VITE_SUPABASE_ANON_KEY` – Supabase anon/public key  

Use the same names as in `website/.env` so Vite can read them at build time.

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

## 5. After deploy

- Confirm old URLs (e.g. `/terms-condition/`, `/urban-hub-keyworkers/`) 301 to the new URLs.
- Confirm `/short-term?tab=keyworker` opens the Keyworker tab.
- Check Supabase Auth **Redirect URLs** include your Netlify URL (and custom domain) if you use auth on this site.
