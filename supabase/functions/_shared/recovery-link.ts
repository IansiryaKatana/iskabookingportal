import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCredential } from "./get-credential.ts";

export type RecoveryLinkType = "recovery" | "signup";

export const PRODUCTION_PORTAL_URL = "https://portal.urbanhub.uk";

type GenerateLinkProperties = {
  hashed_token?: string;
  action_link?: string;
};

/**
 * Normalize portal base URL — always prefer production; never emit Netlify preview URLs.
 */
export function normalizePortalUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/$/, "");
  if (!trimmed || trimmed.includes("iskabookingportal.netlify.app")) {
    return PRODUCTION_PORTAL_URL;
  }
  return trimmed;
}

/**
 * Resolve the portal base URL for emails and auth redirects.
 * Priority: credentials.portal_url (database) → sanitized PORTAL_URL env → production default.
 */
export async function resolvePortalUrl(
  supabase: SupabaseClient,
  fallback = PRODUCTION_PORTAL_URL,
): Promise<string> {
  const fromDb = await getCredential("portal_url", {
    supabase,
    fallback: "",
  });

  if (fromDb?.trim()) {
    return normalizePortalUrl(fromDb);
  }

  return normalizePortalUrl(Deno.env.get("PORTAL_URL")) || fallback.replace(/\/$/, "");
}

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
  const portalUrl = normalizePortalUrl(portalBaseUrl);
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
