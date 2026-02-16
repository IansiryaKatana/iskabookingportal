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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { applicationId } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch application and student data
    const { data: application, error: appError } = await supabaseAdmin
      .from("student_applications")
      .select(`
        *,
        contract:contracts(
          id,
          name,
          contract_start,
          contract_end,
          weeks,
          studio_grade:studio_grades(name)
        )
      `)
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      throw new Error("Application not found");
    }

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
      .eq("application_id", applicationId)
      .eq("step_number", 1)
      .single();

    // Also get user email as fallback
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(application.student_id);
    const user = userData?.user;

    // Get payment history from unified_payment_history
    const { data: paymentHistory } = await supabaseAdmin
      .from("unified_payment_history")
      .select("*")
      .eq("student_application_id", applicationId)
      .eq("payment_status", "succeeded")
      .order("payment_date", { ascending: true });

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
    const companyName = branding.company_name || branding["company_name"] || "Urban Hub";
    const contactEmail = branding.contact_email || "Accounts@unitylivin.com";
    const contactPhone = branding.contact_phone || "";

    // Branding colors with fallbacks
    const primaryColor = hexToRgb(branding.color_primary || "#E63946");
    const primaryForegroundColor = hexToRgb(branding.color_primary_foreground || "#FFFFFF");
    const successColor = hexToRgb(branding.color_success || "#10B981");
    const successForegroundColor = hexToRgb(branding.color_success_foreground || "#FFFFFF");
    const foregroundColor = hexToRgb(branding.color_foreground || "#000000");
    const mutedForegroundColor = hexToRgb(branding.color_muted_foreground || "#64748B");
    const borderColor = hexToRgb(branding.color_border || "#E2E8F0");

    // Get logo from branding
    let logoImage: any = null;
    const logoPath = branding.logo_path;
    if (logoPath) {
      try {
        // Try to get logo from storage
        const logoUrl = logoPath.startsWith("http")
          ? logoPath
          : `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/branding/${logoPath.replace(/^\//, "")}`;

        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          const logoBytes = await logoResponse.arrayBuffer();
          logoImage = logoBytes;
        }
      } catch (error) {
        console.warn("Could not load logo:", error);
      }
    }

    // Get payment summary
    const { data: paymentSummary, error: summaryError } = await supabaseAdmin
      .rpc("get_payment_summary", { p_application_id: applicationId });

    if (summaryError) {
      console.error("Error getting payment summary:", summaryError);
      throw new Error(`Failed to get payment summary: ${summaryError.message}`);
    }

    const summary = paymentSummary?.[0] || {};
    
    // Initialize studentName variable for filename (will be set later)
    let finalStudentName = "Student";
    
    // Variable to store "Amount" label Y position for stamp positioning
    let amountLabelYPosition = 0;

    // Get deposit amount from contract/payment plan
    let depositAmount = 0;
    try {
      if (application.contract_id) {
        // Try to get deposit from contract override first
        const { data: contract, error: contractError } = await supabaseAdmin
          .from("contracts")
          .select("deposit_override, payment_plan_id, studio_grade_id, academic_year_id")
          .eq("id", application.contract_id)
          .single();

        if (contractError) {
          console.warn("Error fetching contract for deposit:", contractError);
        } else if (contract) {
          if (contract.deposit_override) {
            depositAmount = Number(contract.deposit_override) || 0;
          } else if (contract.payment_plan_id) {
            // Get from payment plan
            const { data: paymentPlan, error: planError } = await supabaseAdmin
              .from("payment_plans")
              .select("deposit_amount")
              .eq("id", contract.payment_plan_id)
              .single();
            
            if (planError) {
              console.warn("Error fetching payment plan for deposit:", planError);
            } else if (paymentPlan?.deposit_amount) {
              depositAmount = Number(paymentPlan.deposit_amount) || 0;
            }
          }
          
          // Check for studio grade price override
          if (contract.studio_grade_id && contract.academic_year_id && depositAmount === 0) {
            const { data: gradePrice, error: gradeError } = await supabaseAdmin
              .from("studio_grade_prices")
              .select("deposit_amount_override")
              .eq("studio_grade_id", contract.studio_grade_id)
              .eq("academic_year_id", contract.academic_year_id)
              .single();
            
            if (gradeError) {
              console.warn("Error fetching grade price for deposit:", gradeError);
            } else if (gradePrice?.deposit_amount_override) {
              depositAmount = Number(gradePrice.deposit_amount_override) || 0;
            }
          }
        }
      }
    } catch (depositError) {
      console.warn("Error calculating deposit amount:", depositError);
      // Continue with depositAmount = 0 if there's an error
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    // Fonts (PDF-lib has limited font support, using standard fonts)
    // Note: System fonts (Inter Tight, Big Shoulders Display) are not available in PDF-lib
    // We use Helvetica as closest match, but structure is ready for custom fonts if needed
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    let yPosition = height - 50;

    // Header with logo and branding
    if (logoImage) {
      try {
        const logo = await pdfDoc.embedPng(logoImage);
        // Resize logo to max 150px width while maintaining aspect ratio
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
        // If PNG fails, try JPEG
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
          console.warn("Could not embed logo image");
        }
      }
    }

    // Company name with primary color
    page.drawText(companyName, {
      x: 50,
      y: yPosition,
      size: 24,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });

    yPosition -= 35;

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
      yPosition -= 35;
    }

    // Title with primary color
    page.drawText("Payment History & Receipt", {
      x: 50,
      y: yPosition,
      size: 20,
      font: helveticaBold,
      color: rgb(primaryColor.r, primaryColor.g, primaryColor.b),
    });

    yPosition -= 45;

    // Student Information
    page.drawText("Student Information", {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition -= 25;

    // Get student name from profile, then step 1, then user metadata, then email
    const firstName = profile?.first_name || 
                      (step1?.payload as any)?.first_name || 
                      user?.user_metadata?.first_name || 
                      "";
    const lastName = profile?.last_name || 
                     (step1?.payload as any)?.last_name || 
                     user?.user_metadata?.last_name || 
                     "";
    const studentName = `${firstName} ${lastName}`.trim() || user?.email || "Student";
    
    // Store in outer scope for filename
    finalStudentName = studentName;
    
    page.drawText("Name:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(studentName || "N/A", {
      x: 150,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition -= 25;

    // Contract Information
    page.drawText("Contract Information", {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition -= 25;

    if (application.contract) {
      page.drawText("Contract:", {
        x: 50,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      page.drawText(application.contract.name, {
        x: 150,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
      });
      yPosition -= 20;

      if (application.contract.contract_start && application.contract.contract_end) {
        const startDate = new Date(application.contract.contract_start).toLocaleDateString("en-GB");
        const endDate = new Date(application.contract.contract_end).toLocaleDateString("en-GB");
        page.drawText("Period:", {
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
        yPosition -= 25;
      }
    }

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

    page.drawText("Deposit:", {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText(`£${depositAmount.toFixed(2)}`, {
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
    yPosition -= 35;

    // Payment History Table Header
    page.drawText("Payment History", {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });

    yPosition -= 25;

    // Table headers
    const tableY = yPosition;
    const amountLabelY = tableY; // Store Y position of "Amount" label for stamp positioning
    
    page.drawText("Date", {
      x: 50,
      y: tableY,
      size: 10,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText("Type", {
      x: 150,
      y: tableY,
      size: 10,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    page.drawText("Description", {
      x: 220,
      y: tableY,
      size: 10,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    const amountHeaderWidth = helveticaBold.widthOfTextAtSize("Amount", 10);
    page.drawText("Amount", {
      x: width - 50 - amountHeaderWidth,
      y: tableY,
      size: 10,
      font: helveticaBold,
      color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
    });
    
    // Store "Amount" label Y position for stamp positioning (50px above this)
    amountLabelYPosition = tableY;

    yPosition -= 20;

    // Draw line under headers with border color (thicker for header)
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: 545, y: yPosition },
      thickness: 1.5,
      color: rgb(borderColor.r, borderColor.g, borderColor.b),
    });

    yPosition -= 20;

    // Payment rows with borders between transactions
    let currentPage = page; // Track current page for multi-page support
    if (paymentHistory && paymentHistory.length > 0) {
      for (let i = 0; i < paymentHistory.length; i++) {
        const payment = paymentHistory[i];
        
        if (yPosition < 100) {
          // New page if needed
          currentPage = pdfDoc.addPage([595, 842]);
          yPosition = currentPage.getSize().height - 50;
        }

        // Draw border line before each transaction (except first one)
        if (i > 0) {
          currentPage.drawLine({
            start: { x: 50, y: yPosition + 10 },
            end: { x: 545, y: yPosition + 10 },
            thickness: 1.5,
            color: rgb(borderColor.r, borderColor.g, borderColor.b),
          });
          yPosition -= 10;
        }

        const paymentDate = payment.payment_date
          ? new Date(payment.payment_date).toLocaleDateString("en-GB")
          : "N/A";
        const paymentType = payment.payment_metadata?.type || payment.payment_type || "Payment";
        const description = payment.payment_metadata?.label || payment.description || paymentType;
        const amount = payment.amount_paid || payment.amount || 0;

        currentPage.drawText(paymentDate, {
          x: 50,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });

        currentPage.drawText(paymentType.charAt(0).toUpperCase() + paymentType.slice(1), {
          x: 150,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });

        const descText = description.length > 30 ? description.substring(0, 27) + "..." : description;
        currentPage.drawText(descText, {
          x: 220,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });

        const amountText = `£${Number(amount).toFixed(2)}`;
        const amountTextWidth = helvetica.widthOfTextAtSize(amountText, 9);
        currentPage.drawText(amountText, {
          x: width - 50 - amountTextWidth,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: rgb(foregroundColor.r, foregroundColor.g, foregroundColor.b),
        });

        yPosition -= 20;
      }
      
      // Draw final border line after last transaction
      if (paymentHistory.length > 0) {
        currentPage.drawLine({
          start: { x: 50, y: yPosition + 5 },
          end: { x: 545, y: yPosition + 5 },
          thickness: 1.5,
          color: rgb(borderColor.r, borderColor.g, borderColor.b),
        });
      }
    } else {
      page.drawText("No payment history available", {
        x: 50,
        y: yPosition,
        size: 10,
        font: helveticaOblique,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      });
      yPosition -= 20;
    }

    // Fully Paid Stamp - Use "PAID IN FULL" stamp image
    // Position it just above the "Amount" label (50px above)
    if (summary.payment_status === "fully_paid") {
      try {
        // Try to load the "PAID IN FULL" stamp from branding storage
        const stampUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/branding/paid-in-full-stamp.png`;
        const stampResponse = await fetch(stampUrl);
        
        if (stampResponse.ok) {
          const stampBytes = await stampResponse.arrayBuffer();
          const stampImage = await pdfDoc.embedPng(stampBytes);
          
          // Position stamp just above the "Amount" label (50px above)
          const stampSize = 120; // Size of the stamp
          const stampX = width - stampSize - 50; // Keep horizontal position (right-aligned)
          const stampY = amountLabelYPosition + 50; // 50px above the "Amount" label
          
          page.drawImage(stampImage, {
            x: stampX,
            y: stampY,
            width: stampSize,
            height: stampSize,
          });
        } else {
          // Fallback: Try JPEG format
          try {
            const stampUrlJpg = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/branding/paid-in-full-stamp.jpg`;
            const stampResponseJpg = await fetch(stampUrlJpg);
            if (stampResponseJpg.ok) {
              const stampBytes = await stampResponseJpg.arrayBuffer();
              const stampImage = await pdfDoc.embedJpg(stampBytes);
              
              const stampSize = 120;
              const stampX = width - stampSize - 50; // Keep horizontal position (right-aligned)
              const stampY = amountLabelYPosition + 50; // 50px above the "Amount" label
              
              page.drawImage(stampImage, {
                x: stampX,
                y: stampY,
                width: stampSize,
                height: stampSize,
              });
            }
          } catch (e) {
            console.warn("Could not load PAID IN FULL stamp image");
          }
        }
      } catch (error) {
        console.warn("Could not load PAID IN FULL stamp:", error);
      }
    }

    // Footer
    const footerY = 50;
    page.drawText(
      `Generated on ${new Date().toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
      {
        x: 50,
        y: footerY,
        size: 8,
        font: helveticaOblique,
        color: rgb(mutedForegroundColor.r, mutedForegroundColor.g, mutedForegroundColor.b),
      },
    );

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    // Return PDF as base64 (using efficient method to avoid stack overflow)
    // Convert byte array to string in chunks to avoid call stack issues
    const bytes = new Uint8Array(pdfBytes);
    let binary = '';
    const len = bytes.length;
    
    // Process in chunks to avoid stack overflow
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    const base64Pdf = btoa(binary);

    return new Response(
      JSON.stringify({
        success: true,
        pdf: base64Pdf,
        filename: `payment-history-${finalStudentName.replace(/\s+/g, "-")}-${Date.now()}.pdf`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error generating PDF:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to generate PDF",
        details: error.stack || String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
