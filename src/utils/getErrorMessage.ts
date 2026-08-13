/** Best-effort human message from Supabase / PostgREST / generic thrown values. */
export function getErrorMessage(error: unknown, fallback = "Please try again."): string {
  if (!error) return fallback;
  if (typeof error === "string" && error.trim()) return error.trim();

  if (typeof error === "object") {
    const err = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      error_description?: unknown;
    };

    const candidates = [err.message, err.details, err.hint, err.error_description]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);

    if (candidates.length > 0) {
      // PostgREST often prefixes Postgres exceptions as "P0001: ..." or embeds ERROR text.
      return candidates[0]
        .replace(/^P0001:\s*/i, "")
        .replace(/^ERROR:\s*/i, "")
        .replace(/\s+CONTEXT:[\s\S]*$/i, "")
        .trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}
