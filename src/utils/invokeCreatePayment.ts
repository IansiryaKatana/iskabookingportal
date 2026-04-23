/**
 * Invoke create-payment Edge Function with cache-busting and no-store
 * to avoid browser/proxy returning a cached 404 (e.g. from before the function was deployed).
 */
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export type CreatePaymentBody = {
  applicationId: string;
  amount?: number;
  type?: string;
  label?: string;
  instalmentId?: string;
};

export type CreatePaymentResult = {
  clientSecret?: string;
  amount?: number;
  baseAmount?: number;
  processingFee?: number;
  totalChargeAmount?: number;
  currency?: string;
  error?: string;
};

export type InvokeResult = { data: CreatePaymentResult | null; error: { message: string } | null };

export async function invokeCreatePayment(body: CreatePaymentBody): Promise<InvokeResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return {
      data: null,
      error: { message: sessionError?.message ?? "Not authenticated" },
    };
  }

  const url = `${SUPABASE_URL}/functions/v1/create-payment?_=${Date.now()}`;
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as CreatePaymentResult & { error?: string };

  if (!res.ok) {
    return {
      data: null,
      error: { message: json?.error ?? `Request failed (${res.status})` },
    };
  }

  if (json?.error) {
    return { data: json, error: { message: json.error } };
  }

  return { data: json, error: null };
}
