import { describe, it, expect, vi } from "vitest";
import {
  clearRecoveryParamsFromUrl,
  establishRecoverySession,
} from "@/utils/recoverySession";

describe("establishRecoverySession", () => {
  it("returns missing-token message when no recovery params are present", async () => {
    window.history.replaceState({}, "", "/portal/reset-password");

    const supabase = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        verifyOtp: async () => ({ data: {}, error: null }),
        exchangeCodeForSession: async () => ({ data: {}, error: null }),
        setSession: async () => ({ data: {}, error: null }),
      },
    } as any;

    const result = await establishRecoverySession(supabase);

    expect(result.ok).toBe(false);
    expect(result.linkType).toBe("none");
    expect(result.error).toContain("missing token");
  });

  it("verifies token_hash recovery links", async () => {
    window.history.replaceState(
      {},
      "",
      "/portal/reset-password?token_hash=abc123&type=recovery",
    );

    const verifyOtp = vi.fn(async () => ({ data: {}, error: null }));
    const supabase = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        verifyOtp,
        exchangeCodeForSession: async () => ({ data: {}, error: null }),
        setSession: async () => ({ data: {}, error: null }),
      },
    } as any;

    const result = await establishRecoverySession(supabase);

    expect(result.ok).toBe(true);
    expect(result.linkType).toBe("token_hash");
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "abc123",
      type: "recovery",
    });
  });

  it("exchanges PKCE code links", async () => {
    window.history.replaceState(
      {},
      "",
      "/portal/reset-password?code=pkce-code",
    );

    const exchangeCodeForSession = vi.fn(async () => ({ data: {}, error: null }));
    const supabase = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        verifyOtp: async () => ({ data: {}, error: null }),
        exchangeCodeForSession,
        setSession: async () => ({ data: {}, error: null }),
      },
    } as any;

    const result = await establishRecoverySession(supabase);

    expect(result.ok).toBe(true);
    expect(result.linkType).toBe("code");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });
});

describe("clearRecoveryParamsFromUrl", () => {
  it("strips sensitive query params from the URL", () => {
    window.history.replaceState(
      {},
      "",
      "/portal/reset-password?token_hash=abc&type=recovery",
    );

    clearRecoveryParamsFromUrl();

    expect(window.location.pathname).toBe("/portal/reset-password");
    expect(window.location.search).toBe("");
  });
});
