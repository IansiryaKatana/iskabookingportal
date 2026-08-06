/**
 * Build template variables for application Quick Action emails.
 */

export type ApplicationEmailContext = {
  studentName?: string | null;
  studentEmail?: string | null;
  applicationId: string;
  studioNumber?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  depositAmount?: number | null;
  portalUrl?: string | null;
  companyName?: string | null;
};

export function buildApplicationEmailVariables(
  ctx: ApplicationEmailContext,
): Record<string, string> {
  const portalBase =
    ctx.portalUrl?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const amount =
    ctx.depositAmount != null && !Number.isNaN(Number(ctx.depositAmount))
      ? `£${Number(ctx.depositAmount).toFixed(2)}`
      : "£99.00";

  return {
    student_name: (ctx.studentName || "Student").trim(),
    student_email: ctx.studentEmail || "",
    application_id: ctx.applicationId,
    studio_number: ctx.studioNumber || "TBA",
    contract_start: ctx.contractStart || "TBA",
    contract_end: ctx.contractEnd || "TBA",
    amount,
    due_date: "as soon as possible",
    payment_url: `${portalBase}/portal/payments`,
    portal_url: `${portalBase}/portal`,
    signing_url: `${portalBase}/portal/applications/${ctx.applicationId}`,
    agreement_type: "tenancy",
    company_name: ctx.companyName || "Urban Hub",
    current_year: new Date().getFullYear().toString(),
    link: `/portal/applications/${ctx.applicationId}`,
  };
}

/** Replace {var} and [var] placeholders (matches edge function behaviour). */
export function replaceEmailVariables(
  text: string,
  vars: Record<string, string>,
): string {
  if (!text) return text;
  let result = text;
  for (let pass = 0; pass < 3; pass++) {
    Object.entries(vars).forEach(([key, value]) => {
      const stringValue = String(value ?? "").trim();
      if (!stringValue) return;
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`\\{${escapedKey}\\}`, "gi"), stringValue);
      result = result.replace(new RegExp(`\\[${escapedKey}\\]`, "gi"), stringValue);
    });
  }
  return result;
}
