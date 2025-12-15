## Recharts / Scheduler Runtime Error in Production

**Error**

- `Uncaught TypeError: Cannot read properties of undefined (reading 'unstable_scheduleCallback')`
- Reported from built chunk: `charts-*.js` (e.g. `charts-DpAbzKB_.js`) in production.

**Root cause**

- Vite was configured to **split Recharts into a separate `charts` chunk**:
  - `vite.config.ts` used `manualChunks` with:
    - `if (id.includes("recharts")) return "charts";`
- React’s internal scheduler object (from the `scheduler` / `react-dom` runtime) ended up **not being available** in that isolated chunk at runtime, so the compiled React internals inside the charts bundle did:
  - `var vh = qe.unstable_scheduleCallback;`
  - but `qe` was `undefined` in production → `Cannot read properties of undefined`.
- Locally, the dev server had everything in a single bundle, so the scheduler object was present and no error appeared.

**Symptom**

- Only visible in **Netlify production**, not in local dev.
- Triggered when visiting pages that import Recharts, e.g. `SalesReports`.

**Fix implemented**

- **Keep Recharts in the main React bundle** instead of a separate `charts` chunk.
- Change in `vite.config.ts`:
  - Removed the `if (id.includes("recharts")) { return "charts"; }` branch from `manualChunks`.
  - All other vendor splitting rules remain the same.

**How to apply this fix (summary)**

1. Open `vite.config.ts`.
2. Inside `build.rollupOptions.output.manualChunks`, **remove** the `recharts` condition:
   - Delete:
     - `// Chart libraries`
     - `if (id.includes("recharts")) { return "charts"; }`
3. Run a **clean build and deploy**:
   - `npm run build`
   - Push changes to `main`.
   - In Netlify: trigger **“Clear cache and deploy site”** for one deploy.

**Verification steps**

- After deploy:
  - Hard-refresh the production site (or open in incognito).
  - Navigate to **Admin → Sales & Demographics (SalesReports)**.
  - Confirm the error `reading 'unstable_scheduleCallback'` no longer appears in the browser console.

**If the error ever reappears**

- Check that:
  - `vite.config.ts` does **not** split `react`, `react-dom`, or `recharts` into separate chunks that might execute before the shared scheduler runtime is available.
  - `package-lock.json` is committed and Netlify deploys with a **clean cache** (no stale `node_modules`).


