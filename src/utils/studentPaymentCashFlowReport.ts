import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  StudentPaymentCashFlowApplication,
  StudentPaymentCashFlowMonthly,
} from "@/hooks/useAccountingReports";

export type CashFlowViewMode = "scheduled" | "outstanding" | "collected";

export type MonthColumn = {
  monthKey: string;
  monthLabel: string;
  monthStart: string;
};

export type CashFlowMonthCell = {
  monthKey: string;
  displayAmount: number;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  amountCollected: number;
  status: StudentPaymentCashFlowMonthly["month_status"];
};

export type CashFlowReportRow = StudentPaymentCashFlowApplication & {
  months: Record<string, CashFlowMonthCell>;
};

const formatCurrencyValue = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

export const buildMonthColumns = (
  academicYearStart: string,
  academicYearEnd: string
): MonthColumn[] => {
  const start = startOfMonth(parseISO(academicYearStart));
  const end = startOfMonth(parseISO(academicYearEnd));
  const columns: MonthColumn[] = [];
  let cursor = start;

  while (cursor <= end) {
    const monthStart = format(cursor, "yyyy-MM-dd");
    columns.push({
      monthKey: format(cursor, "yyyy-MM"),
      monthLabel: format(cursor, "MMM").toUpperCase(),
      monthStart,
    });
    cursor = addMonths(cursor, 1);
  }

  return columns;
};

export const getCellDisplayAmount = (
  cell: CashFlowMonthCell | undefined,
  viewMode: CashFlowViewMode
): number => {
  if (!cell) return 0;
  switch (viewMode) {
    case "scheduled":
      return cell.amountDue;
    case "outstanding":
      return cell.amountRemaining;
    case "collected":
      return cell.amountCollected;
    default:
      return 0;
  }
};

export const buildCashFlowRows = (
  applications: StudentPaymentCashFlowApplication[],
  monthlyData: StudentPaymentCashFlowMonthly[],
  monthColumns: MonthColumn[]
): CashFlowReportRow[] => {
  const monthlyByApp = new Map<string, StudentPaymentCashFlowMonthly[]>();
  monthlyData.forEach((row) => {
    const list = monthlyByApp.get(row.application_id) ?? [];
    list.push(row);
    monthlyByApp.set(row.application_id, list);
  });

  return applications.map((app) => {
    const appMonths = monthlyByApp.get(app.application_id) ?? [];
    const months: Record<string, CashFlowMonthCell> = {};

    monthColumns.forEach((col) => {
      const match = appMonths.find((m) => m.month_key === col.monthKey);
      months[col.monthKey] = {
        monthKey: col.monthKey,
        displayAmount: 0,
        amountDue: Number(match?.amount_due ?? 0),
        amountPaid: Number(match?.amount_paid_on_due ?? 0),
        amountRemaining: Number(match?.amount_remaining ?? 0),
        amountCollected: Number(match?.amount_collected ?? 0),
        status: match?.month_status ?? "empty",
      };
    });

    return { ...app, months };
  });
};

export const formatContractType = (contractType: string) => {
  switch (contractType) {
    case "extension":
      return "Extension";
    case "custom":
      return "Custom";
    default:
      return "Standard";
  }
};

export const formatDepositStatus = (status: string) => {
  switch (status) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "unpaid":
      return "Unpaid";
    default:
      return "N/A";
  }
};

export const getMonthCellClassName = (cell: CashFlowMonthCell | undefined, viewMode: CashFlowViewMode) => {
  if (!cell) return "";
  const amount = getCellDisplayAmount(cell, viewMode);
  if (amount <= 0 && viewMode !== "scheduled") return "text-muted-foreground";

  if (viewMode === "collected") {
    return amount > 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "";
  }

  switch (cell.status) {
    case "paid":
    case "collected_only":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
    case "partially_paid":
      return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-200";
    case "overdue":
      return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200";
    case "upcoming":
      return amount > 0 ? "bg-slate-50 text-slate-800 dark:bg-slate-900/40 dark:text-slate-200" : "";
    default:
      return "";
  }
};

export const formatMonthCellText = (
  cell: CashFlowMonthCell | undefined,
  viewMode: CashFlowViewMode,
  formatCurrency: (n: number) => string
) => {
  if (!cell) return "—";
  const amount = getCellDisplayAmount(cell, viewMode);
  if (amount <= 0 && cell.status === "empty") return "—";
  if (amount <= 0) return "—";

  if (viewMode === "scheduled" && cell.status === "partially_paid" && cell.amountRemaining > 0) {
    return `${formatCurrency(amount)}\n${formatCurrency(cell.amountRemaining)} left`;
  }

  return formatCurrency(amount);
};

export const exportCashFlowToCSV = (
  rows: CashFlowReportRow[],
  monthColumns: MonthColumn[],
  viewMode: CashFlowViewMode,
  academicYearName: string
) => {
  const viewLabel =
    viewMode === "scheduled" ? "Scheduled" : viewMode === "outstanding" ? "Outstanding" : "Collected";

  const headers = [
    "Student Name",
    "Studio",
    "Contract",
    "Contract Start",
    "Contract End",
    "Payment Plan",
    "Deposit Status",
    "Total Installments Due",
    "Application ID",
    ...monthColumns.map((m) => `${m.monthLabel} (${viewLabel})`),
  ];

  const csvRows = rows.map((row) => [
    row.student_name,
    row.studio_number ?? "",
    row.contract_name,
    row.contract_start ?? "",
    row.contract_end ?? "",
    row.payment_plan ?? "",
    formatDepositStatus(row.deposit_status),
    row.total_installments_due.toFixed(2),
    row.application_id,
    ...monthColumns.map((col) => {
      const cell = row.months[col.monthKey];
      const amount = getCellDisplayAmount(cell, viewMode);
      return amount > 0 ? amount.toFixed(2) : "";
    }),
  ]);

  const csvContent = [
    `"Academic Year","${academicYearName.replace(/"/g, '""')}"`,
    `"View Mode","${viewLabel}"`,
    "",
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
    ...csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `student_payment_cash_flow_${academicYearName.replace(/\s+/g, "_")}_${viewMode}_${format(new Date(), "yyyy-MM-dd")}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportCashFlowToPDF = (
  rows: CashFlowReportRow[],
  monthColumns: MonthColumn[],
  viewMode: CashFlowViewMode,
  academicYearName: string
) => {
  const viewLabel =
    viewMode === "scheduled" ? "Scheduled" : viewMode === "outstanding" ? "Outstanding" : "Collected";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text("Student Payment Cash Flow", 14, 14);
  doc.setFontSize(9);
  doc.text(`Academic Year: ${academicYearName}`, 14, 20);
  doc.text(`View: ${viewLabel}`, 14, 25);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 30);

  const head = [
    [
      "Student",
      "Studio",
      "Contract",
      "Dep. Status",
      "Total",
      ...monthColumns.map((m) => m.monthLabel),
    ],
  ];

  const body = rows.map((row) => [
    row.student_name,
    row.studio_number ?? "—",
    row.contract_name,
    formatDepositStatus(row.deposit_status),
    formatCurrencyValue(row.total_installments_due),
    ...monthColumns.map((col) => {
      const cell = row.months[col.monthKey];
      const amount = getCellDisplayAmount(cell, viewMode);
      return amount > 0 ? formatCurrencyValue(amount) : "";
    }),
  ]);

  autoTable(doc, {
    startY: 36,
    head,
    body,
    styles: { fontSize: 6, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [66, 139, 202], fontSize: 6 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 12 },
      2: { cellWidth: 22 },
      3: { cellWidth: 14 },
    },
    margin: { left: 8, right: 8 },
  });

  doc.save(
    `student_payment_cash_flow_${academicYearName.replace(/\s+/g, "_")}_${viewMode}_${format(new Date(), "yyyy-MM-dd")}.pdf`
  );
};
