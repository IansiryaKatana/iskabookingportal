import { addDays, format } from "date-fns";

export type PaymentDueWithinDays = 7 | 14 | 30;
export type PaymentDueWindowPreset = "7" | "14" | "30" | "all";
export type PaymentReminderStatus = "upcoming" | "overdue";

export type PaymentDueDateRange = {
  startDate: string;
  endDate: string;
};

/** Same semantics as Accounting Reports → Upcoming "Due within" presets. */
export function getPaymentDueDateRange(
  days: PaymentDueWithinDays,
  from: Date = new Date(),
): PaymentDueDateRange {
  return {
    startDate: format(from, "yyyy-MM-dd"),
    endDate: format(addDays(from, days), "yyyy-MM-dd"),
  };
}

export function resolvePaymentDueWindowPreset(
  window: PaymentDueWindowPreset,
  from: Date = new Date(),
): { startDate: string; endDate: string } | null {
  if (window === "all") return null;
  return getPaymentDueDateRange(parseInt(window, 10) as PaymentDueWithinDays, from);
}

export type PaymentInstallmentRow = {
  student_id: string;
  student_name?: string | null;
  application_id?: string;
  academic_year_id?: string | null;
  studio_grade?: string | null;
  installment_id?: string;
  sequence?: number | null;
  installment_label?: string | null;
  due_date: string;
  amount: number;
  status: string;
  amount_remaining?: number | null;
};

export type PaymentRecipientPreview = {
  student_id: string;
  student_name: string;
  due_date: string;
  amount: number;
  installment_number: string;
  installment_id?: string;
  application_id?: string;
  status: string;
};

export type FilterPaymentInstallmentsOptions = {
  paymentStatus: PaymentReminderStatus;
  dueWithinDays?: PaymentDueWithinDays | null;
  academicYearId?: string | null;
  /** Optional ISO date override; defaults to today when dueWithinDays is set. */
  fromDate?: Date;
};

/**
 * Filter installment rows (from upcoming_and_paid_installments_report) for reminder targeting.
 * Dedupes to one row per student — the soonest matching unpaid installment.
 */
export function filterPaymentInstallmentsForReminders<T extends PaymentInstallmentRow>(
  rows: T[],
  options: FilterPaymentInstallmentsOptions,
): T[] {
  const { paymentStatus, dueWithinDays, academicYearId, fromDate = new Date() } = options;
  const range =
    paymentStatus === "upcoming" && dueWithinDays
      ? getPaymentDueDateRange(dueWithinDays, fromDate)
      : null;

  let list = rows.filter((r) => r.status === paymentStatus);

  if (range) {
    list = list.filter((r) => r.due_date >= range.startDate && r.due_date <= range.endDate);
  }

  if (academicYearId && academicYearId !== "all") {
    list = list.filter((r) => r.academic_year_id === academicYearId);
  }

  // Soonest installment per student
  const byStudent = new Map<string, T>();
  const sorted = [...list].sort((a, b) =>
    a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0,
  );
  for (const row of sorted) {
    if (!row.student_id) continue;
    if (!byStudent.has(row.student_id)) {
      byStudent.set(row.student_id, row);
    }
  }

  return [...byStudent.values()].sort((a, b) =>
    a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0,
  );
}

export function toPaymentRecipientPreviews(
  rows: PaymentInstallmentRow[],
): PaymentRecipientPreview[] {
  return rows.map((r) => ({
    student_id: r.student_id,
    student_name: (r.student_name || "Student").trim() || "Student",
    due_date: r.due_date,
    amount: Number(r.amount_remaining ?? r.amount ?? 0),
    installment_number: String(r.sequence ?? r.installment_label ?? ""),
    installment_id: r.installment_id,
    application_id: r.application_id,
    status: r.status,
  }));
}

export function formatGbpAmount(amount: number): string {
  return `£${Number(amount).toFixed(2)}`;
}

export function formatDueDateForEmail(dueDate: string): string {
  try {
    return format(new Date(dueDate + "T00:00:00"), "d MMM yyyy");
  } catch {
    return dueDate;
  }
}
