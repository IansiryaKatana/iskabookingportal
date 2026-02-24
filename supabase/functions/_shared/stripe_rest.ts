/**
 * Stripe REST API via fetch only. Use this in Edge Functions instead of the Stripe
 * Node SDK to avoid "Deno.core.runMicrotasks() is not supported" (Node compat in Deno Edge).
 *
 * Stripe API: https://api.stripe.com/v1/, form-encoded bodies, Bearer token auth.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2025-09-30.clover";

function requestHeaders(secret: string, includeFormContentType: boolean): HeadersInit {
  const h: HeadersInit = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": STRIPE_VERSION,
  };
  if (includeFormContentType) {
    (h as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
  }
  return h;
}

async function stripeFetch(
  secret: string,
  method: "GET" | "POST",
  path: string,
  body?: URLSearchParams | string
): Promise<{ data: unknown; error?: { message: string } }> {
  const url = path.startsWith("http") ? path : `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: requestHeaders(secret, method === "POST" && body != null),
    body: body?.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error ?? String(res.status);
    return { data: null, error: { message: typeof msg === "string" ? msg : JSON.stringify(msg) } };
  }
  return { data: json };
}

/** GET /v1/customers?email=... */
export async function listCustomersByEmail(
  secret: string,
  email: string
): Promise<{ data: { data: { id: string }[] }; error?: { message: string } }> {
  const path = `/customers?email=${encodeURIComponent(email)}&limit=1`;
  return stripeFetch(secret, "GET", path) as Promise<{
    data: { data: { id: string }[] };
    error?: { message: string };
  }>;
}

/** POST /v1/customers */
export async function createCustomer(
  secret: string,
  params: { email?: string; name?: string }
): Promise<{ data: { id: string } | null; error?: { message: string } }> {
  const body = new URLSearchParams();
  if (params.email) body.set("email", params.email);
  if (params.name) body.set("name", params.name);
  const out = await stripeFetch(secret, "POST", "/customers", body);
  const data = out.data as { id: string } | null;
  return { data: out.error ? null : data, error: out.error };
}

export type CreatePaymentIntentParams = {
  amount: number;
  currency?: string;
  customer?: string;
  receipt_email?: string;
  description?: string;
  metadata?: Record<string, string>;
};

/** POST /v1/payment_intents */
export async function createPaymentIntent(
  secret: string,
  params: CreatePaymentIntentParams
): Promise<{
  data: { id: string; client_secret: string; amount: number; status: string } | null;
  error?: { message: string };
}> {
  const body = new URLSearchParams();
  body.set("amount", String(params.amount));
  body.set("currency", params.currency ?? "gbp");
  if (params.customer) body.set("customer", params.customer);
  if (params.receipt_email) body.set("receipt_email", params.receipt_email);
  if (params.description) body.set("description", params.description);
  body.set("automatic_payment_methods[enabled]", "true");
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      body.set(`metadata[${k}]`, v);
    }
  }
  const out = await stripeFetch(secret, "POST", "/payment_intents", body);
  const data = out.data as { id: string; client_secret: string; amount: number; status: string } | null;
  return { data: out.error ? null : data, error: out.error };
}

/** GET /v1/payment_intents/:id */
export async function retrievePaymentIntent(
  secret: string,
  id: string
): Promise<{
  data: { id: string; amount: number; currency: string; status: string; created: number; metadata?: Record<string, string> } | null;
  error?: { message: string };
}> {
  const out = await stripeFetch(secret, "GET", `/payment_intents/${encodeURIComponent(id)}`);
  const data = out.data as { id: string; amount: number; currency: string; status: string; created: number; metadata?: Record<string, string> } | null;
  return { data: out.error ? null : data, error: out.error };
}

/** GET /v1/payment_intents?customer=...&limit=... */
export async function listPaymentIntents(
  secret: string,
  params: { customer: string; limit?: number }
): Promise<{
  data: { data: Array<{ id: string; status: string; amount: number; created: number; metadata?: Record<string, string> }> } | null;
  error?: { message: string };
}> {
  const path = `/payment_intents?customer=${encodeURIComponent(params.customer)}&limit=${params.limit ?? 100}`;
  const out = await stripeFetch(secret, "GET", path);
  const data = out.data as { data: Array<{ id: string; status: string; amount: number; created: number; metadata?: Record<string, string> }> } | null;
  return { data: out.error ? null : data, error: out.error };
}

/** POST /v1/payment_intents/search (form body: query, limit) */
export async function searchPaymentIntents(
  secret: string,
  params: { query: string; limit?: number }
): Promise<{
  data: { data: Array<{ id: string; status: string; amount: number; created: number; metadata?: Record<string, string> }> } | null;
  error?: { message: string };
}> {
  const body = new URLSearchParams();
  body.set("query", params.query);
  if (params.limit != null) body.set("limit", String(params.limit));
  const out = await stripeFetch(secret, "POST", "/payment_intents/search", body);
  const data = out.data as { data: Array<{ id: string; status: string; amount: number; created: number; metadata?: Record<string, string> }> } | null;
  return { data: out.error ? null : data, error: out.error };
}
