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
