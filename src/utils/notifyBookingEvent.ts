import { supabase } from "@/integrations/supabase/client";

export type BookingNotificationEvent =
  | "application_created"
  | "studio_reserved"
  | "deposit_paid"
  | "application_submitted"
  | "manual_payment_request_submitted";

export type BookingNotificationMetadata = {
  amount?: string;
  paymentMethod?: string;
  studioNumber?: string;
  notifyStudent?: boolean;
};

/**
 * Fire-and-forget staff/student booking notifications via edge function.
 * Never throws — logs warnings only so CRUD flows are not blocked.
 */
export async function notifyBookingEvent(
  event: BookingNotificationEvent,
  applicationId: string,
  metadata?: BookingNotificationMetadata,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("notify-booking-event", {
      body: { event, applicationId, metadata },
    });
    if (error) {
      console.warn(`notify-booking-event (${event}) failed:`, error);
    }
  } catch (err) {
    console.warn(`notify-booking-event (${event}) error:`, err);
  }
}
