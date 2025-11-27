import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to parse Resend API response
async function parseResendResponse(response: Response) {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    console.error("Error parsing Resend response:", parseError);
    console.error("Raw response:", responseText);
    throw new Error(`Failed to parse Resend response: ${responseText}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      user_id,
      email_type,
      template_id,
      variables = {},
      create_notification = true,
    } = await req.json();

    if (!user_id || !email_type) {
      return new Response(
        JSON.stringify({ error: "user_id and email_type are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get user email
    const { data: { user }, error: userError } = await supabaseClient.auth.admin.getUserById(user_id);
    if (userError || !user?.email) {
      return new Response(
        JSON.stringify({ error: "User not found or no email" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch email template if provided, otherwise use default templates
    let emailSubject = "";
    let emailBodyHtml = "";
    let emailBodyText = "";

    if (template_id) {
      const { data: template, error: templateError } = await supabaseClient
        .from("email_templates")
        .select("*")
        .eq("id", template_id)
        .eq("is_active", true)
        .single();

      if (!templateError && template) {
        emailSubject = template.subject;
        emailBodyHtml = template.body_html || template.body_text;
        emailBodyText = template.body_text || template.body_html?.replace(/<[^>]*>/g, "") || "";
      }
    }

    // Get company name for default templates (if not already fetched)
    let companyName = "StudentStaySolutions";
    if (!brandingSettings) {
      const { data: branding } = await supabaseClient
        .from("branding_settings")
        .select("setting_value")
        .eq("setting_key", "company_name")
        .single();
      companyName = branding?.setting_value || "StudentStaySolutions";
    } else {
      companyName = brandingSettings.setting_value || "StudentStaySolutions";
    }

    // Default templates for common email types
    if (!emailSubject) {
      switch (email_type) {
        case "deposit_received":
          emailSubject = `Deposit Payment Received - ${companyName}`;
          emailBodyHtml = `
            <h2>Deposit Payment Received</h2>
            <p>Dear ${variables.student_name || "Student"},</p>
            <p>We have successfully received your deposit payment of ${variables.amount || "£99"}.</p>
            <p>Your application is now progressing to the next stage. Please complete the remaining steps in your booking journey.</p>
            <p>Thank you for choosing ${companyName}!</p>
          `;
          break;
        case "signature_completed":
          emailSubject = `Agreement Signed - ${companyName}`;
          emailBodyHtml = `
            <h2>Agreement Signed</h2>
            <p>Dear ${variables.student_name || "Student"},</p>
            <p>Thank you for completing the signing of your tenancy agreement.</p>
            <p>Your application is now being reviewed by our team. We'll notify you once it's been confirmed.</p>
            <p>Best regards,<br>${companyName} Team</p>
          `;
          break;
        case "application_confirmed":
          emailSubject = `Application Confirmed - Welcome to ${companyName}!`;
          emailBodyHtml = `
            <h2>Application Confirmed</h2>
            <p>Dear ${variables.student_name || "Student"},</p>
            <p>Congratulations! Your application has been confirmed.</p>
            <p>Your studio: ${variables.studio_number || "TBA"}</p>
            <p>Contract start: ${variables.contract_start || "TBA"}</p>
            <p>Welcome to ${companyName}! We're excited to have you join us.</p>
            <p>Best regards,<br>${companyName} Team</p>
          `;
          break;
        case "payment_due":
          emailSubject = `Payment Due Reminder - ${companyName}`;
          emailBodyHtml = `
            <h2>Payment Due Reminder</h2>
            <p>Dear ${variables.student_name || "Student"},</p>
            <p>This is a reminder that your payment of ${variables.amount || "£XXX"} is due on ${variables.due_date || "TBA"}.</p>
            <p>Please log in to your portal to make the payment.</p>
            <p>Thank you,<br>${companyName} Team</p>
          `;
          break;
        case "refund_processed":
          emailSubject = `Refund Processed - ${companyName}`;
          emailBodyHtml = `
            <h2>Refund Processed</h2>
            <p>Dear ${variables.student_name || "Student"},</p>
            <p>We have processed a refund of ${variables.amount || "£XXX"} to your original payment method.</p>
            ${variables.reason ? `<p><strong>Reason:</strong> ${variables.reason}</p>` : ""}
            <p>Refund ID: ${variables.refund_id || "N/A"}</p>
            <p>The refund should appear in your account within 5-10 business days, depending on your bank or card issuer.</p>
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>${companyName} Team</p>
          `;
          break;
        default:
          emailSubject = `Notification from ${companyName}`;
          emailBodyHtml = `<p>${variables.message || `You have a new notification from ${companyName}.`}</p>`;
      }
      emailBodyText = emailBodyHtml.replace(/<[^>]*>/g, "");
    }

    // Replace template variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, "g");
      emailSubject = emailSubject.replace(regex, String(value));
      emailBodyHtml = emailBodyHtml.replace(regex, String(value));
      emailBodyText = emailBodyText.replace(regex, String(value));
    });

    // Get branding settings (company name)
    const { data: brandingSettings, error: brandingError } = await supabaseClient
      .from("branding_settings")
      .select("setting_key, setting_value")
      .eq("setting_key", "company_name")
      .single();

    const companyName = brandingSettings?.setting_value || "StudentStaySolutions";

    // Get Resend credentials from database (fallback to env vars for backward compatibility)
    const { data: credentials, error: credsError } = await supabaseClient
      .from("credentials")
      .select("credential_key, credential_value")
      .in("credential_key", ["resend_api_key", "resend_from_email"]);

    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    let fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.iankatana.com";

    if (credentials && credentials.length > 0) {
      const credsMap = new Map(
        credentials.map((c) => [c.credential_key, c.credential_value])
      );
      resendApiKey = credsMap.get("resend_api_key") || resendApiKey;
      fromEmail = credsMap.get("resend_from_email") || fromEmail;
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured. Please set it in Settings." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    
    // Format from email properly (Resend accepts both formats, but let's be explicit)
    const formattedFromEmail = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;

    console.log(`Sending email to ${user.email} from ${formattedFromEmail}`);
    console.log(`Email subject: ${emailSubject}`);
    console.log(`Email body length: HTML=${emailBodyHtml.length}, Text=${emailBodyText.length}`);
    
    const emailPayload = {
      from: formattedFromEmail,
      to: user.email,
      subject: emailSubject,
      html: emailBodyHtml,
      text: emailBodyText,
    };
    
    console.log(`Email payload (without body):`, JSON.stringify({
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      html_length: emailPayload.html.length,
      text_length: emailPayload.text.length,
    }));
    
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await resendResponse.text();
    console.log(`Resend API response status: ${resendResponse.status}`);
    console.log(`Resend API response: ${responseText.substring(0, 500)}`);

    if (!resendResponse.ok) {
      try {
        const errorData = JSON.parse(responseText);
        console.error("✗ Resend API error:", JSON.stringify(errorData, null, 2));
        console.error(`Response status: ${resendResponse.status}`);
        console.error(`Full error response: ${responseText}`);
        throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
      } catch (parseError) {
        console.error("✗ Error parsing error response:", parseError);
        console.error(`Raw response: ${responseText}`);
        throw new Error(`Resend API error (status ${resendResponse.status}): ${responseText}`);
      }
    }

    const resendData = await parseResendResponse(resendResponse);
    console.log(`✓ Email sent successfully (ID: ${resendData.id || "N/A"})`);

    // Create notification if requested
    if (create_notification) {
      await supabaseClient.from("notifications").insert({
        user_id,
        title: emailSubject,
        message: emailBodyText.substring(0, 200),
        type: email_type,
        is_read: false,
        link: variables.link || null,
      });
    }

    return new Response(
      JSON.stringify({
        message: "Email sent successfully",
        email_id: resendData.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-transactional-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

