import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { buildPortalRecoveryLink, resolvePortalUrl } from "../_shared/recovery-link.ts";

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
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

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
      email,
      type = "signup", // 'signup' or 'recovery' (password reset)
      redirect_to,
    } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get user by email
    const { data: { users }, error: userError } = await supabaseClient.auth.admin.listUsers();
    const user = users?.find((u) => u.email === email);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get branding settings
    const { data: brandingSettings, error: brandingError } = await supabaseClient
      .from("branding_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["company_name", "logo_path", "contact_email"]);

    if (brandingError) {
      console.error("Error fetching branding settings:", brandingError);
    }

    const brandingMap = new Map(
      brandingSettings?.map((s) => [s.setting_key, s.setting_value]) || []
    );
    const companyName = brandingMap.get("company_name") || "Urban Hub";
    const logoPath = brandingMap.get("logo_path") || "";
    const supportEmail = brandingMap.get("contact_email") || "";

    // Get Resend credentials from database
    const { data: credentials, error: credsError } = await supabaseClient
      .from("credentials")
      .select("credential_key, credential_value")
      .in("credential_key", ["resend_api_key", "resend_from_email"]);

    if (credsError || !credentials || credentials.length === 0) {
      return new Response(
        JSON.stringify({ error: "Resend credentials not configured. Please set them in Settings." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const credsMap = new Map(
      credentials.map((c) => [c.credential_key, c.credential_value])
    );
    const resendApiKey = credsMap.get("resend_api_key");
    const fromEmail = credsMap.get("resend_from_email") || "noreply@send.portal.urbanhub.uk";

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "Resend API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate confirmation token via Supabase Admin API
    let confirmationLink = "";
    const portalUrl = await resolvePortalUrl(supabaseClient);
    const redirectUrl = redirect_to || `${portalUrl}/portal/reset-password`;

    if (type === "signup") {
      const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
        type: "signup",
        email: email,
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (linkError || !linkData?.properties) {
        console.error("Error generating confirmation link:", linkError);
        return new Response(
          JSON.stringify({ error: "Failed to generate confirmation link" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      try {
        confirmationLink = buildPortalRecoveryLink(
          portalUrl,
          "/portal/reset-password",
          linkData.properties,
          "signup",
        );
      } catch (buildError: any) {
        console.error("Error building confirmation link:", buildError);
        return new Response(
          JSON.stringify({ error: buildError?.message || "Failed to build confirmation link" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } else if (type === "recovery") {
      const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (linkError || !linkData?.properties) {
        console.error("Error generating recovery link:", linkError);
        return new Response(
          JSON.stringify({ error: "Failed to generate recovery link" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const recoveryPath = redirectUrl.includes("/partner/")
        ? "/partner/reset-password"
        : redirectUrl.includes("/admin/")
          ? "/admin/reset-password"
          : "/portal/reset-password";

      try {
        confirmationLink = buildPortalRecoveryLink(
          portalUrl,
          recoveryPath,
          linkData.properties,
          "recovery",
        );
      } catch (buildError: any) {
        console.error("Error building recovery link:", buildError);
        return new Response(
          JSON.stringify({ error: buildError?.message || "Failed to build recovery link" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Get email template
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_type", type === "signup" ? "email_confirmation" : "password_reset")
      .eq("is_active", true)
      .single();

    let emailSubject = "";
    let emailBodyHtml = "";
    let emailBodyText = "";

    if (!templateError && template) {
      // Use template from database
      emailSubject = template.subject;
      emailBodyHtml = template.body_html || template.body_text;
      emailBodyText = template.body_text || template.body_html?.replace(/<[^>]*>/g, "") || "";
    } else {
      // Fallback to default template
      if (type === "signup") {
        emailSubject = `Confirm your email address - ${companyName}`;
        emailBodyHtml = `
          <h2>Confirm Your Email Address</h2>
          <p>Hello ${user.user_metadata?.first_name || "there"},</p>
          <p>Thank you for registering with ${companyName}! To complete your registration and set up your account password, please confirm your email address by clicking the link below:</p>
          <p><a href="${confirmationLink}" style="display: inline-block; padding: 12px 24px; background-color: hsl(0 85% 55%); color: #ffffff; text-decoration: none; border-radius: 6px;">Confirm Email Address</a></p>
          <p>Or copy and paste this link: ${confirmationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <p>Best regards,<br>${companyName} Team</p>
        `;
        emailBodyText = `
Confirm Your Email Address - ${companyName}

Hello ${user.user_metadata?.first_name || "there"},

Thank you for registering with ${companyName}! To complete your registration and set up your account password, please confirm your email address by clicking the link below:

${confirmationLink}

This link will expire in 24 hours.

Best regards,
${companyName} Team
        `;
      } else {
        emailSubject = `Reset your password - ${companyName}`;
        emailBodyHtml = `
          <h2>Reset Your Password</h2>
          <p>Hello ${user.user_metadata?.first_name || "there"},</p>
          <p>You requested to reset your password for your ${companyName} account. Click the link below to set a new password:</p>
          <p><a href="${confirmationLink}" style="display: inline-block; padding: 12px 24px; background-color: hsl(0 85% 55%); color: #ffffff; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
          <p>Or copy and paste this link: ${confirmationLink}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>${companyName} Team</p>
        `;
        emailBodyText = `
Reset Your Password - ${companyName}

Hello ${user.user_metadata?.first_name || "there"},

You requested to reset your password for your ${companyName} account. Click the link below to set a new password:

${confirmationLink}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.

Best regards,
${companyName} Team
        `;
      }
    }

    // Replace template variables
    const variables = {
      company_name: companyName,
      student_name: user.user_metadata?.first_name || "there",
      student_email: email,
      confirmation_link: confirmationLink,
      invitation_link: confirmationLink,
      reset_link: confirmationLink,
      support_email: supportEmail,
      current_year: new Date().getFullYear().toString(),
    };

    // Helper function to replace variables in multiple formats - runs multiple passes to catch all variations
    const replaceVariables = (text: string, vars: Record<string, string>): string => {
      if (!text) return text;
      let result = text;
      
      // Run multiple passes to ensure all replacements happen
      for (let pass = 0; pass < 3; pass++) {
        Object.entries(vars).forEach(([key, value]) => {
          const stringValue = String(value || "").trim();
          if (!stringValue) return; // Skip empty values
          
          // Escape only special regex characters in the key name itself (not the braces/brackets)
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Replace {variable} format - case insensitive, global replace
          result = result.replace(new RegExp(`\\{${escapedKey}\\}`, "gi"), stringValue);
          
          // Replace [variable] format - case insensitive, global replace
          result = result.replace(new RegExp(`\\[${escapedKey}\\]`, "gi"), stringValue);
        });
      }
      
      return result;
    };

    // Replace template variables
    console.log("=== EMAIL TEMPLATE REPLACEMENT ===");
    console.log("Before replacement - Subject preview:", emailSubject.substring(0, 150));
    console.log("Company name value:", companyName);
    console.log("Company name type:", typeof companyName);
    console.log("Variables:", JSON.stringify(variables, null, 2));
    
    emailSubject = replaceVariables(emailSubject, variables);
    emailBodyHtml = replaceVariables(emailBodyHtml, variables);
    emailBodyText = replaceVariables(emailBodyText, variables);
    
    console.log("After replacement - Subject preview:", emailSubject.substring(0, 150));
    console.log("Contains {company_name}:", emailSubject.includes("{company_name}"));
    console.log("Contains [company_name]:", emailSubject.includes("[company_name]"));
    console.log("=== END REPLACEMENT ===");

    // Format from email
    const formattedFromEmail = fromEmail.includes("<") 
      ? fromEmail 
      : `${companyName} <${fromEmail}>`;

    // Send email via Resend
    console.log(`Sending ${type} email to ${email} from ${formattedFromEmail}`);
    
    const emailPayload = {
      from: formattedFromEmail,
      to: email,
      subject: emailSubject,
      html: emailBodyHtml,
      text: emailBodyText,
    };

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

    if (!resendResponse.ok) {
      try {
        const errorData = JSON.parse(responseText);
        console.error("✗ Resend API error:", JSON.stringify(errorData, null, 2));
        throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
      } catch (parseError) {
        console.error("✗ Error parsing error response:", parseError);
        throw new Error(`Resend API error (status ${resendResponse.status}): ${responseText}`);
      }
    }

    const resendData = await parseResendResponse(resendResponse);
    console.log(`✓ Email sent successfully (ID: ${resendData.id || "N/A"})`);

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
    console.error("Error in send-confirmation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

