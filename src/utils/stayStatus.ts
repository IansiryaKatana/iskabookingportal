export type StayStatus = "awaiting_check_in" | "in_house" | "checked_out";

export const STAY_STATUS_LABELS: Record<StayStatus, string> = {
  awaiting_check_in: "Awaiting Check-in",
  in_house: "In House",
  checked_out: "Checked Out",
};

/** Derive operational stay status from actual check-in/out dates (and checked_out status). */
export function getStayStatus(application: {
  status?: string | null;
  actual_check_in_date?: string | null;
  actual_check_out_date?: string | null;
}): StayStatus | null {
  if (application.actual_check_out_date || application.status === "checked_out") {
    return "checked_out";
  }
  if (application.actual_check_in_date) {
    return "in_house";
  }
  if (application.status === "confirmed") {
    return "awaiting_check_in";
  }
  return null;
}
