import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const RECEIVED_FROM: { [key: string]: string } = {
  ota_payout: "OTA payout",
  bank_transfer: "Bank transfer",
  virtual_card: "Virtual card",
  guest_direct: "Guest direct",
  other: "Other",
};

const CHANNELS: { [key: string]: string } = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  agoda: "Agoda",
  expedia: "Expedia",
  other: "Other",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b1 << 16) | (b2 << 8) | b3;
    out.push(
      alphabet[(triple >> 18) & 63],
      alphabet[(triple >> 12) & 63],
      i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=",
      i + 2 < bytes.length ? alphabet[triple & 63] : "=",
    );
    i += 3;
  }
  return out.join("");
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency + " " + amount.toFixed(2);
  }
}

function niceDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

async function getCredential(supabase: ReturnType<typeof createClient>, key: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("credentials")
      .select("credential_value, is_encrypted")
      .eq("credential_key", key.toLowerCase())
      .maybeSingle();
    if (data?.is_encrypted) {
      const { data: decrypted } = await supabase.rpc("get_credential_value", {
        p_credential_key: key.toLowerCase(),
      });
      if (decrypted) return decrypted as string;
    }
    if (data?.credential_value && data.credential_value !== "[ENCRYPTED]") {
      return data.credential_value;
    }
  } catch (_err) {
    // fall through to env
  }
  return Deno.env.get(key.toUpperCase()) || fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json(401, { error: "Unauthorized. Authentication required." });

    const { data: authData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !authData.user) return json(401, { error: "Unauthorized. Invalid token." });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!profile || !["staff", "superadmin", "admin"].includes(profile.role)) {
      return json(403, { error: "Forbidden. Staff access required." });
    }

    let body: { paymentId?: string; toEmail?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const paymentId = body.paymentId?.trim();
    const toEmail = body.toEmail?.trim().toLowerCase();
    if (!paymentId) return json(400, { error: "paymentId is required" });
    if (!toEmail || !EMAIL_RE.test(toEmail)) return json(400, { error: "A valid toEmail is required" });

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("ota_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (paymentError || !payment) return json(404, { error: "Payment not found" });

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("ota_bookings")
      .select("external_ref, channel, guest_name, guest_email, check_in, check_out, studio_id, currency")
      .eq("id", payment.ota_booking_id)
      .maybeSingle();
    if (bookingError || !booking) return json(404, { error: "Booking not found" });

    let studioNumber = "";
    if (booking.studio_id) {
      const { data: studio } = await supabaseAdmin
        .from("studios")
        .select("studio_number")
        .eq("id", booking.studio_id)
        .maybeSingle();
      studioNumber = studio?.studio_number ?? "";
    }

    const { data: brandingRows } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_key, setting_value");
    const branding: { [key: string]: string } = {};
    (brandingRows ?? []).forEach((item) => {
      branding[item.setting_key] = item.setting_value || "";
    });
    const companyName = branding.company_name || "Urban Hub";
    const contactEmail = branding.contact_email || "Accounts@unitylivin.com";
    const contactPhone = branding.contact_phone || "";

    const isRefund = payment.payment_type === "refund";
    const signedAmount = isRefund ? -Number(payment.amount) : Number(payment.amount);
    const currency = payment.currency || booking.currency || "GBP";
    const rcp = "RCP-OTA-" + payment.id.slice(0, 8).toUpperCase() + "-" + payment.payment_date.slice(0, 10).replace(/-/g, "");
    const channelLabel = CHANNELS[booking.channel] ?? booking.channel;
    const amountLabel = money(signedAmount, currency);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.1, 0.1, 0.1);
    const muted = rgb(0.4, 0.4, 0.4);
    const accent = rgb(0.9, 0.15, 0.22);
    let y = 780;
    const title = isRefund ? "REFUND RECEIPT" : "RECEIPT";
    page.drawText(title, { x: 50, y, size: 22, font: helveticaBold, color: accent });
    y -= 24;
    page.drawText("Receipt #: " + rcp, { x: 50, y, size: 10, font: helvetica, color: ink });
    y -= 16;
    page.drawText("Date: " + niceDate(payment.payment_date), { x: 50, y, size: 10, font: helvetica, color: ink });
    y -= 28;
    page.drawText(companyName, { x: 50, y, size: 14, font: helveticaBold, color: ink });
    y -= 18;
    page.drawText("Received from: " + booking.guest_name, { x: 50, y, size: 11, font: helvetica, color: ink });
    y -= 16;
    page.drawText("Booking: " + booking.external_ref + " (" + channelLabel + ")", { x: 50, y, size: 11, font: helvetica, color: ink });
    y -= 16;
    page.drawText("Stay: " + niceDate(booking.check_in) + " to " + niceDate(booking.check_out), { x: 50, y, size: 11, font: helvetica, color: ink });
    if (studioNumber) {
      y -= 16;
      page.drawText("Studio " + studioNumber, { x: 50, y, size: 11, font: helvetica, color: ink });
    }
    y -= 28;
    page.drawText((isRefund ? "Refund" : "Payment") + "  " + amountLabel, { x: 50, y, size: 14, font: helveticaBold, color: ink });
    y -= 18;
    page.drawText("Reference: " + payment.reference_number, { x: 50, y, size: 10, font: helvetica, color: muted });
    y -= 16;
    page.drawText("Received via: " + (RECEIVED_FROM[payment.received_from] ?? payment.received_from), {
      x: 50,
      y,
      size: 10,
      font: helvetica,
      color: muted,
    });
    y -= 36;
    page.drawText("Thank you for your payment.", { x: 50, y, size: 10, font: helvetica, color: muted });

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = toBase64(pdfBytes);
    const filename = "receipt-" + rcp + ".pdf";

    const resendApiKey = await getCredential(supabaseAdmin, "RESEND_API_KEY", Deno.env.get("RESEND_API_KEY") ?? "");
    const fromEmailRaw = await getCredential(
      supabaseAdmin,
      "RESEND_FROM_EMAIL",
      Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk",
    );
    if (!resendApiKey) return json(500, { error: "RESEND_API_KEY not configured. Please set it in Settings." });

    const fromEmail = fromEmailRaw || "noreply@send.portal.urbanhub.uk";
    const formattedFrom = fromEmail.indexOf("<") >= 0 ? fromEmail : companyName + " <" + fromEmail + ">";
    const subject = "Payment receipt " + rcp + " — " + companyName;
    const p = (inner: string) => "<p>" + inner + "</p>";
    const html =
      p("Dear " + booking.guest_name + ",") +
      p("Please find attached your " + (isRefund ? "refund receipt" : "payment receipt") + " for booking " + booking.external_ref + ".") +
      p("Amount: " + amountLabel + "<br/>Payment date: " + niceDate(payment.payment_date) + "<br/>Stay: " + niceDate(booking.check_in) + " to " + niceDate(booking.check_out)) +
      p("If you have any questions, contact us at " + contactEmail + (contactPhone ? " or " + contactPhone : "") + ".") +
      p("Best regards,<br/>" + companyName);
    const text =
      "Dear " + booking.guest_name + ",\n\nPlease find attached your payment receipt for booking " +
      booking.external_ref + ".\nAmount: " + amountLabel + "\nPayment date: " + niceDate(payment.payment_date) + "\n";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: formattedFrom,
        to: toEmail,
        subject,
        html,
        text,
        attachments: [{ filename, content: pdfBase64 }],
      }),
    });

    const responseText = await resendResponse.text();
    if (!resendResponse.ok) {
      console.error("Resend failed for OTA receipt:", responseText.slice(0, 500));
      return json(500, { error: "Failed to send email", details: responseText.slice(0, 500) });
    }

    let emailId: string | null = null;
    try {
      const parsed = JSON.parse(responseText);
      emailId = typeof parsed?.id === "string" ? parsed.id : null;
    } catch {
      emailId = null;
    }

    return json(200, { message: "Receipt sent", to: toEmail, receiptNumber: rcp, email_id: emailId });
  } catch (error) {
    console.error("Error in send-ota-payment-receipt:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});
