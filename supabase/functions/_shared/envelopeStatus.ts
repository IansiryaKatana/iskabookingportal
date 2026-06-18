/** Shared envelope status helpers for edge functions (keep in sync with src/utils/envelopeStatus.ts). */

export function isEnvelopeSuperseded(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "superseded";
}

export function isEnvelopeCompleted(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "completed";
}

export function getActiveEnvelopes<T extends { status?: string | null }>(
  envelopes: T[] | null | undefined,
): T[] {
  return (envelopes ?? []).filter((e) => !isEnvelopeSuperseded(e.status));
}

export function areAllActiveEnvelopesCompleted(
  envelopes: { status?: string | null }[] | null | undefined,
): boolean {
  const active = getActiveEnvelopes(envelopes);
  if (active.length === 0) return false;
  return active.every((e) => isEnvelopeCompleted(e.status));
}
