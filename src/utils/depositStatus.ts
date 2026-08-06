/**
 * Canonical deposit attribution for applications.
 *
 * Source of truth is student_applications.deposit_payment_intent_id
 * (Stripe PI id or "manual-{uuid}"), optionally corroborated by payment rows.
 * Application workflow status must NOT be used as proof of payment.
 */

export const STATUSES_REQUIRING_DEPOSIT = [
  "awaiting_signature",
  "awaiting_verification",
  "confirmed",
] as const;

export type StatusRequiringDeposit = (typeof STATUSES_REQUIRING_DEPOSIT)[number];

export function hasDepositMarker(
  depositPaymentIntentId: string | null | undefined,
): boolean {
  return Boolean(depositPaymentIntentId && String(depositPaymentIntentId).trim());
}

export function isStatusRequiringDeposit(
  status: string | null | undefined,
): status is StatusRequiringDeposit {
  return (
    !!status &&
    (STATUSES_REQUIRING_DEPOSIT as readonly string[]).includes(status)
  );
}

/** True when moving from a pre-deposit (or other) status into a post-deposit status. */
export function isEnteringDepositRequiredStatus(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): boolean {
  return (
    isStatusRequiringDeposit(toStatus) && !isStatusRequiringDeposit(fromStatus)
  );
}

export type DepositRecordEvidence = {
  depositPaymentIntentId?: string | null;
  hasManualDepositRow?: boolean;
  hasStripeDepositRow?: boolean;
};

export function hasRecordedDeposit(evidence: DepositRecordEvidence): boolean {
  return (
    hasDepositMarker(evidence.depositPaymentIntentId) ||
    Boolean(evidence.hasManualDepositRow) ||
    Boolean(evidence.hasStripeDepositRow)
  );
}
