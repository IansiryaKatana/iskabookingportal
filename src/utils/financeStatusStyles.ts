import { cn } from "@/lib/utils";

const GREEN =
  "border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:text-white";
const RED =
  "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive";
const AMBER =
  "border-transparent bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-600 dark:text-white";
const BLUE =
  "border-transparent bg-blue-600 text-white hover:bg-blue-600 dark:bg-blue-600 dark:text-white";
const SLATE =
  "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200";
const MUTED =
  "border-transparent bg-muted text-muted-foreground hover:bg-muted";
const PURPLE =
  "border-transparent bg-violet-600 text-white hover:bg-violet-600 dark:bg-violet-600 dark:text-white";

/** Semantic badge colours for payment / instalment status across finance modules. */
const FINANCE_STATUS_BADGE: Record<string, string> = {
  // Paid / received
  paid: GREEN,
  fully_paid: GREEN,
  succeeded: GREEN,
  completed: GREEN,

  // Unpaid / failed / overdue
  unpaid: RED,
  failed: RED,
  overdue: RED,
  not_paid: RED,
  rejected: RED,

  // Partial / in progress
  partially_paid: AMBER,
  partial: AMBER,
  pending: AMBER,
  processing: AMBER,
  due: AMBER,
  due_today: AMBER,

  // OTA / finance edge cases
  overpaid: BLUE,
  approved: BLUE,
  refunded: PURPLE,
  refund: PURPLE,

  // Neutral / N/A
  void: MUTED,
  no_amount_due: SLATE,
  upcoming: SLATE,
  n_a: MUTED,
  cancelled: MUTED,
  canceled: MUTED,
};

export const normalizeFinanceStatusKey = (status: string | null | undefined): string => {
  if (!status) return "upcoming";
  const key = status.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (key === "n/a" || key === "na") return "n_a";
  return key;
};

export const getFinanceStatusBadgeClass = (status: string | null | undefined): string => {
  const key = normalizeFinanceStatusKey(status);
  return FINANCE_STATUS_BADGE[key] ?? SLATE;
};

export const formatFinanceStatusLabel = (status: string | null | undefined): string => {
  if (!status) return "—";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const financeStatusBadgeProps = (
  status: string | null | undefined,
  className?: string
) => ({
  variant: "outline" as const,
  className: cn("capitalize", getFinanceStatusBadgeClass(status), className),
});

const PAYMENT_METHOD_BADGE: Record<string, string> = {
  stripe:
    "border-transparent bg-indigo-600 text-white hover:bg-indigo-600 dark:bg-indigo-600 dark:text-white",
  manual_entry:
    "border-transparent bg-slate-600 text-white hover:bg-slate-600 dark:bg-slate-500 dark:text-white",
};

export const getPaymentMethodBadgeClass = (method: string | null | undefined): string => {
  if (!method) return PAYMENT_METHOD_BADGE.manual_entry;
  const key = method.toLowerCase().replace(/\s+/g, "_");
  if (key === "stripe") return PAYMENT_METHOD_BADGE.stripe;
  if (key === "manual_entry" || key === "manual") return PAYMENT_METHOD_BADGE.manual_entry;
  return PAYMENT_METHOD_BADGE.manual_entry;
};

export const paymentMethodBadgeProps = (method: string | null | undefined, className?: string) => ({
  variant: "outline" as const,
  className: cn(
    "text-[10px] font-semibold whitespace-nowrap px-2 py-0.5 leading-tight",
    getPaymentMethodBadgeClass(method),
    className
  ),
});
