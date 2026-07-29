export type StayStatus = "awaiting_check_in" | "in_house" | "checked_out";

export const STAY_STATUS_LABELS: Record<StayStatus, string> = {
  awaiting_check_in: "Awaiting Check-in",
  in_house: "In House",
  checked_out: "Checked Out",
};

/** Local calendar date as YYYY-MM-DD for comparing DATE columns. */
export function localDateISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Derive operational stay status from actual check-in/out dates (and checked_out status).
 * A future actual_check_in_date is treated as awaiting — not in-house yet.
 */
export function getStayStatus(application: {
  status?: string | null;
  actual_check_in_date?: string | null;
  actual_check_out_date?: string | null;
}): StayStatus | null {
  if (application.actual_check_out_date || application.status === "checked_out") {
    return "checked_out";
  }

  const checkIn = application.actual_check_in_date?.slice(0, 10) ?? null;
  if (checkIn && checkIn <= localDateISO()) {
    return "in_house";
  }

  if (application.status === "confirmed") {
    return "awaiting_check_in";
  }

  return null;
}
