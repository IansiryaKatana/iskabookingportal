import { format, parseISO } from "date-fns";

const toDate = (value: string | Date): Date =>
  typeof value === "string" ? parseISO(value) : value;

const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const h12 = hours % 12 || 12;
  const meridiem = hours < 12 ? "am" : "pm";
  if (minutes === 0) return `${h12}${meridiem}`;
  return `${h12}:${String(minutes).padStart(2, "0")}${meridiem}`;
};

/** e.g. "9th Apr 2026 at 3:09pm" or "26th May 2026 at 5pm" */
export const formatReservationExpiry = (value: string | Date): string => {
  const date = toDate(value);
  return `${format(date, "do MMM yyyy")} at ${formatTime(date)}`;
};
