import jsPDF from "jspdf";
import type { UnifiedPayment } from "@/hooks/useUnifiedPayments";
import { format } from "date-fns";

type InvoiceData = {
  payment: UnifiedPayment;
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  studentAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    postcode?: string;
  } | null;
  invoiceNumber: string;
  branding?: {
    companyName?: string;
    contactPhone?: string;
    contactEmail?: string;
    contactAddress1?: string;
    contactAddress2?: string;
    contactAddress3?: string;
    vatNumber?: string;
    companyNumber?: string;
  };
};

export const generateInvoicePDF = async (data: InvoiceData): Promise<void> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  const { payment, studentName, studentEmail, studentPhone, studentAddress, invoiceNumber, branding } = data;

  const companyName = branding?.companyName || "Urban Hub";
  const contactPhone = branding?.contactPhone || "+44 123 456 7890";
  const contactEmail = branding?.contactEmail || "info@urbanhub.uk";
  const contactAddress1 = branding?.contactAddress1 || "123 Student Street";
  const contactAddress2 = branding?.contactAddress2 || "City Centre";
  const contactAddress3 = branding?.contactAddress3 || "Preston, PR1 1AA";
  const vatNumber = branding?.vatNumber || "";
  const companyNumber = branding?.companyNumber || "";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: payment.currency || "GBP",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Header
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38); // Primary red color
  doc.text("INVOICE", pageWidth - margin, yPos, { align: "right" });
  yPos += 10;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice Number: ${invoiceNumber}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 5;
  doc.text(`Date: ${format(new Date(payment.payment_date), "dd MMM yyyy")}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 15;

  // Company Info (Left)
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("From:", margin, yPos);
  yPos += 7;
  doc.setFontSize(14);
  doc.text(companyName.toUpperCase(), margin, yPos);
  yPos += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(contactAddress1, margin, yPos);
  yPos += 5;
  if (contactAddress2) {
    doc.text(contactAddress2, margin, yPos);
    yPos += 5;
  }
  if (contactAddress3) {
    doc.text(contactAddress3, margin, yPos);
    yPos += 5;
  }
  doc.text(`Phone: ${contactPhone}`, margin, yPos);
  yPos += 5;
  doc.text(`Email: ${contactEmail}`, margin, yPos);
  yPos += 5;
  if (vatNumber) {
    doc.text(`VAT Number: ${vatNumber}`, margin, yPos);
    yPos += 5;
  }
  if (companyNumber) {
    doc.text(`Company Number: ${companyNumber}`, margin, yPos);
    yPos += 5;
  }

  // Student Info (Right)
  const studentX = pageWidth / 2 + 10;
  yPos = margin + 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", studentX, yPos);
  yPos += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(studentName, studentX, yPos);
  yPos += 5;
  doc.setFontSize(10);
  doc.text(studentEmail, studentX, yPos);
  yPos += 5;
  if (studentPhone) {
    doc.text(`Phone: ${studentPhone}`, studentX, yPos);
    yPos += 5;
  }
  if (studentAddress) {
    if (studentAddress.line1) {
      doc.text(studentAddress.line1, studentX, yPos);
      yPos += 5;
    }
    if (studentAddress.line2) {
      doc.text(studentAddress.line2, studentX, yPos);
      yPos += 5;
    }
    if (studentAddress.city) {
      doc.text(studentAddress.city, studentX, yPos);
      yPos += 5;
    }
    if (studentAddress.postcode) {
      doc.text(studentAddress.postcode, studentX, yPos);
    }
  }

  // Payment Details Table
  yPos = Math.max(yPos, margin + 80) + 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Details", margin, yPos);
  yPos += 10;

  // Table header
  doc.setFillColor(220, 38, 38);
  doc.rect(margin, yPos - 5, contentWidth, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Description", margin + 5, yPos);
  doc.text("Amount", pageWidth - margin - 5, yPos, { align: "right" });
  yPos += 8;

  // Table row
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  const rowHeight = 25;
  doc.rect(margin, yPos - 5, contentWidth, rowHeight, "S");
  
  const description = payment.payment_type === "deposit" 
    ? "Deposit Payment" 
    : `Installment #${payment.installment_number || "N/A"}`;
  
  doc.text(description, margin + 5, yPos);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(payment.contract_name, margin + 5, yPos + 5);
  
  if (payment.due_date) {
    doc.text(`Due Date: ${format(new Date(payment.due_date), "dd MMM yyyy")}`, margin + 5, yPos + 10);
  }
  
  if (payment.manual_entry_notes) {
    doc.text(payment.manual_entry_notes, margin + 5, yPos + 15, { maxWidth: contentWidth - 60 });
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(formatCurrency(payment.amount_paid), pageWidth - margin - 5, yPos, { align: "right" });
  yPos += rowHeight + 5;

  // Total
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPos - 5, contentWidth, 10, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", margin + 5, yPos + 3);
  doc.text(formatCurrency(payment.amount_paid), pageWidth - margin - 5, yPos + 3, { align: "right" });
  yPos += 15;

  // Payment Method
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Payment Method:", margin, yPos);
  yPos += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(payment.payment_source === "stripe" ? "Stripe Payment" : "Manual Payment", margin, yPos);
  yPos += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  if (payment.stripe_payment_intent_id) {
    doc.text(`Transaction ID: ${payment.stripe_payment_intent_id}`, margin, yPos);
    yPos += 5;
  }
  doc.text(`Status: ${payment.payment_status.toUpperCase()}`, margin, yPos);
  yPos += 5;
  doc.text(`Payment Date: ${format(new Date(payment.payment_date), "dd MMM yyyy 'at' HH:mm")}`, margin, yPos);
  yPos += 15;

  // Footer
  if (yPos > pageHeight - 40) {
    doc.addPage();
    yPos = margin;
  }
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Thank you for your payment!", pageWidth / 2, yPos, { align: "center" });
  yPos += 5;
  doc.text(
    `If you have any questions about this invoice, please contact us at ${contactEmail} or ${contactPhone}`,
    pageWidth / 2,
    yPos,
    { align: "center", maxWidth: contentWidth }
  );
  if (payment.payment_source === "stripe") {
    yPos += 8;
    doc.setFontSize(8);
    doc.text(
      "This payment was processed securely through Stripe. Your payment information is encrypted and secure.",
      pageWidth / 2,
      yPos,
      { align: "center", maxWidth: contentWidth }
    );
  }

  // Save PDF
  const fileName = `invoice-${invoiceNumber}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
};

