import { useBrandingSettings } from "@/hooks/useBranding";
import { format } from "date-fns";
import type { UnifiedPayment } from "@/hooks/useUnifiedPayments";
import logo from "@/assets/urban-hub-logo.webp";

type InvoiceTemplateProps = {
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
};

export const InvoiceTemplate = ({
  payment,
  studentName,
  studentEmail,
  studentPhone,
  studentAddress,
  invoiceNumber,
}: InvoiceTemplateProps) => {
  const { data: branding } = useBrandingSettings();

  const logoPath = branding?.logo_path || logo;
  const companyName = branding?.company_name || "StudentStaySolutions";
  const contactPhone = branding?.contact_phone || "+44 123 456 7890";
  const contactEmail = branding?.contact_email || "Accounts@unitylivin.com";
  const contactAddress1 = branding?.contact_address_line1 || "123 Student Street";
  const contactAddress2 = branding?.contact_address_line2 || "City Centre";
  const contactAddress3 = branding?.contact_address_line3 || "Preston, PR1 1AA";
  const vatNumber = branding?.vat_number || "";
  const companyNumber = branding?.company_number || "";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: payment.currency || "GBP",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="bg-white p-8 md:p-12 max-w-4xl mx-auto" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b-2 border-primary">
        <div>
          <img src={logoPath} alt={companyName} className="h-12 mb-4" />
          <h1 className="text-3xl font-display font-black uppercase tracking-wide text-primary">INVOICE</h1>
        </div>
        <div className="text-right mt-4 md:mt-0">
          <p className="text-sm text-muted-foreground">Invoice Number</p>
          <p className="text-lg font-semibold">{invoiceNumber}</p>
          <p className="text-sm text-muted-foreground mt-2">Date</p>
          <p className="text-lg font-semibold">{format(new Date(payment.payment_date), "dd MMM yyyy")}</p>
        </div>
      </div>

      {/* Company and Student Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">From</h2>
          <p className="font-display font-black text-lg uppercase">{companyName}</p>
          <p className="text-sm mt-1">{contactAddress1}</p>
          {contactAddress2 && <p className="text-sm">{contactAddress2}</p>}
          {contactAddress3 && <p className="text-sm">{contactAddress3}</p>}
          <p className="text-sm mt-2">Phone: {contactPhone}</p>
          <p className="text-sm">Email: {contactEmail}</p>
          {vatNumber && <p className="text-sm mt-2">VAT Number: {vatNumber}</p>}
          {companyNumber && <p className="text-sm">Company Number: {companyNumber}</p>}
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Bill To</h2>
          <p className="font-semibold text-lg">{studentName}</p>
          <p className="text-sm mt-1">{studentEmail}</p>
          {studentPhone && <p className="text-sm">Phone: {studentPhone}</p>}
          {studentAddress && (
            <div className="mt-2 text-sm">
              {studentAddress.line1 && <p>{studentAddress.line1}</p>}
              {studentAddress.line2 && <p>{studentAddress.line2}</p>}
              {studentAddress.city && <p>{studentAddress.city}</p>}
              {studentAddress.postcode && <p>{studentAddress.postcode}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Payment Details */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Payment Details</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-primary/10">
              <tr>
                <th className="text-left p-4 font-semibold uppercase text-sm">Description</th>
                <th className="text-right p-4 font-semibold uppercase text-sm">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-4">
                  <div>
                    <p className="font-semibold">
                      {payment.payment_type === "deposit" ? "Deposit Payment" : `Installment #${payment.installment_number || "N/A"}`}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{payment.contract_name}</p>
                    {payment.due_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Due Date: {format(new Date(payment.due_date), "dd MMM yyyy")}
                      </p>
                    )}
                    {payment.manual_entry_notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{payment.manual_entry_notes}</p>
                    )}
                  </div>
                </td>
                <td className="p-4 text-right font-semibold">{formatCurrency(payment.amount_paid)}</td>
              </tr>
            </tbody>
            <tfoot className="bg-primary/5">
              <tr>
                <td className="p-4 font-display font-black text-lg uppercase">Total</td>
                <td className="p-4 text-right font-display font-black text-lg">{formatCurrency(payment.amount_paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-8 p-4 bg-muted/30 rounded-lg">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Payment Method</h3>
        <p className="font-semibold">
          {payment.payment_source === "stripe" ? "Stripe Payment" : "Manual Payment"}
        </p>
        {payment.stripe_payment_intent_id && (
          <p className="text-sm text-muted-foreground mt-1">
            Transaction ID: {payment.stripe_payment_intent_id}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          Status: <span className="uppercase font-semibold">{payment.payment_status}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Payment Date: {format(new Date(payment.payment_date), "dd MMM yyyy 'at' HH:mm")}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
        <p>Thank you for your payment!</p>
        <p className="mt-2">
          If you have any questions about this invoice, please contact us at {contactEmail} or {contactPhone}
        </p>
        {payment.payment_source === "stripe" && (
          <p className="mt-4 text-xs">
            This payment was processed securely through Stripe. Your payment information is encrypted and secure.
          </p>
        )}
      </div>
    </div>
  );
};

