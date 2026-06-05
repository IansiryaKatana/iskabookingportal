import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCredential } from "./get-credential.ts";

export type StaffNotifyRole = "reservationist" | "accountant";

export async function getCompanyName(supabase: SupabaseClient): Promise<string> {
  try {
    const { data } = await supabase
      .from("branding_settings")
      .select("setting_value")
      .eq("setting_key", "company_name")
      .maybeSingle();
    return data?.setting_value || "Urban Hub";
  } catch {
    return "Urban Hub";
  }
}

/**
 * Resolve staff emails for reservationist and/or accountant roles.
 * Supports role stored as top-level profile.role or staff + staff_subrole.
 */
export async function getStaffEmailsByRoles(
  supabase: SupabaseClient,
  roles: StaffNotifyRole[],
): Promise<string[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, role, staff_subrole");

  if (error) {
    console.error("Failed to fetch profiles for staff notifications:", error);
    return await getFallbackStaffEmails(supabase);
  }

  const roleSet = new Set<string>(roles);
  const userIds = (profiles ?? [])
    .filter((p) => {
      const topRole = p.role as string;
      const subRole = p.staff_subrole as string | null;
      if (roleSet.has(topRole)) return true;
      if (topRole === "staff" && subRole && roleSet.has(subRole)) return true;
      return false;
    })
    .map((p) => p.id);

  const emails: string[] = [];
  for (const id of userIds) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(id);
      if (!userError && user?.email) {
        emails.push(user.email);
      }
    } catch (err) {
      console.warn(`Could not resolve email for staff user ${id}:`, err);
    }
  }

  const unique = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];

  if (unique.length === 0) {
    return await getFallbackStaffEmails(supabase);
  }

  return unique;
}

async function getFallbackStaffEmails(supabase: SupabaseClient): Promise<string[]> {
  const fallback = await getCredential("NOTIFICATIONS_STAFF_EMAIL", {
    supabase,
    fallback: Deno.env.get("NOTIFICATIONS_STAFF_EMAIL") ?? "",
  });
  if (fallback?.includes("@")) {
    console.warn("Using NOTIFICATIONS_STAFF_EMAIL fallback — no reservationist/accountant profiles with email");
    return [fallback.trim()];
  }
  return [];
}

export async function sendStaffAlertEmail(
  supabase: SupabaseClient,
  payload: {
    to: string[];
    subject: string;
    html: string;
  },
): Promise<{ sent: boolean; error?: string }> {
  if (!payload.to.length) {
    console.warn("No staff recipients for:", payload.subject);
    return { sent: false, error: "no_recipients" };
  }

  const [resendApiKey, fromEmailRaw, companyName] = await Promise.all([
    getCredential("RESEND_API_KEY", {
      supabase,
      fallback: Deno.env.get("RESEND_API_KEY") ?? "",
    }),
    getCredential("RESEND_FROM_EMAIL", {
      supabase,
      fallback: Deno.env.get("RESEND_FROM_EMAIL") ||
        Deno.env.get("NOTIFICATIONS_FROM_EMAIL") ||
        "noreply@send.portal.urbanhub.uk",
    }),
    getCompanyName(supabase),
  ]);

  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured — staff alert not sent");
    return { sent: false, error: "missing_resend_api_key" };
  }

  const fromEmail = fromEmailRaw.includes("<")
    ? fromEmailRaw
    : `${companyName} <${fromEmailRaw}>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Resend staff alert failed:", response.status, text);
    return { sent: false, error: text };
  }

  console.log(`Staff alert sent to ${payload.to.length} recipient(s): ${payload.subject}`);
  return { sent: true };
}
