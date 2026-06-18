import { addDays, differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Helpers for contract duration when contracts can have full weeks + optional extra days (0–6).
 * Total days = weeks * 7 + extra_days. Contract value = weekly_price * getEffectiveWeeks(contract).
 *
 * Canonical for custom / per-application contracts (CreateCustomContractSheet, amend booking, extensions).
 * Do not use Math.round(days/7) here — that path is for template contracts in admin Contracts only.
 */

export type ContractDurationLike = {
  weeks: number;
  extra_days?: number | null;
};

/** Clamp extra days to the DB constraint (0–6). */
export function clampExtraDays(extraDays: number | null | undefined): number {
  return Math.min(6, Math.max(0, Math.floor(Number(extraDays) || 0)));
}

/**
 * Contract end date from start + weeks + extra days (same rule as CreateCustomContractSheet).
 */
export function computeContractEndDate(
  startDate: string,
  weeks: number,
  extraDays: number = 0,
): string {
  if (!startDate || weeks < 1) return "";
  const start = parseISO(startDate);
  if (Number.isNaN(start.getTime())) return "";
  const totalDays = weeks * 7 + clampExtraDays(extraDays);
  return addDays(start, totalDays).toISOString().slice(0, 10);
}

/**
 * Inverse: calendar start/end → weeks + extra_days (floor/mod, matches extension UI).
 */
export function datesToWeeksAndExtraDays(
  startDate: string,
  endDate: string,
): { weeks: number; extraDays: number } {
  if (!startDate || !endDate) {
    return { weeks: 1, extraDays: 0 };
  }
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { weeks: 1, extraDays: 0 };
  }
  const totalDays = differenceInCalendarDays(end, start);
  if (totalDays <= 0) {
    return { weeks: 1, extraDays: 0 };
  }
  if (totalDays < 7) {
    return { weeks: 1, extraDays: 0 };
  }
  return {
    weeks: Math.floor(totalDays / 7),
    extraDays: totalDays % 7,
  };
}

/**
 * Preview contract total using the same formula as calculate_contract_value / getEffectiveWeeks.
 */
export function computeContractTotal(
  weeklyPrice: number,
  weeks: number,
  extraDays: number = 0,
): number {
  const w = Number(weeks) || 0;
  const effective = w + clampExtraDays(extraDays) / 7;
  return (Number(weeklyPrice) || 0) * effective;
}

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
