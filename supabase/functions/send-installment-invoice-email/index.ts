import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { getCredential } from "../_shared/get-credential.ts";

type InstallmentRow = {
  installment_id: string;
  sequence: number;
  label: string | null;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  remaining_amount: number;
  payment_status: "unpaid" | "partial" | "paid" | string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 };
}

function generateInvoiceNumber(applicationId: string, installmentId: string, year: number): string {
  const appPart = applicationId.slice(-6).toUpperCase();
  const instPart = installmentId.slice(-6).toUpperCase();
  return `INV-INST-${year}-${appPart}-${instPart}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const preflight = handleCorsPrelight(req);
  if (preflight) return preflight;

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const applicationId = body.applicationId as string | undefined;
    const installmentId = body.installmentId as string | undefined;
    const preview = Boolean(body.preview);

    // Resolve staff caller for history (optional on preview)
    let sentBy: string | null = null;
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token) {
      const { data: authUser } = await supabaseAdmin.auth.getUser(token);
      sentBy = authUser?.user?.id ?? null;
    }

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load application with contract + student id
    const { data: application, error: appError } = await supabaseAdmin
      .from("student_applications")
      .select(`
        id,
        student_id,
        contract:contracts!contract_id(
          id,
          name,
          contract_start,
          contract_end,
          weeks,
          weekly_price_override,
          deposit_override,
          studio_grade:studio_grades(name),
          academic_year_id
        )
      `)
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return new Response(
        JSON.stringify({ error: "Application not found", details: appError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!application.student_id) {
      return new Response(
        JSON.stringify({ error: "Application has no student_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get student auth user (for email)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      application.student_id,
    );
    if (userError || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Student user or email not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const studentEmail = userData.user.email;

    // Get student name from application step 1 (personal details)
    const { data: step1 } = await supabaseAdmin
      .from("student_application_steps")
      .select("payload")
      .eq("application_id", applicationId)
      .eq("step_number", 1)
      .single();

    const step1Payload = (step1?.payload ?? {}) as Record<string, unknown>;
    const firstName = typeof step1Payload.first_name === "string" ? step1Payload.first_name : "";
    const lastName = typeof step1Payload.last_name === "string" ? step1Payload.last_name : "";
    const studentName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : "Student";

    // Get address / contact from step 2
    const { data: step2 } = await supabaseAdmin
      .from("student_application_steps")
      .select("payload")
      .eq("application_id", applicationId)
      .eq("step_number", 2)
      .single();

    const step2Payload = (step2?.payload ?? {}) as Record<string, unknown>;
    const address1 = typeof step2Payload.address_line1 === "string" ? step2Payload.address_line1 : "";
    const address2 = typeof step2Payload.address_line2 === "string" ? step2Payload.address_line2 : "";
    const city = typeof step2Payload.city === "string" ? step2Payload.city : "";
    const postcode = typeof step2Payload.postcode === "string" ? step2Payload.postcode : "";
    const combinedAddress = [address1, address2, city, postcode].filter(Boolean).join(", ");

    // Fetch installment breakdown and choose target installment
    const { data: breakdown, error: breakdownError } = await supabaseAdmin.rpc(
      "get_installment_breakdown",
      { p_application_id: applicationId },
    );

    if (breakdownError) {
      return new Response(
        JSON.stringify({ error: "Failed to load installment breakdown", details: breakdownError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = (breakdown || []) as InstallmentRow[];
    if (!rows.length) {
      return new Response(
        JSON.stringify({ error: "No installments available for this application" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let target: InstallmentRow | undefined;
    if (installmentId) {
      target = rows.find((r) => r.installment_id === installmentId);
      if (!target) {
        return new Response(
          JSON.stringify({ error: "Selected installment not found for this application" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      target = rows
        .filter((r) => r.payment_status === "unpaid" || r.payment_status === "partial")
        .sort((a, b) => {
          const dateDiff =
            new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return a.sequence - b.sequence;
        })[0];
      if (!target) {
        return new Response(
          JSON.stringify({ error: "No unpaid or partial installments to invoice" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const currentYear = new Date(target.due_date).getFullYear();
    const invoiceNumber = generateInvoiceNumber(application.id, target.installment_id, currentYear);

    // Load branding
    const { data: brandingData } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_key, setting_value");

    const branding: Record<string, string> = {};
    (brandingData || []).forEach((row: any) => {
      branding[row.setting_key] = row.setting_value || "";
    });

    const companyName = branding.company_name || "Urban Hub";
    const contactEmail = branding.contact_email || "Accounts@unitylivin.com";
    const contactPhone = branding.contact_phone || "";
    const companyAddress = branding.company_address || "";

    const primaryColor = hexToRgb(branding.color_primary || "#E63946");
    const foregroundColor = hexToRgb(branding.color_foreground || "#000000");
    const mutedForegroundColor = hexToRgb(branding.color_muted_foreground || "#64748B");
    const borderColor = hexToRgb(branding.color_border || "#E2E8F0");

    // Optional logo
    let logoImage: Uint8Array | null = null;
    if (branding.logo_storage_path) {
      try {
        const { data: logoFile } = await supabaseAdmin.storage
          .from("branding")
          .download(branding.logo_storage_path);
        if (logoFile) {
          const arrayBuffer = await logoFile.arrayBuffer();
          logoImage = new Uint8Array(arrayBuffer);
        }
      } catch {
        logoImage = null;
      }
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // Logo
    if (logoImage) {
      try {
        const logo = await pdfDoc.embedPng(logoImage);
        const maxWidth = 140;
        const scale = Math.min(maxWidth / logo.width, 1);
        const logoWidth = logo.width * scale;
        const logoHeight = logo.height * scale;
        page.drawImage(logo, {
          x: 50,
          y: y - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
        y -= logoHeight + 25;
      } catch {
        // Ignore logo failures
      }
    }

    // Company name
    page.drawText(companyName, {
      x: 50,
      y,
      size: 22,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });
    y -= 30;

    // Contact info
    if (contactEmail) {
      page.drawText(contactEmail, {
        x: 50,
        y,
        size: 10,
        font: helvetica,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      y -= 14;
    }
    if (contactPhone) {
      page.drawText(contactPhone, {
        x: 50,
        y,
        size: 10,
        font: helvetica,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      y -= 14;
    }
    if (companyAddress) {
      companyAddress.split("\n").forEach((line) => {
        if (!line) return;
        page.drawText(line, {
          x: 50,
          y,
          size: 10,
          font: helvetica,
          color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
        });
        y -= 13;
      });
    }

    y -= 20;

    // Invoice title + meta (right)
    const title = "INVOICE";
    const titleWidth = helveticaBold.widthOfTextAtSize(title, 26);
    page.drawText(title, {
      x: width - 50 - titleWidth,
      y: y + 20,
      size: 26,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });

    const invLabel = `Invoice #: ${invoiceNumber}`;
    const invWidth = helveticaBold.widthOfTextAtSize(invLabel, 11);
    page.drawText(invLabel, {
      x: width - 50 - invWidth,
      y: y - 5,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    const issueDate = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const issueText = `Issue Date: ${issueDate}`;
    const issueWidth = helvetica.widthOfTextAtSize(issueText, 10);
    page.drawText(issueText, {
      x: width - 50 - issueWidth,
      y: y - 20,
      size: 10,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    y -= 60;

    // Bill To
    page.drawText("Bill To:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    y -= 18;

    page.drawText(studentName, {
      x: 50,
      y,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    y -= 14;

    if (combinedAddress) {
      combinedAddress.split(", ").forEach((line) => {
        page.drawText(line, {
          x: 50,
          y,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        y -= 14;
      });
    }

    if (studentEmail) {
      page.drawText(studentEmail, {
        x: 50,
        y,
        size: 11,
        font: helvetica,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      y -= 24;
    }

    // Contract info
    if (application.contract) {
      page.drawText("Contract Information", {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      y -= 20;

      if (application.contract.name) {
        page.drawText("Contract:", {
          x: 50,
          y,
          size: 11,
          font: helveticaBold,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        page.drawText(application.contract.name, {
          x: 130,
          y,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        y -= 16;
      }

      if (application.contract.studio_grade?.name) {
        page.drawText("Studio Grade:", {
          x: 50,
          y,
          size: 11,
          font: helveticaBold,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        page.drawText(application.contract.studio_grade.name, {
          x: 130,
          y,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        y -= 16;
      }

      if (application.contract.contract_start && application.contract.contract_end) {
        const start = new Date(application.contract.contract_start).toLocaleDateString("en-GB");
        const end = new Date(application.contract.contract_end).toLocaleDateString("en-GB");
        page.drawText("Tenancy Period:", {
          x: 50,
          y,
          size: 11,
          font: helveticaBold,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        page.drawText(`${start} to ${end}`, {
          x: 130,
          y,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        y -= 18;
      }
    }

    y -= 20;

    // Line items header
    const tableTop = y;
    const left = 50;
    const right = width - 50;

    page.drawRectangle({
      x: left,
      y: tableTop - 22,
      width: right - left,
      height: 22,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });

    page.drawText("Description", {
      x: left + 8,
      y: tableTop - 16,
      size: 10,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Due Date", {
      x: left + 260,
      y: tableTop - 16,
      size: 10,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Amount", {
      x: right - 80,
      y: tableTop - 16,
      size: 10,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    y = tableTop - 34;

    // Single installment line item
    const dueDate = new Date(target.due_date).toLocaleDateString("en-GB");
    const label = target.label || `Instalment ${target.sequence}`;
    const amountText = `£${Number(target.amount_due).toFixed(2)}`;

    page.drawRectangle({
      x: left,
      y: y - 18,
      width: right - left,
      height: 18,
      color: rgb(1, 1, 1),
      opacity: 0,
      borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      borderWidth: 0.5,
    });

    page.drawText(label, {
      x: left + 8,
      y: y - 12,
      size: 10,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(dueDate, {
      x: left + 260,
      y: y - 12,
      size: 10,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    const amountWidth = helvetica.widthOfTextAtSize(amountText, 10);
    page.drawText(amountText, {
      x: right - 80 + (80 - amountWidth) / 2,
      y: y - 12,
      size: 10,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    y -= 40;

    // Totals
    const totalLabel = "Total Due";
    const totalValue = amountText;

    const totalLabelWidth = helveticaBold.widthOfTextAtSize(totalLabel, 11);
    const totalValueWidth = helveticaBold.widthOfTextAtSize(totalValue, 11);

    page.drawText(totalLabel, {
      x: right - 80 - totalLabelWidth - 12,
      y,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(totalValue, {
      x: right - totalValueWidth,
      y,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    y -= 40;

    // Notes
    page.drawText("Notes", {
      x: left,
      y,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    y -= 18;

    const noteLines = [
      "This invoice relates to a scheduled installment for your tenancy.",
      "You can pay this installment securely via your student portal or by bank transfer (if allowed).",
      "If you have already paid, please ignore this invoice or contact our team with your payment reference.",
    ];

    noteLines.forEach((line) => {
      page.drawText(line, {
        x: left,
        y,
        size: 9,
        font: helvetica,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      y -= 12;
    });

    // Footer help
    const footerText = `If you have any questions about this invoice, please contact us at ${contactEmail || "our accounts team"}.`;
    const footerY = 40;
    page.drawText(footerText, {
      x: left,
      y: footerY,
      size: 9,
      font: helvetica,
      color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));

    const [resendApiKey, fromEmailRaw] = await Promise.all([
      getCredential("RESEND_API_KEY", {
        supabase: supabaseAdmin,
        fallback: Deno.env.get("RESEND_API_KEY") ?? "",
      }),
      getCredential("RESEND_FROM_EMAIL", {
        supabase: supabaseAdmin,
        fallback: Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk",
      }),
    ]);

    const fromEmail = fromEmailRaw || "noreply@send.portal.urbanhub.uk";
    const formattedFrom = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;

    const subject = `Invoice for ${target.label || `Instalment ${target.sequence}`} - ${companyName}`;
    const html = `
      <h2>Installment Invoice</h2>
      <p>Dear ${studentName},</p>
      <p>Please find attached your invoice for <strong>${target.label || `Instalment ${target.sequence}`}</strong>.</p>
      <p><strong>Amount due:</strong> £${Number(target.amount_due).toFixed(2)}<br/>
      <strong>Due date:</strong> ${dueDate}</p>
      <p>You can pay this installment securely via your student portal.</p>
      <p>If you have already paid, please ignore this email or contact our team.</p>
      <p>Best regards,<br/>${companyName} Team</p>
    `;
    const text = `Installment Invoice\n\nAmount due: £${Number(target.amount_due).toFixed(
      2,
    )}\nDue date: ${dueDate}\n\nPlease see the attached PDF invoice for details.`;

    const filename = `Invoice-${invoiceNumber}-${studentName.replace(/\s+/g, "-")}.pdf`;

    // Preview mode: return rendered content without sending or storing
    if (preview) {
      return new Response(
        JSON.stringify({
          preview: true,
          subject,
          html,
          text,
          invoiceNumber,
          pdfBase64,
          recipientEmail: studentEmail,
          installmentId: target.installment_id,
          filename,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured. Please set it in Settings." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendPayload = {
      from: formattedFrom,
      to: studentEmail,
      subject,
      html,
      text,
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const responseText = await resendResponse.text();
    if (!resendResponse.ok) {
      await supabaseAdmin.from("application_outbound_messages").insert({
        application_id: applicationId,
        student_id: application.student_id,
        sent_by: sentBy,
        message_type: "installment_invoice",
        channel: "email",
        recipient_email: studentEmail,
        subject,
        body_html: html,
        body_text: text,
        status: "failed",
        metadata: {
          installment_id: target.installment_id,
          invoice_number: invoiceNumber,
          error: responseText.slice(0, 1000),
        },
      });

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let providerMessageId: string | null = null;
    try {
      const parsed = JSON.parse(responseText);
      providerMessageId = typeof parsed?.id === "string" ? parsed.id : null;
    } catch {
      providerMessageId = null;
    }

    // Store PDF snapshot in private bucket for history re-preview
    const attachmentPath = `${applicationId}/${invoiceNumber}-${Date.now()}.pdf`;
    try {
      const pdfBytesForUpload = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const { error: uploadError } = await supabaseAdmin.storage
        .from("application-invoices")
        .upload(attachmentPath, pdfBytesForUpload, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) {
        console.error("Failed to upload invoice PDF snapshot:", uploadError);
      }
    } catch (uploadErr) {
      console.error("Failed to upload invoice PDF snapshot:", uploadErr);
    }

    const { data: outboundRow, error: outboundError } = await supabaseAdmin
      .from("application_outbound_messages")
      .insert({
        application_id: applicationId,
        student_id: application.student_id,
        sent_by: sentBy,
        message_type: "installment_invoice",
        channel: "email",
        recipient_email: studentEmail,
        subject,
        body_html: html,
        body_text: text,
        status: "sent",
        provider_message_id: providerMessageId,
        attachment_path: attachmentPath,
        metadata: {
          installment_id: target.installment_id,
          invoice_number: invoiceNumber,
          filename,
          amount_due: target.amount_due,
          due_date: target.due_date,
        },
      })
      .select("id")
      .single();

    if (outboundError) {
      console.error("Failed to insert outbound message history:", outboundError);
    }

    return new Response(
      JSON.stringify({
        message: "Installment invoice sent",
        invoiceNumber,
        installmentId: target.installment_id,
        outboundMessageId: outboundRow?.id ?? null,
        email_id: providerMessageId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in send-installment-invoice-email:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

