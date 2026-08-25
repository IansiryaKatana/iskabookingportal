import jsPDF from "jspdf";
import { format, parseISO } from "date-fns";
import type { OTAPayment } from "@/hooks/useOTAPayments";
import {
  OTA_CHANNEL_LABELS,
  OTA_PAYMENT_TYPE_LABELS,
  OTA_RECEIVED_FROM_LABELS,
  buildOTAReceiptNumber,
} from "@/utils/otaPayment";

export type OTAReceiptBranding = {
  companyName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress1?: string;
  contactAddress2?: string;
  contactAddress3?: string;
  vatNumber?: string;
  companyNumber?: string;
};

export type OTAReceiptGuestContext = {
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  bookingRef: string;
  channel: string;
  checkIn: string;
  checkOut: string;
  studioNumber?: string | null;
  numberOfNights?: number | null;
};

const formatStayDate = (value: string) => {
  try {
    return format(parseISO(value.slice(0, 10)), "dd MMM yyyy");
  } catch {
    return value;
  }
};

export const generateOTAReceiptPDF = async (data: {
  payment: OTAPayment;
  guest: OTAReceiptGuestContext;
  branding?: OTAReceiptBranding;
}): Promise<void> => {
  const { payment, guest, branding } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  const isRefund = payment.payment_type === "refund";
  const docTitle = isRefund ? "REFUND RECEIPT" : "RECEIPT";
  const receiptNumber = buildOTAReceiptNumber(payment.id, payment.payment_date);

  const companyName = branding?.companyName || "Urban Hub";
  const contactPhone = branding?.contactPhone || "+44 123 456 7890";
  const contactEmail = branding?.contactEmail || "Accounts@unitylivin.com";
  const contactAddress1 = branding?.contactAddress1 || "123 Student Street";
  const contactAddress2 = branding?.contactAddress2 || "City Centre";
  const contactAddress3 = branding?.contactAddress3 || "Preston, PR1 1AA";
  const vatNumber = branding?.vatNumber || "";
  const companyNumber = branding?.companyNumber || "";

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: payment.currency || "GBP",
      minimumFractionDigits: 2,
    }).format(amount);

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38);
  doc.text(docTitle, pageWidth - margin, yPos, { align: "right" });
  yPos += 10;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text(`Receipt/Ref: ${receiptNumber}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 5;
  doc.text(`Date: ${formatStayDate(payment.payment_date)}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 15;

  const lineHeight = 5;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("From:", margin, yPos);
  yPos += 7;
  doc.setFontSize(14);
  doc.text(companyName.toUpperCase(), margin, yPos);
  yPos += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const fromLines: string[] = [contactAddress1];
  if (contactAddress2) fromLines.push(contactAddress2);
  if (contactAddress3) fromLines.push(contactAddress3);
  fromLines.push(`Phone: ${contactPhone}`, `Email: ${contactEmail}`);
  if (vatNumber) fromLines.push(`VAT Number: ${vatNumber}`);
  if (companyNumber) fromLines.push(`Company Number: ${companyNumber}`);
  for (const line of fromLines) {
    const wrapped = doc.splitTextToSize(line, contentWidth);
    doc.text(wrapped, margin, yPos);
    yPos += wrapped.length * lineHeight;
  }
  yPos += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Received from:", margin, yPos);
  yPos += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const billToLines = [
    guest.guestName,
    guest.guestEmail,
    guest.guestPhone ? `Phone: ${guest.guestPhone}` : null,
    `Booking: ${guest.bookingRef}`,
    `Channel: ${OTA_CHANNEL_LABELS[guest.channel] ?? guest.channel}`,
  ].filter(Boolean) as string[];
  for (const line of billToLines) {
    const wrapped = doc.splitTextToSize(line, contentWidth);
    doc.text(wrapped, margin, yPos);
    yPos += wrapped.length * lineHeight;
  }
  yPos += 12;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Stay", margin, yPos);
  yPos += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const stayBits = [
    `${formatStayDate(guest.checkIn)} – ${formatStayDate(guest.checkOut)}`,
    guest.numberOfNights ? `${guest.numberOfNights} night${guest.numberOfNights === 1 ? "" : "s"}` : null,
    guest.studioNumber ? `Studio ${guest.studioNumber}` : null,
  ].filter(Boolean);
  doc.text(stayBits.join(" · "), margin, yPos);
  yPos += 14;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Payment details", margin, yPos);
  yPos += 10;

  doc.setFillColor(220, 38, 38);
  doc.rect(margin, yPos - 5, contentWidth, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Description", margin + 5, yPos);
  doc.text("Amount", pageWidth - margin - 5, yPos, { align: "right" });
  yPos += 8;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  const rowHeight = 22;
  doc.rect(margin, yPos - 5, contentWidth, rowHeight, "S");

  const typeLabel = OTA_PAYMENT_TYPE_LABELS[payment.payment_type] ?? "Payment";
  const channelLabel = OTA_CHANNEL_LABELS[guest.channel] ?? guest.channel;
  doc.text(`${typeLabel} — ${channelLabel} ${guest.bookingRef}`, margin + 5, yPos);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Reference: ${payment.reference_number}`,
    margin + 5,
    yPos + 5,
    { maxWidth: contentWidth - 60 },
  );
  if (payment.notes) {
    doc.text(payment.notes, margin + 5, yPos + 10, { maxWidth: contentWidth - 60 });
  }

  const signedAmount = isRefund ? -Number(payment.amount) : Number(payment.amount);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(formatCurrency(signedAmount), pageWidth - margin - 5, yPos, { align: "right" });
  yPos += rowHeight + 5;

  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPos - 5, contentWidth, 10, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", margin + 5, yPos + 3);
  doc.text(formatCurrency(signedAmount), pageWidth - margin - 5, yPos + 3, { align: "right" });
  yPos += 16;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Received via:", margin, yPos);
  yPos += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(OTA_RECEIVED_FROM_LABELS[payment.received_from] ?? payment.received_from, margin, yPos);
  yPos += 15;

  if (yPos > pageHeight - 40) {
    doc.addPage();
    yPos = margin;
  }
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Thank you for your payment.", pageWidth / 2, yPos, { align: "center" });
  yPos += 5;
  doc.text(
    `If you have any questions about this receipt, please contact us at ${contactEmail} or ${contactPhone}`,
    pageWidth / 2,
    yPos,
    { align: "center", maxWidth: contentWidth },
  );

  const fileName = `receipt-${receiptNumber}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
};

export const brandingFromSettings = (
  branding?: Record<string, string>,
): OTAReceiptBranding => ({
  companyName: branding?.company_name,
  contactPhone: branding?.contact_phone,
  contactEmail: branding?.contact_email,
  contactAddress1: branding?.contact_address_line1,
  contactAddress2: branding?.contact_address_line2,
  contactAddress3: branding?.contact_address_line3,
  vatNumber: branding?.vat_number,
  companyNumber: branding?.company_number,
});
