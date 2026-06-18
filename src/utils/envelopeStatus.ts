/**
 * DocuSign envelope status helpers.
 * "superseded" = outdated after a booking amendment; not treated as signed/complete.
 */

export type EnvelopeLike = {
  envelope_type?: string | null;
  status?: string | null;
  updated_at?: string | null;
  envelope_id?: string | null;
  signed_document_path?: string | null;
};

export function isEnvelopeSuperseded(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "superseded";
}

export function isEnvelopeCompleted(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "completed";
}

export function isEnvelopeActive(status?: string | null): boolean {
  return !isEnvelopeSuperseded(status);
}

export function getActiveEnvelopes<T extends EnvelopeLike>(envelopes: T[] | null | undefined): T[] {
  return (envelopes ?? []).filter((e) => isEnvelopeActive(e.status));
}

export function getActiveEnvelopeForType<T extends EnvelopeLike>(
  envelopes: T[] | null | undefined,
  envelopeType: string,
): T | undefined {
  const typed = (envelopes ?? []).filter((e) => e.envelope_type === envelopeType);
  const active = typed.filter((e) => isEnvelopeActive(e.status));
  const pool = active.length > 0 ? active : typed;
  return pool.sort(
    (a, b) =>
      new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
  )[0];
}

export function hasAnyActiveEnvelopes(envelopes: EnvelopeLike[] | null | undefined): boolean {
  return getActiveEnvelopes(envelopes).length > 0;
}

export function hasCompletedActiveEnvelopes(envelopes: EnvelopeLike[] | null | undefined): boolean {
  return getActiveEnvelopes(envelopes).some((e) => isEnvelopeCompleted(e.status));
}

export function hasSentActiveEnvelopes(envelopes: EnvelopeLike[] | null | undefined): boolean {
  return getActiveEnvelopes(envelopes).some((e) => {
    const s = (e.status ?? "").toLowerCase();
    return s === "sent" || s === "delivered" || s === "created";
  });
}

export function allActiveEnvelopesCompleted(envelopes: EnvelopeLike[] | null | undefined): boolean {
  const active = getActiveEnvelopes(envelopes);
  if (active.length === 0) return false;
  return active.every((e) => isEnvelopeCompleted(e.status));
}

export function canDownloadEnvelope(envelope: EnvelopeLike | null | undefined): boolean {
  if (!envelope) return false;
  const status = (envelope.status ?? "").toLowerCase();
  if (status === "superseded") {
    return Boolean(envelope.signed_document_path || envelope.envelope_id);
  }
  return (
    isEnvelopeCompleted(envelope.status) &&
    Boolean(envelope.envelope_id || envelope.signed_document_path)
  );
}

export function formatEnvelopeStatus(status?: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (!s) return "Unknown";
  if (s === "superseded") return "Superseded";
  return s.replace(/_/g, " ");
}
