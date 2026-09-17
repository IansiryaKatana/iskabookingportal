/**
 * Extract a meaningful error message from a Supabase Edge Function invocation error.
 *
 * `supabase-js` surfaces `FunctionsHttpError.message` as the generic
 * "Edge Function returned a non-2xx status code" for ANY non-2xx response, and
 * sets `data` to `null`. The actual, human-readable reason lives in the JSON
 * body of the response, which is attached to the error as `context` (a `Response`).
 *
 * This helper reads that body so callers can display the real reason (e.g.
 * "This email is already used by a staff or admin account" or
 * "Forbidden: Authenticator app (MFA) is required") instead of the opaque
 * generic message.
 */
export type EdgeFunctionError = {
  /** Best available human-readable message. */
  message: string;
  /** HTTP status code of the response, when available. */
  status: number | null;
  /** Parsed JSON body, when the response was JSON. */
  body: Record<string, unknown> | null;
};

export async function extractEdgeFunctionError(
  error: unknown,
): Promise<EdgeFunctionError> {
  const fallbackMessage =
    (error as { message?: string } | null)?.message ?? "";
  const context = (error as { context?: unknown } | null)?.context;

  if (context instanceof Response) {
    const status = context.status ?? null;
    // Clone so we never consume a body the SDK might read elsewhere.
    try {
      const parsed = (await context.clone().json()) as Record<string, unknown>;
      const bodyMessage =
        (typeof parsed?.error === "string" && parsed.error) ||
        (typeof parsed?.message === "string" && parsed.message) ||
        "";
      return { message: bodyMessage || fallbackMessage, status, body: parsed ?? null };
    } catch {
      try {
        const text = await context.clone().text();
        return { message: text.trim() || fallbackMessage, status, body: null };
      } catch {
        return { message: fallbackMessage, status, body: null };
      }
    }
  }

  return { message: fallbackMessage, status: null, body: null };
}
