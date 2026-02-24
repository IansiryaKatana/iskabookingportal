# Deposit 404 – Analysis and Recommendations

## Summary of the situation

- **Server (Supabase logs):** The `create-payment` Edge Function runs and logs e.g.  
  `Deposit payment request (amount from contract) { applicationId: "ad835b8b-12f0-4001-b77b-5e383357563a" }`  
  So the function is deployed (version 63), in project `pzptocwdaqpczexlbajr`, and is being hit for that application.
- **Client (browser):** The app reports  
  `POST https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/create-payment 404 (Not Found)`  
  and the deposit flow fails.

So the function is reachable and executed in at least one case, but the client still sees 404. That points to **how/when** the client gets the response (e.g. caching or multiple requests), not to the function being missing.

---

## 1. Codebase analysis

### 1.1 Recent changes (relevant to deposit / create-payment)

- **Auth:** Invalid refresh token handling in `AuthContext` (clear session on init and `clearSessionIfExpired`). Unrelated to 404; can cause 400 from Auth if the session is bad.
- **ApplicationWizard / Payments:** Use of `supabase.functions.invoke("create-payment", { body: ... })` for deposit and instalment. No recent change to the function name or URL.
- **create-payment Edge Function:** Logging and CORS unchanged; only log messages and Cache-Control were updated. No change that would make the gateway return 404.

None of these explain the gateway returning 404 for a URL where the function clearly runs in the same project.

### 1.2 Where create-payment is invoked

| Location                 | Purpose              | Body |
|--------------------------|----------------------|------|
| `ApplicationWizard.tsx`  | Deposit (step 5/6)   | `{ applicationId }` |
| `Payments.tsx`           | Instalment payment   | `{ applicationId, amount, type: "instalment", label, instalmentId }` |
| `BookingPanel.tsx`       | Different flow       | Different body (not the same API as above) |

Deposit flow uses only `applicationId`; the function derives the amount from the contract. That matches the log and is correct.

### 1.3 Supabase client and URL

- **URL:** `SUPABASE_URL` (e.g. `VITE_SUPABASE_URL`) is used to build  
  `https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/create-payment`.  
  Same project as in the logs.
- **Auth:** `functions.invoke` uses the current session (Bearer token). No custom base URL or function name that would point elsewhere.
- **Caching:** The default `fetch` used by the Supabase client does not set `cache: 'no-store'`, so the browser can cache responses (including 404) for the same URL.

So the only plausible client-side cause for “still 404” while the function runs is **caching or multiple requests** (e.g. one request succeeds and is logged, another is served from cache or fails at the gateway).

---

## 2. Database

- No recent migrations remove or rename `student_applications`, `contracts`, or related tables used by `create-payment`.
- If the DB were wrong, the function would still be reached; it would return 4xx/5xx with a JSON body (e.g. “Application not found”), not an HTTP 404 from the edge.

So the 404 is not caused by recent DB changes.

---

## 3. Root cause hypotheses (for you to decide)

| Hypothesis | Likelihood | Explanation |
|------------|------------|-------------|
| **A. Cached 404** | High | Earlier, before the function was deployed or after a bad deploy, the browser (or a proxy) got a 404 for `create-payment` and cached it. Later requests for the same URL are served from cache, so the client still sees 404 even when the function runs and returns 200. |
| **B. Multiple requests, one cached** | Medium | e.g. Double-click or StrictMode: one request hits the function (we see the log) and succeeds; another request is served from cache as 404, and the UI might show the 404. |
| **C. Intermittent gateway 404** | Lower | Load balancer or edge sometimes routes to a node where the function isn’t available yet (e.g. right after deploy). Less likely if the same project and same URL always show the log when you try. |
| **D. OPTIONS vs POST** | Low | If OPTIONS (CORS preflight) returned 404, the browser would block the POST and report a failed request. Our function and CORS helper handle OPTIONS; typically that would be 200, not 404. |

Recommendation: treat **A** (and possibly **B**) as the main explanation and mitigate with no-cache behaviour and, if needed, a single-fire button.

---

## 4. What was implemented (for you to keep or adjust)

### 4.1 No-cache invoke for create-payment (deposit and instalment)

- **New helper:** `src/utils/invokeCreatePayment.ts`
  - Calls `create-payment` with **`fetch(..., { cache: 'no-store' })`**.
  - Adds a **cache-busting query param** `?_=<timestamp>` so the request URL is unique and the browser does not reuse a cached 404.
  - Uses the same auth (session token + anon key) as the rest of the app.

- **Usage:**
  - **ApplicationWizard:** Deposit flow now uses `invokeCreatePayment({ applicationId })` instead of `supabase.functions.invoke("create-payment", ...)`.
  - **Payments:** Instalment flow now uses `invokeCreatePayment({ applicationId, amount, type: "instalment", label, instalmentId })` instead of `supabase.functions.invoke("create-payment", ...)`.

So all deposit and instalment payment requests now bypass cache and avoid reusing an old 404 for the same URL.

### 4.2 Cache-Control on the Edge Function

- In **`supabase/functions/create-payment/index.ts`**, all responses from the function now include:
  - `Cache-Control: no-store, no-cache, must-revalidate`
  - `Pragma: no-cache`
- So even if something downstream caches responses, the payment endpoint is explicitly marked as non-cacheable.

After deploying the function, these headers apply to all `create-payment` responses (success and error).

---

## 5. Recommendations (for you to decide)

### 5.1 Deploy and test (recommended)

1. **Redeploy the Edge Function** (so the new Cache-Control headers are live):
   ```bash
   npx supabase functions deploy create-payment
   ```
2. **Hard refresh / no-cache test:**
   - Open the app in an **incognito/private** window (or with “Disable cache” in DevTools).
   - Sign in and go to the deposit step.
   - Click “Pay deposit online” once and wait.
3. If it still fails, in DevTools **Network** tab:
   - Check the **exact** request that returns 404: URL, method (POST vs OPTIONS), response body, and whether it’s “from cache”.
   - That will tell you if it’s still cache (A/B) or something else (e.g. C).

### 5.2 If 404 persists

- **Confirm in Supabase Dashboard:** Project → Edge Functions → `create-payment` is present and deployed (e.g. version 63 or higher).
- **Confirm env:** The app’s `VITE_SUPABASE_URL` (or equivalent) is exactly `https://pzptocwdaqpczexlbajr.supabase.co` (no typo, no different project).
- **Optional:** Temporarily call `create-payment` from the Dashboard “Invoke” with a test body and confirm it returns 200. That isolates client vs gateway/function.

### 5.3 Optional: single-fire button

- The deposit button is already disabled with `creatingIntent` while the request is in progress, so double-clicks shouldn’t send two requests.
- If you still suspect duplicate calls (e.g. from StrictMode or another effect), you could add a short “cooldown” (e.g. ignore further clicks for 2 seconds after starting) or ensure the handler is only attached once. Only worth doing if you see two POSTs in the Network tab for one click.

### 5.4 Stripe HTTP warning

- “You may test your Stripe.js integration over HTTP. However, live Stripe.js integrations must use HTTPS.”  
- This is expected on `http://localhost`. Use HTTPS in production; no change needed for the 404.

---

## 6. Short checklist

- [ ] Redeploy: `npx supabase functions deploy create-payment`
- [ ] Test in incognito or with “Disable cache” and one click on “Pay deposit online”
- [ ] If still 404: capture in Network tab (URL, method, “from cache?”, response body) and re-check Dashboard + env
- [ ] Keep `invokeCreatePayment` for deposit and instalment so all payment calls use no-cache and cache-busting

This document reflects the current codebase and Supabase logs you shared. If you later change the function name, project, or URL, update this doc and the `invokeCreatePayment` URL accordingly.
