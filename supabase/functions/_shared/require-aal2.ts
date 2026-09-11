/**
 * Read `aal` from a user JWT that was already validated with auth.getUser.
 * Password-only sessions are aal1; TOTP-verified sessions are aal2.
 */
export function tokenHasAal2(token: string): boolean {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return false;
    const padded =
      payloadPart.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { aal?: string };
    return payload.aal === "aal2";
  } catch {
    return false;
  }
}

export function aal2ForbiddenResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "Forbidden: Authenticator app (MFA) is required",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
