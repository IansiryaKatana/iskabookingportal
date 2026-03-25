import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

// Helper function to convert hex to RGB
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

// Generate invoice number
function generateInvoiceNumber(paymentId: string, year: number): string {
  // Use last 8 chars of payment ID + year for uniqueness
  const shortId = paymentId.slice(-8).toUpperCase();
  return `INV-STUDENT-${year}-${shortId}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Simple, runtime-safe base64 encoder for Uint8Array.
    // Avoids slow string concatenation loops and remote imports.
    function toBase64(bytes: Uint8Array): string {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const out: string[] = [];
      for (let i = 0; i < bytes.length; i += 3) {
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
      }
      return out.join("");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { paymentId, paymentSource } = requestBody;

    if (!paymentId || !paymentSource) {
      return new Response(
        JSON.stringify({ error: "paymentId and paymentSource are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get payment from unified_payment_history
    console.log("Looking for payment:", { paymentId, paymentSource });
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("unified_payment_history")
      .select("*")
      .eq("payment_id", paymentId)
      .eq("payment_source", paymentSource)
      .single();

    if (paymentError) {
      console.error("Error fetching payment:", paymentError);
      return new Response(
        JSON.stringify({ error: "Payment not found", details: paymentError.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!payment) {
      console.error("Payment not found in database");
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Payment found:", payment.payment_id);
    console.log("Application ID:", payment.student_application_id);

    // Get application first.
    // IMPORTANT: Avoid embedding `contracts(...)` here because the schema currently
    // has multiple relationships between `student_applications` and `contracts`,
    // which causes Supabase to throw a runtime error.
    const { data: applicationRaw, error: appError } = await supabaseAdmin
      .from("student_applications")
      .select("*")
      .eq("id", payment.student_application_id)
      .single();

    if (appError) {
      console.error("Error fetching application:", appError);
      return new Response(
        JSON.stringify({ error: "Application not found", details: appError.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!applicationRaw) {
      console.error("Application not found in database");
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const application: any = applicationRaw;
    console.log("Application found:", application.id);

    // Fetch contract separately to avoid ambiguous embedding.
    let contract: any = null;
    if (application.contract_id) {
      const { data: contractData, error: contractError } = await supabaseAdmin
        .from("contracts")
        .select(`
          id,
          name,
          contract_start,
          contract_end,
          weeks,
          weekly_price_override,
          deposit_override,
          studio_grade:studio_grades(name),
          payment_plan:payment_plans(deposit_amount)
        `)
        .eq("id", application.contract_id)
        .single();

      if (contractError) {
        console.warn("Error fetching contract for invoice:", contractError);
      } else {
        contract = contractData;
      }
    }

    application.contract = contract;

    // Get student profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", application.student_id)
      .single();

    // Get application step 1 (Personal Details) for name fallback
    const { data: step1 } = await supabaseAdmin
      .from("student_application_steps")
      .select("payload")
      .eq("application_id", payment.student_application_id)
      .eq("step_number", 1)
      .single();

    // Get step 2 (Contact Information) for address
    const { data: step2 } = await supabaseAdmin
      .from("student_application_steps")
      .select("payload")
      .eq("application_id", payment.student_application_id)
      .eq("step_number", 2)
      .single();

    // Get user email
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(application.student_id);
    const user = userData?.user;

    // Get payment summary
    const { data: paymentSummary } = await supabaseAdmin
      .rpc("get_payment_summary", { p_application_id: payment.student_application_id });

    const summary = paymentSummary?.[0] || {};

    // Get ALL branding settings
    const { data: brandingData } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_key, setting_value");

    // Convert branding settings to object
    const branding: Record<string, string> = {};
    if (brandingData) {
      brandingData.forEach((item) => {
        branding[item.setting_key] = item.setting_value || "";
      });
    }

    // Extract branding values with fallbacks
    const companyName = branding.company_name || "Urban Hub";
    const contactEmail = branding.contact_email || "Accounts@unitylivin.com";
    const contactPhone = branding.contact_phone || "";
    const companyAddress = branding.company_address || "";

    // Branding colors
    const primaryColor = hexToRgb(branding.color_primary || "#E63946");
    const foregroundColor = hexToRgb(branding.color_foreground || "#000000");
    const mutedForegroundColor = hexToRgb(branding.color_muted_foreground || "#64748B");
    const borderColor = hexToRgb(branding.color_border || "#E2E8F0");

    // Get logo
    let logoImage: any = null;
    const logoPath = branding.logo_path;
    if (logoPath) {
      try {
        const logoUrl = logoPath.startsWith("http")
          ? logoPath
          : `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/branding/${logoPath.replace(/^\//, "")}`;
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          logoImage = await logoResponse.arrayBuffer();
        }
      } catch (error) {
        console.warn("Could not load logo:", error);
      }
    }

    // Get student name
    const firstName = profile?.first_name ||
                      (step1?.payload as any)?.first_name ||
                      user?.user_metadata?.first_name ||
                      "";
    const lastName = profile?.last_name ||
                     (step1?.payload as any)?.last_name ||
                     user?.user_metadata?.last_name ||
                     "";
    const studentName = `${firstName} ${lastName}`.trim() || user?.email || "Student";
    const studentEmail = user?.email || "";

    // Get student address from step 2
    const addressLine1 = (step2?.payload as any)?.address_line_1 || "";
    const addressLine2 = (step2?.payload as any)?.address_line_2 || "";
    const postcode = (step2?.payload as any)?.postcode || "";
    const town = (step2?.payload as any)?.town || "";
    const studentAddress = [addressLine1, addressLine2, town, postcode]
      .filter(Boolean)
      .join(", ");

    // Determine payment type label
    const paymentTypeLabel = payment.installment_number
      ? `Installment ${payment.installment_number}`
      : payment.payment_metadata?.label || "Deposit";

    // Get payment method
    let paymentMethod = "Stripe Payment";
    if (payment.payment_source === "manual") {
      // Get manual payment details
      const { data: manualPayment } = await supabaseAdmin
        .from("manual_payments")
        .select("payment_method, receipt_number")
        .eq("id", paymentId)
        .single();

      if (manualPayment) {
        const methodMap: Record<string, string> = {
          cash: "Cash",
          card: "Card",
          bank_transfer: "Bank Transfer",
          cheque: "Cheque",
        };
        paymentMethod = methodMap[manualPayment.payment_method] || "Manual Payment";
      }
    }

    // Get or generate invoice number
    // Note: If invoice_number column doesn't exist yet (migration not run), we'll just generate one
    const currentYear = new Date().getFullYear();
    let invoiceNumber: string | null = null;
    
    try {
      if (payment.payment_source === "stripe") {
        const { data: stripePayment, error: stripeError } = await supabaseAdmin
          .from("stripe_payments")
          .select("invoice_number")
          .eq("id", paymentId)
          .maybeSingle();
        
        // If column doesn't exist, error code will be 42703
        if (stripeError && stripeError.code !== "42703") {
          console.warn("Error fetching invoice number:", stripeError);
        } else {
          invoiceNumber = stripePayment?.invoice_number || null;
        }
      } else {
        const { data: manualPayment, error: manualError } = await supabaseAdmin
          .from("manual_payments")
          .select("invoice_number")
          .eq("id", paymentId)
          .maybeSingle();
        
        if (manualError && manualError.code !== "42703") {
          console.warn("Error fetching invoice number:", manualError);
        } else {
          invoiceNumber = manualPayment?.invoice_number || null;
        }
      }
    } catch (error) {
      console.warn("Error fetching existing invoice number:", error);
      // Continue - we'll generate a new one
    }

    if (!invoiceNumber) {
      invoiceNumber = generateInvoiceNumber(paymentId, currentYear);
      // Try to update the payment record with invoice number (may fail if column doesn't exist)
      try {
        if (payment.payment_source === "stripe") {
          const { error: updateError } = await supabaseAdmin
            .from("stripe_payments")
            .update({
              invoice_number: invoiceNumber,
              invoice_generated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
          
          if (updateError && updateError.code === "42703") {
            console.warn("invoice_number column doesn't exist yet - migration not run");
          } else if (updateError) {
            console.warn("Error updating invoice number:", updateError);
          }
        } else {
          const { error: updateError } = await supabaseAdmin
            .from("manual_payments")
            .update({
              invoice_number: invoiceNumber,
              invoice_generated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
          
          if (updateError && updateError.code === "42703") {
            console.warn("invoice_number column doesn't exist yet - migration not run");
          } else if (updateError) {
            console.warn("Error updating invoice number:", updateError);
          }
        }
      } catch (updateError) {
        console.warn("Error updating invoice number:", updateError);
        // Continue - invoice number is generated, just not saved
      }
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    let yPosition = height - 50;

    // Header with logo
    if (logoImage) {
      try {
        const logo = await pdfDoc.embedPng(logoImage);
        const maxWidth = 150;
        const scale = Math.min(maxWidth / logo.width, 1);
        const logoWidth = logo.width * scale;
        const logoHeight = logo.height * scale;
        page.drawImage(logo, {
          x: 50,
          y: yPosition - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
        yPosition -= logoHeight + 25;
      } catch (error) {
        try {
          const logo = await pdfDoc.embedJpg(logoImage);
          const maxWidth = 150;
          const scale = Math.min(maxWidth / logo.width, 1);
          const logoWidth = logo.width * scale;
          const logoHeight = logo.height * scale;
          page.drawImage(logo, {
            x: 50,
            y: yPosition - logoHeight,
            width: logoWidth,
            height: logoHeight,
          });
          yPosition -= logoHeight + 25;
        } catch (e) {
          console.warn("Could not embed logo");
        }
      }
    }

    // Company name
    page.drawText(companyName, {
      x: 50,
      y: yPosition,
      size: 24,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });
    yPosition -= 35;

    // Company contact info
    if (contactEmail) {
      page.drawText(contactEmail, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      yPosition -= 18;
    }
    if (contactPhone) {
      page.drawText(contactPhone, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      yPosition -= 18;
    }
    if (companyAddress) {
      const addressLines = companyAddress.split("\n");
      for (const line of addressLines) {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
        });
        yPosition -= 15;
      }
    }
    yPosition -= 20;

    // Receipt title and reference (right-aligned) — student download is post-payment
    const docTitle = "RECEIPT";
    const titleWidth = helveticaBold.widthOfTextAtSize(docTitle, 28);
    page.drawText(docTitle, {
      x: width - 50 - titleWidth,
      y: yPosition + 20,
      size: 28,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });

    const receiptRef = (invoiceNumber || "").replace(/^INV-/, "RCP-");
    const refText = `Receipt #: ${receiptRef}`;
    const refWidth = helveticaBold.widthOfTextAtSize(refText, 12);
    page.drawText(refText, {
      x: width - 50 - refWidth,
      y: yPosition - 10,
      size: 12,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    const invoiceDate = new Date(payment.payment_date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const dateText = `Date: ${invoiceDate}`;
    const dateWidth = helvetica.widthOfTextAtSize(dateText, 11);
    page.drawText(dateText, {
      x: width - 50 - dateWidth,
      y: yPosition - 25,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition -= 60;

    // Bill To section
    page.drawText("Bill To:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 20;

    page.drawText(studentName, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 15;

    if (studentAddress) {
      const addressLines = studentAddress.split(", ");
      for (const line of addressLines) {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        yPosition -= 15;
      }
    }

    if (studentEmail) {
      page.drawText(studentEmail, {
        x: 50,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      yPosition -= 30;
    }

    // Payment Details section
    page.drawText("Payment Details", {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 25;

    // Payment type
    page.drawText("Payment Type:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(paymentTypeLabel, {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 20;

    // Payment method
    page.drawText("Payment Method:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(paymentMethod, {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 20;

    // Transaction reference
    let transactionRef = "N/A";
    if (payment.payment_source === "stripe") {
      transactionRef = payment.stripe_payment_intent_id || "N/A";
    } else {
      try {
        const { data: manualPayment } = await supabaseAdmin
          .from("manual_payments")
          .select("receipt_number")
          .eq("id", paymentId)
          .single();
        transactionRef = manualPayment?.receipt_number || "N/A";
      } catch (error) {
        console.warn("Error fetching receipt number:", error);
        transactionRef = "N/A";
      }
    }
    
    page.drawText("Transaction Reference:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(transactionRef, {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 30;

    // Contract Information
    if (application.contract) {
      page.drawText("Contract Information", {
        x: 50,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      yPosition -= 25;

      page.drawText("Contract:", {
        x: 50,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      page.drawText(application.contract.name || "N/A", {
        x: 150,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      yPosition -= 20;

      if (application.contract.studio_grade?.name) {
        page.drawText("Studio Grade:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: helveticaBold,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        page.drawText(application.contract.studio_grade.name, {
          x: 150,
          y: yPosition,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        yPosition -= 20;
      }

      if (application.contract.contract_start && application.contract.contract_end) {
        const startDate = new Date(application.contract.contract_start).toLocaleDateString("en-GB");
        const endDate = new Date(application.contract.contract_end).toLocaleDateString("en-GB");
        page.drawText("Tenancy Period:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: helveticaBold,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        page.drawText(`${startDate} to ${endDate}`, {
          x: 150,
          y: yPosition,
          size: 11,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });
        yPosition -= 20;
      }

      if (application.assigned_studio_id) {
        const { data: studio } = await supabaseAdmin
          .from("studios")
          .select("room_number")
          .eq("id", application.assigned_studio_id)
          .single();
        
        if (studio?.room_number) {
          page.drawText("Room Number:", {
            x: 50,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
          });
          page.drawText(studio.room_number, {
            x: 150,
            y: yPosition,
            size: 11,
            font: helvetica,
            color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
          });
          yPosition -= 20;
        }
      }

      yPosition -= 10;
    }

    // Invoice Items Table
    const tableStartY = yPosition;
    const tableRowHeight = 30;
    const tableHeaderY = yPosition;

    // Table header
    page.drawRectangle({
      x: 50,
      y: tableHeaderY - 25,
      width: width - 100,
      height: 25,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
      opacity: 0.1,
    });

    page.drawText("Description", {
      x: 55,
      y: tableHeaderY - 5,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    const amountText = `Amount (${payment.currency || "GBP"})`;
    const amountTextWidth = helveticaBold.widthOfTextAtSize(amountText, 11);
    page.drawText(amountText, {
      x: width - 55 - amountTextWidth,
      y: tableHeaderY - 5,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition = tableHeaderY - 35;

    // Table row
    page.drawText(paymentTypeLabel, {
      x: 55,
      y: yPosition + 5,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    const amountValue = `£${Number(payment.amount_paid).toFixed(2)}`;
    const amountValueWidth = helvetica.widthOfTextAtSize(amountValue, 11);
    page.drawText(amountValue, {
      x: width - 55 - amountValueWidth,
      y: yPosition + 5,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    // Border line
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: width - 50, y: yPosition },
      thickness: 1.5,
      color: rgb(borderColor.r, borderColor.g, borderColor.b),
    });

    yPosition -= 40;

    // Total section
    const totalLabel = "Total Amount:";
    const totalLabelWidth = helveticaBold.widthOfTextAtSize(totalLabel, 14);
    page.drawText(totalLabel, {
      x: width - 200 - totalLabelWidth,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    const totalAmount = `£${Number(payment.amount_paid).toFixed(2)}`;
    const totalAmountWidth = helveticaBold.widthOfTextAtSize(totalAmount, 14);
    page.drawText(totalAmount, {
      x: width - 55 - totalAmountWidth,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });

    yPosition -= 50;

    // Payment Summary
    page.drawText("Payment Summary", {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 25;

    page.drawText("Total Due:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(`£${(summary.total_due || 0).toFixed(2)}`, {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 20;

    page.drawText("Total Paid:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(`£${(summary.total_paid || 0).toFixed(2)}`, {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    yPosition -= 20;

    page.drawText("Remaining Balance:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(`£${(summary.remaining_balance || 0).toFixed(2)}`, {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition -= 50;

    // Footer
    if (companyAddress || contactEmail || contactPhone) {
      page.drawText("For inquiries, please contact:", {
        x: 50,
        y: yPosition,
        size: 10,
        font: helveticaOblique,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      yPosition -= 20;

      if (contactEmail) {
        page.drawText(`Email: ${contactEmail}`, {
          x: 50,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
        });
        yPosition -= 15;
      }
      if (contactPhone) {
        page.drawText(`Phone: ${contactPhone}`, {
          x: 50,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
        });
      }
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Convert to base64
    const base64 = toBase64(pdfBytes);

    return new Response(
      JSON.stringify({
        pdf: base64,
        invoiceNumber: invoiceNumber,
        filename: `Receipt-${(invoiceNumber || "").replace(/^INV-/, "RCP-")}-${studentName.replace(/\s+/g, "-")}.pdf`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Error stack:", stack);
    return new Response(
      JSON.stringify({
        error: message,
        details: stack ? "Check function logs for details" : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

