import { SupabaseClient } from "@supabase/supabase-js";

export type RecoveryLinkType =
  | "token_hash"
  | "code"
  | "access_token"
  | "existing_session"
  | "none";

export type EstablishRecoverySessionResult = {
  ok: boolean;
  linkType: RecoveryLinkType;
  error?: string;
};

type EstablishRecoverySessionOptions = {
  /** When false, signup type links are rejected (admin/partner flows). Default true. */
  allowSignup?: boolean;
};

const MISSING_TOKEN_MESSAGE =
  "Invalid or missing token. Please request a new link.";
const EXPIRED_TOKEN_MESSAGE =
  "Invalid or expired token. Please request a new link.";

function parseHashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

function hasRecoveryParams(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
): boolean {
  return Boolean(
    searchParams.get("token_hash") ||
      hashParams.get("token_hash") ||
      searchParams.get("code") ||
      hashParams.get("code") ||
      searchParams.get("access_token") ||
      hashParams.get("access_token"),
  );
}

/** Remove sensitive tokens from the address bar after a session is established. */
export function clearRecoveryParamsFromUrl(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const sensitiveParams = [
    "token_hash",
    "type",
    "code",
    "access_token",
    "refresh_token",
    "error",
    "error_description",
  ];

  let changed = false;
  for (const key of sensitiveParams) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (url.hash) {
    const hashParams = parseHashParams(url.hash);
    const hashHadTokens = sensitiveParams.some((key) => hashParams.has(key));
    if (hashHadTokens) {
      url.hash = "";
      changed = true;
    }
  }

  if (changed) {
    window.history.replaceState(window.history.state, "", url.toString());
  }
}

function mapAuthError(message: string, linkType: RecoveryLinkType): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("used") ||
    normalized.includes("not found")
  ) {
    return EXPIRED_TOKEN_MESSAGE;
  }

  if (linkType === "none") {
    return MISSING_TOKEN_MESSAGE;
  }

  return EXPIRED_TOKEN_MESSAGE;
}

/**
 * Establishes a Supabase auth session from password-recovery / invite links.
 * Supports token_hash, PKCE code, hash/query tokens, or an existing session.
 */
export async function establishRecoverySession(
  supabase: SupabaseClient,
  options: EstablishRecoverySessionOptions = {},
): Promise<EstablishRecoverySessionResult> {
  const { allowSignup = true } = options;

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = parseHashParams(window.location.hash);

  const tokenHash =
    searchParams.get("token_hash") ?? hashParams.get("token_hash");
  const type = searchParams.get("type") ?? hashParams.get("type");
  const code = searchParams.get("code") ?? hashParams.get("code");
  const accessToken =
    searchParams.get("access_token") ?? hashParams.get("access_token");
  const refreshToken =
    searchParams.get("refresh_token") ?? hashParams.get("refresh_token");

  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  if (existingSession) {
    clearRecoveryParamsFromUrl();
    return { ok: true, linkType: "existing_session" };
  }

  if (tokenHash && type) {
    if (type === "signup" && !allowSignup) {
      return {
        ok: false,
        linkType: "none",
        error: EXPIRED_TOKEN_MESSAGE,
      };
    }

    if (type !== "recovery" && type !== "signup") {
      return {
        ok: false,
        linkType: "none",
        error: EXPIRED_TOKEN_MESSAGE,
      };
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "recovery" | "signup",
    });

    if (error) {
      return {
        ok: false,
        linkType: "token_hash",
        error: mapAuthError(error.message, "token_hash"),
      };
    }

    clearRecoveryParamsFromUrl();
    return { ok: true, linkType: "token_hash" };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return {
        ok: false,
        linkType: "code",
        error: mapAuthError(error.message, "code"),
      };
    }

    clearRecoveryParamsFromUrl();
    return { ok: true, linkType: "code" };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return {
        ok: false,
        linkType: "access_token",
        error: mapAuthError(error.message, "access_token"),
      };
    }

    clearRecoveryParamsFromUrl();
    return { ok: true, linkType: "access_token" };
  }

  if (!hasRecoveryParams(searchParams, hashParams)) {
    return {
      ok: false,
      linkType: "none",
      error: MISSING_TOKEN_MESSAGE,
    };
  }

  return {
    ok: false,
    linkType: "none",
    error: EXPIRED_TOKEN_MESSAGE,
  };
}
