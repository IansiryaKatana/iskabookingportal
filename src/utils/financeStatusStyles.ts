import { cn } from "@/lib/utils";

/** Semantic badge colours for payment / instalment status across finance reports. */
const FINANCE_STATUS_BADGE: Record<string, string> = {
  paid: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:text-white",
  fully_paid: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:text-white",
  overdue: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive",
  partially_paid: "border-transparent bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-600 dark:text-white",
  partial: "border-transparent bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-600 dark:text-white",
  unpaid: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive",
  upcoming: "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200",
  n_a: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
};

export const getFinanceStatusBadgeClass = (status: string | null | undefined): string => {
  if (!status) return FINANCE_STATUS_BADGE.upcoming;
  const key = status.toLowerCase().replace(/\s+/g, "_");
  if (key === "n/a" || key === "na") return FINANCE_STATUS_BADGE.n_a;
  return FINANCE_STATUS_BADGE[key] ?? FINANCE_STATUS_BADGE.upcoming;
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
