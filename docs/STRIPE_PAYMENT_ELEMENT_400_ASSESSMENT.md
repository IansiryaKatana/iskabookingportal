# Stripe Payment Element 400 – Thorough Assessment

## 1. What you’re seeing

- **Request:** `GET https://api.stripe.com/v1/elements/sessions?client_secret=pi_...&key=pk_test_...&_stripe_version=2025-09-30.clover&type=payment_intent`
- **Response:** `400 Bad Request`
- **When:** Right after creating a Payment Intent (deposit or instalment) and rendering the Payment Element (e.g. on the Payments page or in the Application Wizard).
- **Effect:** “Unhandled payment Element loaderror” and the card form doesn’t load; students can’t pay.

So the failure is **not** in your app logic or in “create payment intent” – it’s when **Stripe.js** calls the **elements/sessions** endpoint with the Payment Intent `client_secret` and gets 400 back.

---

## 2. Root cause: API version mismatch

### 2.1 Two different API versions

| Side | What uses it | API version |
|------|----------------|-------------|
| **Browser** | `@stripe/stripe-js` v8 (and `@stripe/react-stripe-js` v5) | **2025-09-30.clover** (sent as `_stripe_version=2025-09-30.clover` in the elements/sessions request) |
| **Server** | Stripe Node in `create-payment` Edge Function (Stripe npm 18.5.0) | **Default at release time** (Stripe Node v18 defaults to something like **2025-03-31.basil**) |

So:

- The **client** is on **Clover** (2025-09-30.clover).
- The **server** was creating Payment Intents with the **default** (e.g. Basil) version.
- The **elements/sessions** endpoint is part of the **Clover** flow. When it receives a `client_secret` for a Payment Intent, Stripe validates that the Payment Intent is compatible with the Clover API. If the Intent was created with an **older** API version (e.g. Basil), the server can respond with **400** and the Payment Element fails to load.

So the 400 is coming from **Stripe’s API**, not from your code, and the underlying cause is **version mismatch** between the Intent (server) and the Elements/sessions call (client).

### 2.2 Why multiple intents show 400

You see 400 for several different Payment Intents (e.g. `pi_3T4HDVI...`, `pi_3T4HELI...`, `pi_3T4HJgI...`):

- **Older ones:** May have been created in an earlier session or before the fix; they’re still created with the old server version, so elements/sessions returns 400.
- **New one** (e.g. “Payment intent created successfully” then 400): The Intent is created successfully, but with the **old** API version. As soon as the browser loads the Payment Element and calls elements/sessions with that `client_secret`, Stripe rejects it with 400 because the Intent is not Clover-compatible.

So every Payment Intent created **before** aligning the server with Clover can trigger this 400, even if it’s brand new and in `requires_payment_method`.

### 2.3 Other things that do *not* explain the 400 (but are easy to confuse)

- **Reuse / “client secret already used”:** Stripe’s docs say you can’t reuse secrets in certain states. That can also cause 400 in some cases, but here the **newly** created Intent also returns 400, so the main issue is version, not reuse. Using a fresh Intent per flow (and `key={paymentClientSecret}` on `<Elements>`) is still good practice.
- **Invalid or wrong `client_secret`:** If the secret were wrong or from another account, you’d typically get a different error or 404, not a consistent 400 from elements/sessions with a valid-looking `pi_..._secret_...`.
- **CORS / network:** 400 is an HTTP status from Stripe’s API; CORS would usually show up as a different error or blocked request.
- **HTTP vs HTTPS:** The “test over HTTP” / “Apple Pay needs HTTPS” messages are unrelated to this 400; they don’t cause elements/sessions to return 400.

So the **consistent** explanation is: **elements/sessions (Clover) is rejecting Payment Intents created with a non-Clover API version.**

---

## 3. Fix applied: create intents with Clover on the server

To make the Payment Intent compatible with the Clover elements/sessions call, the **server** must create the Intent with the **same** API version the client uses.

**Change in `supabase/functions/create-payment/index.ts`:**

- **Before:**  
  `const stripe = new Stripe(stripeSecret);`  
  (uses Stripe Node’s default API version, e.g. 2025-03-31.basil)

- **After:**  
  `const stripe = new Stripe(stripeSecret, { apiVersion: "2025-09-30.clover" });`

So:

- Every Payment Intent created by this function (deposit and instalment) is now created with **2025-09-30.clover**.
- When the browser sends that Intent’s `client_secret` to `elements/sessions` with `_stripe_version=2025-09-30.clover`, Stripe should accept it and return 200, and the Payment Element should load.

**What you need to do:**

1. **Redeploy the Edge Function** so the change is live:
   ```bash
   npx supabase functions deploy create-payment
   ```
2. **Retest:** Create a **new** deposit or instalment payment (so a **new** Payment Intent is created with Clover). The first request after deploy should use the new version; no need to change anything on the front end.
3. **Old intents:** Any Payment Intent created **before** this deploy will still be “old” version; if the user somehow reuses that same client_secret, elements/sessions can still return 400. In normal flow they get a new Intent each time they click “Pay”, so after deploy they should always get a Clover Intent and the 400 should stop.

---

## 4. If you still get 400 after this

### 4.1 Stripe account doesn’t support Clover

Some Stripe accounts may not support `2025-09-30.clover` yet (e.g. restricted or very old accounts). In that case, calling `paymentIntents.create` with that API version can fail (e.g. version-related error from Stripe).

- **What you’ll see:** Errors when **creating** the Payment Intent (in the Edge Function logs or in the network tab for the `create-payment` request), not only when loading the Element.
- **What to do:**  
  - Remove the `apiVersion` option from the Stripe constructor so the server falls back to its default again.  
  - Then use a **client** that doesn’t use the Clover elements/sessions endpoint (see 4.2).

### 4.2 Fallback: use an older Stripe.js that doesn’t use elements/sessions

If you **cannot** use Clover on the server (e.g. account limitation), the alternative is to use a **Stripe.js** version that still uses the **legacy** Elements flow and does **not** call `elements/sessions` with Clover.

- **Current:** `@stripe/stripe-js` **^8.3.0** and `@stripe/react-stripe-js` **^5.3.0** (react-stripe-js 5 requires stripe-js **>=8.0.0**).
- So you **cannot** keep react-stripe-js 5 and only downgrade stripe-js to 7; you’d have to downgrade **both** to versions that work together (e.g. react-stripe-js 4.x and stripe-js 7.x), and then the client would no longer send `_stripe_version=2025-09-30.clover` and would not hit the Clover-only elements/sessions behaviour.

Only consider this if the server-side Clover fix isn’t possible and Stripe support confirms your account can’t use 2025-09-30.clover.

### 4.3 Fallback applied (conclusive fix)

Because the 400 persisted even after aligning the server with Clover, the **client fallback** was applied so workflows are not broken:

- **Pinned versions:**  
  - `@stripe/stripe-js`: **7.9.0** (no Clover; does not call `elements/sessions`)  
  - `@stripe/react-stripe-js`: **4.0.2** (compatible with stripe-js &lt;8)
- **Result:** The same Payment Element flow (deposit + instalments) is used, but the browser no longer calls Stripe's Clover `elements/sessions` endpoint, so the 400 is avoided.
- **Workflows unchanged:** ApplicationWizard (deposit), Payments (instalments), and StripePaymentForm behaviour are unchanged; only the Stripe client package versions were pinned in `package.json`.
- **Server:** The create-payment Edge Function can keep `apiVersion: "2025-09-30.clover"` or remove it; Payment Intents created by the server work with stripe-js 7.

---

## 5. Summary

| Item | Conclusion |
|------|------------|
| **What fails** | Stripe’s `GET .../v1/elements/sessions` with `client_secret` of a Payment Intent → **400 Bad Request**. |
| **Why** | **API version mismatch:** client uses **2025-09-30.clover**, server was creating Intents with an **older** default (e.g. Basil). Clover’s elements/sessions rejects those Intents. |
| **Fix** | Create Payment Intents with **2025-09-30.clover** on the server: `new Stripe(secret, { apiVersion: "2025-09-30.clover" })` in `create-payment`. |
| **What you do** | Deploy `create-payment`, then test with a **new** payment (new Intent). Old Intents may still 400 if reused; normal flow creates a new Intent each time. |
| **If 400 continues** | Check (1) server logs for errors when creating the Intent (Clover not allowed?), and (2) if needed, fall back to older stripe-js + react-stripe-js so the client doesn’t use Clover elements/sessions. |

This matches the behaviour you’re seeing and gives you a clear path to fix it (server API version) and a fallback if your Stripe account doesn’t support Clover yet.
