import type { User } from "@supabase/supabase-js";

/** True when staff set a temporary password and student must choose a new one. */
export function userMustChangePassword(user: User | null | undefined): boolean {
  if (!user) return false;
  const flag = user.app_metadata?.must_change_password;
  return flag === true || flag === "true";
}
