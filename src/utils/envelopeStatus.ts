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

export type EnvelopeRecipientStatus = {
  roleName?: string;
  name?: string;
  email?: string;
  status?: string;
  routingOrder?: string;
};

function parseMetadataRecipientStatuses(
  metadata: unknown,
): EnvelopeRecipientStatus[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { recipientStatuses?: unknown }).recipientStatuses;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object"
    )
    .map((item) => ({
      roleName: typeof item.roleName === "string" ? item.roleName : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      email: typeof item.email === "string" ? item.email : undefined,
      status: typeof item.status === "string"
        ? item.status.toLowerCase()
        : undefined,
      routingOrder: typeof item.routingOrder === "string"
        ? item.routingOrder
        : undefined,
    }));
}

export function getEnvelopeRecipientStatuses(
  envelope: EnvelopeLike & { metadata?: unknown; recipients?: unknown },
): EnvelopeRecipientStatus[] {
  const fromMetadata = parseMetadataRecipientStatuses(envelope.metadata);
  if (fromMetadata.length > 0) return fromMetadata;

  const raw = envelope.recipients;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object"
    )
    .map((item) => ({
      roleName: typeof item.roleName === "string" ? item.roleName : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      email: typeof item.email === "string" ? item.email : undefined,
      status: typeof item.status === "string"
        ? item.status.toLowerCase()
        : undefined,
      routingOrder: typeof item.routingOrder === "string"
        ? item.routingOrder
        : undefined,
    }));
}

export function isRecipientSigningComplete(status?: string | null): boolean {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "completed" || normalized === "signed";
}

function findRecipientByRole(
  recipients: EnvelopeRecipientStatus[],
  rolePattern: RegExp,
): EnvelopeRecipientStatus | undefined {
  return recipients.find((recipient) =>
    rolePattern.test(recipient.roleName ?? "")
  );
}

export function getEnvelopeProgressLabel(
  envelope: EnvelopeLike & { metadata?: unknown; recipients?: unknown },
): string | null {
  if (isEnvelopeCompleted(envelope.status)) return null;

  const recipients = getEnvelopeRecipientStatuses(envelope);
  if (recipients.length === 0) return null;

  const tenant = findRecipientByRole(recipients, /tenant/i);
  const guarantor = findRecipientByRole(recipients, /guarantor/i);
  const witness = findRecipientByRole(recipients, /witness/i);

  const tenantDone = tenant && isRecipientSigningComplete(tenant.status);
  const guarantorDone = guarantor && isRecipientSigningComplete(guarantor.status);
  const witnessDone = witness && isRecipientSigningComplete(witness.status);

  if (envelope.envelope_type === "tenancy") {
    if (tenantDone && guarantor && !guarantorDone) {
      return "Student signed — guarantor pending";
    }
    if (tenantDone && witness && !witnessDone) {
      return "Student signed — witness pending";
    }
    if (tenantDone) return "Student signed";
  }

  if (envelope.envelope_type === "guarantor") {
    if (guarantorDone) return "Guarantor signed";
    if (tenantDone) return "Tenant signed";
  }

  const completedCount = recipients.filter((recipient) =>
    isRecipientSigningComplete(recipient.status)
  ).length;
  if (completedCount > 0 && completedCount < recipients.length) {
    return `${completedCount} of ${recipients.length} signed`;
  }

  return null;
}

export function getEnvelopeDescription(
  envelope: EnvelopeLike & { metadata?: unknown; recipients?: unknown },
  typeLabel: string,
): string {
  if (isEnvelopeCompleted(envelope.status)) {
    return `Signed ${typeLabel.toLowerCase()} paperwork on file.`;
  }

  const progress = getEnvelopeProgressLabel(envelope);
  if (progress) {
    return `${typeLabel} — ${progress}.`;
  }

  const status = (envelope.status ?? "").toLowerCase();
  if (status === "sent" || status === "delivered" || status === "created") {
    return `${typeLabel} sent — awaiting signature.`;
  }

  return `${typeLabel} status: ${envelope.status ?? "unknown"}.`;
}

export function formatRecipientStatusLabel(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (!normalized) return "Pending";
  if (isRecipientSigningComplete(normalized)) return "Signed";
  if (normalized === "delivered") return "Opened";
  if (normalized === "sent") return "Email sent";
  if (normalized === "created") return "Waiting";
  return normalized.replace(/_/g, " ");
}
