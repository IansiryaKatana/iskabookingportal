export type RecoveryLinkType = "recovery" | "signup";

type GenerateLinkProperties = {
  hashed_token?: string;
  action_link?: string;
};

/**
 * Build a direct portal URL for password recovery / signup confirmation.
 * Prefer hashed_token links so email scanners do not consume one-time verify URLs.
 */
export function buildPortalRecoveryLink(
  portalBaseUrl: string,
  resetPath: string,
  properties: GenerateLinkProperties,
  linkType: RecoveryLinkType = "recovery",
): string {
  const portalUrl = portalBaseUrl.replace(/\/$/, "");
  const path = resetPath.startsWith("/") ? resetPath : `/${resetPath}`;

  const hashedToken = properties.hashed_token?.trim();
  if (hashedToken) {
    const params = new URLSearchParams({
      token_hash: hashedToken,
      type: linkType,
    });
    return `${portalUrl}${path}?${params.toString()}`;
  }

  const actionLink = properties.action_link?.trim();
  if (actionLink) {
    console.warn(
      "generateLink returned action_link without hashed_token; falling back to action_link",
    );
    return actionLink;
  }

  throw new Error("generateLink did not return hashed_token or action_link");
}

export function resolvePortalUrl(fallback = "https://portal.urbanhub.uk"): string {
  return (Deno.env.get("PORTAL_URL") ?? fallback).replace(/\/$/, "");
}
