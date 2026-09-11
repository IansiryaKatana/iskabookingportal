import { supabase } from "@/integrations/supabase/client";

export const MFA_SETUP_PATH = "/admin/mfa-setup";
export const MFA_CHALLENGE_PATH = "/admin/mfa-challenge";

/** Login / reset / MFA screens must stay reachable at aal1. */
export const STAFF_MFA_EXEMPT_PATHS = new Set([
  "/admin/login",
  "/admin/request-password-reset",
  "/admin/reset-password",
  MFA_SETUP_PATH,
  MFA_CHALLENGE_PATH,
]);

const STAFF_PORTAL_ROLES = new Set([
  "staff",
  "superadmin",
  "admin",
  "operations_manager",
  "reservationist",
  "accountant",
  "front_desk",
  "maintenance_officer",
  "housekeeper",
]);

export function isStaffPortalRole(role: string | null | undefined): boolean {
  return !!role && STAFF_PORTAL_ROLES.has(role);
}

/**
 * Where a signed-in staff user should go next for MFA.
 * Returns null when the session is already aal2.
 */
export async function getStaffMfaRedirect(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return MFA_SETUP_PATH;
  if (data.currentLevel === "aal2") return null;
  if (data.nextLevel === "aal2") return MFA_CHALLENGE_PATH;
  return MFA_SETUP_PATH;
}

export async function unenrollUnverifiedTotpFactors(): Promise<void> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return;
  const unverified = (data.all ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status !== "verified",
  );
  await Promise.all(
    unverified.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })),
  );
}
