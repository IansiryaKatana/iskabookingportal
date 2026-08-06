/** Payment due-window helpers for edge functions (mirrors src/utils/paymentDueWindow.ts). */

export type PaymentDueWithinDays = 7 | 14 | 30;
export type PaymentReminderStatus = "upcoming" | "overdue";

export type PaymentInstallmentRow = {
  student_id: string;
  student_name?: string | null;
  application_id?: string;
  academic_year_id?: string | null;
  installment_id?: string;
  sequence?: number | null;
  installment_label?: string | null;
  due_date: string;
  amount: number;
  amount_remaining?: number | null;
  status: string;
};

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getPaymentDueDateRange(
  days: PaymentDueWithinDays,
  from: Date = new Date(),
): { startDate: string; endDate: string } {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return {
    startDate: formatYmd(from),
    endDate: formatYmd(end),
  };
}

export function filterPaymentInstallmentsForReminders<T extends PaymentInstallmentRow>(
  rows: T[],
  options: {
    paymentStatus: PaymentReminderStatus;
    dueWithinDays?: PaymentDueWithinDays | null;
    academicYearId?: string | null;
    fromDate?: Date;
  },
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

export function formatGbpAmount(amount: number): string {
  return `£${Number(amount).toFixed(2)}`;
}

export function formatDueDateForEmail(dueDate: string): string {
  try {
    const d = new Date(dueDate + "T00:00:00");
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dueDate;
  }
}

export function computeDaysOverdue(dueDate: string, from: Date = new Date()): string {
  try {
    const due = new Date(dueDate + "T00:00:00");
    const today = new Date(formatYmd(from) + "T00:00:00");
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return String(Math.max(0, diff));
  } catch {
    return "0";
  }
}
