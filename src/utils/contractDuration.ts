/**
 * Helpers for contract duration when contracts can have full weeks + optional extra days (0–6).
 * Total days = weeks * 7 + extra_days. Contract value = weekly_price * getEffectiveWeeks(contract).
 */

export type ContractDurationLike = {
  weeks: number;
  extra_days?: number | null;
};

/**
 * Effective weeks for pricing: weeks + (extra_days / 7). Use for total = weeklyPrice * this.
 */
export function getEffectiveWeeks(contract: ContractDurationLike | null | undefined): number {
  if (!contract) return 0;
  const w = Number(contract.weeks) || 0;
  const d = Math.min(6, Math.max(0, Number(contract.extra_days) || 0));
  return w + d / 7;
}

/**
 * Human-readable duration, e.g. "21 weeks" or "21 weeks 3 days".
 */
export function formatContractDuration(contract: ContractDurationLike | null | undefined): string {
  if (!contract) return "—";
  const w = Number(contract.weeks) || 0;
  const d = Math.min(6, Math.max(0, Number(contract.extra_days) || 0));
  if (d > 0) return `${w} weeks ${d} days`;
  return `${w} weeks`;
}
