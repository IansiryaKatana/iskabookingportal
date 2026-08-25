import type { Database } from "@/integrations/supabase/types";

type OTABookingRow = Database["public"]["Tables"]["ota_bookings"]["Row"];

export type OTAPaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "fully_paid"
  | "overpaid"
  | "void"
  | "no_amount_due";

export const OTA_PAYMENT_STATUS_LABELS: Record<OTAPaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partial",
  fully_paid: "Paid",
  overpaid: "Overpaid",
  void: "Void",
  no_amount_due: "No amount due",
};

export const getOTAGrossBookingValue = (booking: Pick<OTABookingRow, "price_per_night" | "number_of_nights">): number => {
  const nights = Number(booking.number_of_nights) || 0;
  const rate = Number(booking.price_per_night) || 0;
  return Math.round((rate * nights + Number.EPSILON) * 100) / 100;
};

/** Net amount accounts expect in the bank (matches DB get_ota_amount_due). */
export const getOTAAmountDue = (
  booking: Pick<OTABookingRow, "price_per_night" | "number_of_nights" | "commission_amount" | "total_revenue">,
): number => {
  if (booking.total_revenue != null) {
    return Math.max(0, Number(booking.total_revenue));
  }
  const gross = getOTAGrossBookingValue(booking);
  const commission = Number(booking.commission_amount) || 0;
  return Math.max(0, Math.round((gross - commission + Number.EPSILON) * 100) / 100);
};

export const canRecordOTAPayment = (bookingStatus: string, paymentStatus: OTAPaymentStatus): boolean => {
  if (bookingStatus === "cancelled" || bookingStatus === "no_show") return false;
  if (paymentStatus === "fully_paid" || paymentStatus === "void" || paymentStatus === "no_amount_due") {
    return false;
  }
  return true;
};

export const formatOTACurrency = (amount: number | null | undefined, currency = "GBP"): string => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const OTA_RECEIVED_FROM_OPTIONS = [
  { value: "ota_payout", label: "OTA payout" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "virtual_card", label: "Virtual card" },
  { value: "guest_direct", label: "Guest direct" },
  { value: "other", label: "Other" },
] as const;

export type OTAReceivedFrom = (typeof OTA_RECEIVED_FROM_OPTIONS)[number]["value"];

export const OTA_RECEIVED_FROM_LABELS: Record<string, string> = Object.fromEntries(
  OTA_RECEIVED_FROM_OPTIONS.map((opt) => [opt.value, opt.label]),
);

export const OTA_PAYMENT_TYPE_LABELS: Record<string, string> = {
  payout: "Payment",
  refund: "Refund",
  adjustment: "Adjustment",
};

export const OTA_CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  agoda: "Agoda",
  expedia: "Expedia",
  other: "Other",
};

export const buildOTAReceiptNumber = (paymentId: string, paymentDate: string): string => {
  const day = paymentDate.slice(0, 10).replace(/-/g, "");
  return `RCP-OTA-${paymentId.slice(0, 8).toUpperCase()}-${day}`;
};
