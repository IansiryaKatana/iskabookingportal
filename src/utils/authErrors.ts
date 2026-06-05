/** True when Supabase Auth rejected or could not refresh the session JWT. */
export function isUnauthorizedAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: number; code?: string; message?: string };
  const message = (err.message ?? "").toLowerCase();
  return (
    err.status === 401 ||
    err.code === "PGRST301" ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt") ||
    message.includes("invalid claim") ||
    message.includes("session missing") ||
    message.includes("refresh token")
  );
}
