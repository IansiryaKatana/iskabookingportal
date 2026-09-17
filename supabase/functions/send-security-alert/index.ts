import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const KIND_TITLES: Record<string, string> = {
  staff_login_non_browser: "Staff login from a script (curl / non-browser)",
  login_from_banned_ip: "Login from a banned IP",
  privileged_mfa_enrolled: "Authenticator enrolled on a staff account",
  blocked_privileged_action: "Blocked attempt to use a superadmin / secrets action",
  abusive_signup_blocked: "Blocked abusive signup",
  watched_account_login: "Watched staff account signed in",
  watched_account_ip_change: "Watched staff session changed IP",
  watched_account_activity: "Watched staff account changed data",
};

async function readCredential(key: string, envFallback: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("credentials")
    .select("credential_value")
    .eq("credential_key", key.toLowerCase())
    .maybeSingle();
  const fromDb = data?.credential_value?.trim() ?? "";
  if (fromDb && fromDb !== "[ENCRYPTED]") return fromDb;
  return envFallback;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const provided = req.headers.get("x-security-alert-secret") ?? "";
  const expected = await readCredential(
    "security_alert_webhook_secret",
    Deno.env.get("SECURITY_ALERT_WEBHOOK_SECRET") ?? "",
  );

  if (!provided || !expected || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: {
    id?: string;
    kind?: string;
    actor_id?: string | null;
    actor_email?: string | null;
    detail?: Record<string, unknown>;
    created_at?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kind = payload.kind || "security_alert";
  const title = KIND_TITLES[kind] || `Security alert: ${kind}`;
  const detail = payload.detail ?? {};
  const detailHtml = Object.entries(detail)
    .map(
      ([key, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#555">${key}</td><td>${String(value ?? "")}</td></tr>`,
    )
    .join("");

  const { data: superadmins, error: superadminError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "superadmin");

  if (superadminError) {
    console.error("Failed to list superadmins:", superadminError);
    return new Response(JSON.stringify({ error: "Failed to list recipients" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recipients: string[] = [];
  for (const row of superadmins ?? []) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(row.id);
    if (data.user?.email) recipients.push(data.user.email);
  }

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resendApiKey = await readCredential(
    "resend_api_key",
    Deno.env.get("RESEND_API_KEY") ?? "",
  );
  const fromEmailRaw = await readCredential(
    "resend_from_email",
    Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk",
  );

  if (!resendApiKey) {
    console.error("RESEND_API_KEY missing; security alert not emailed");
    return new Response(JSON.stringify({ error: "Email not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fromEmail = fromEmailRaw.includes("<")
    ? fromEmailRaw
    : `Urban Hub Portal <${fromEmailRaw}>`;

  const html = `
    <p><strong>${title}</strong></p>
    <p>This matches the pattern used against the booking portal on 10–11 Sep 2026. The action was blocked where possible. Review the account and sessions now.</p>
    <table>
      <tr><td style="padding:4px 12px 4px 0;color:#555">Account</td><td>${payload.actor_email || payload.actor_id || "unknown"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555">Kind</td><td>${kind}</td></tr>
      ${detailHtml}
    </table>
    <p style="color:#666;font-size:13px">Urban Hub Booking Portal security alert</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
      "Idempotency-Key": `security-alert/${payload.id || crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: recipients,
      subject: `[Security] ${title}`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Resend security alert failed:", res.status, text);
    return new Response(JSON.stringify({ error: "Send failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, sent: recipients.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
