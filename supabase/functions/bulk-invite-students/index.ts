import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

interface InvitationRequest {
  application_ids?: string[];
  filters?: {
    contract_id?: string;
    academic_year_id?: string;
    status?: string;
    imported_after?: string;
  };
  email_template_id?: string;
  resend?: boolean; // If true, resend to already invited users
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Verify user
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user is staff
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["staff", "superadmin"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Staff access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    let requestBody: InvitationRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { application_ids, filters, email_template_id, resend = false } = requestBody;

    // Build query to find applications with placeholder users
    let query = supabaseAdmin
      .from("student_applications")
      .select(`
        id,
        student_id,
        status,
        contract:contracts (
          id,
          name,
          academic_year_id,
          academic_years:academic_years (
            id,
            name
          )
        ),
        student_application_steps!inner (
          step_number,
          payload
        )
      `)
      .eq("student_application_steps.step_number", 2); // Step 2 contains email

    // Filter by application IDs if provided
    if (application_ids && application_ids.length > 0) {
      query = query.in("id", application_ids);
    }

    // Apply filters
    if (filters) {
      if (filters.contract_id) {
        query = query.eq("contract_id", filters.contract_id);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.academic_year_id) {
        query = query.eq("contract.academic_year_id", filters.academic_year_id);
      }
      if (filters.imported_after) {
        query = query.gte("created_at", filters.imported_after);
      }
    }

    const { data: applications, error: appsError } = await query;

    if (appsError) {
      console.error("Error fetching applications:", appsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch applications", details: appsError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!applications || applications.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          total: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          message: "No applications found matching criteria",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get user metadata to check account status
    const studentIds = [...new Set(applications.map((app: any) => app.student_id))];
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users", details: usersError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create map of user metadata
    const userMetadataMap = new Map(
      users.map((u) => [
        u.id,
        (u.user_metadata as any) || {},
      ])
    );

    // Get email template if provided
    let emailTemplate: any = null;
    if (email_template_id) {
      const { data: template, error: templateError } = await supabaseAdmin
        .from("email_templates")
        .select("*")
        .eq("id", email_template_id)
        .single();

      if (templateError) {
        console.warn("Failed to fetch email template:", templateError);
      } else {
        emailTemplate = template;
      }
    }

    // Get Resend credentials
    const { data: credentials } = await supabaseAdmin
      .from("credentials")
      .select("credential_key, credential_value")
      .in("credential_key", ["resend_api_key", "resend_from_email"]);

    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    let fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk";

    if (credentials && credentials.length > 0) {
      const credsMap = new Map(
        credentials.map((c) => [c.credential_key, c.credential_value])
      );
      resendApiKey = credsMap.get("resend_api_key") || resendApiKey;
      fromEmail = credsMap.get("resend_from_email") || fromEmail;
    }

    // Get portal URL
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://portal.urbanhub.uk";

    // Get branding settings (company name) for template replacement
    const { data: brandingSettings } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_value")
      .eq("setting_key", "company_name")
      .single();
    const companyName = brandingSettings?.setting_value || "StudentStaySolutions";

    // Process invitations
    const results = {
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Helper function to delay execution (for rate limiting)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to send email with retry logic for rate limiting
    const sendEmailWithRetry = async (
      emailPayload: any,
      email: string,
      maxRetries: number = 3
    ): Promise<boolean> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(emailPayload),
          });

          if (resendResponse.ok) {
            return true;
          } else {
            const errorText = await resendResponse.text();
            
            // Handle rate limiting (429) with exponential backoff
            if (resendResponse.status === 429) {
              const retryAfter = resendResponse.headers.get("retry-after");
              const waitTime = retryAfter 
                ? parseInt(retryAfter) * 1000 
                : Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
              
              console.warn(`⚠ Rate limit hit for ${email}. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
              await delay(waitTime);
              continue; // Retry
            }
            
            // For other errors, throw
            throw new Error(`Resend API error: ${errorText}`);
          }
        } catch (fetchError: any) {
          if (attempt < maxRetries - 1) {
            const waitTime = 1000 * Math.pow(2, attempt); // Exponential backoff
            console.warn(`⚠ Network error for ${email} (attempt ${attempt + 1}). Waiting ${waitTime}ms before retry`);
            await delay(waitTime);
          } else {
            throw fetchError;
          }
        }
      }
      return false; // All retries failed
    };

    // Rate limiting: Resend allows 2 requests per second, so we'll send at max 1.5 per second (650ms delay) to be safe
    const RATE_LIMIT_DELAY_MS = 650; // Slightly less than 500ms to account for processing time
    
    console.log(`Starting to process ${applications.length} invitations with rate limiting (${RATE_LIMIT_DELAY_MS}ms delay between emails)`);

    // Process invitations sequentially with rate limiting
    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      
      try {
        const studentId = app.student_id;
        const userMetadata = userMetadataMap.get(studentId) || {};
        const accountStatus = userMetadata.account_status || "unknown";

        // Check if already invited (unless resend is true)
        if (!resend && accountStatus === "invited") {
          results.skipped++;
          // Still add delay to maintain rate limit even for skipped
          if (i < applications.length - 1) {
            await delay(RATE_LIMIT_DELAY_MS);
          }
          continue;
        }

        // Skip if already activated
        if (accountStatus === "active" || accountStatus === "activated") {
          results.skipped++;
          // Still add delay to maintain rate limit even for skipped
          if (i < applications.length - 1) {
            await delay(RATE_LIMIT_DELAY_MS);
          }
          continue;
        }

        // Get email from step 2 payload
        const step2 = app.student_application_steps?.find(
          (s: any) => s.step_number === 2
        );
        const email = step2?.payload?.email;

        if (!email) {
          results.failed++;
          results.errors.push({
            email: "unknown",
            error: "Email not found in application step 2",
          });
          // Still add delay to maintain rate limit even for failed
          if (i < applications.length - 1) {
            await delay(RATE_LIMIT_DELAY_MS);
          }
          continue;
        }

        // Sync email to auth user if different (safety net)
        const normalizedEmail = email.toLowerCase().trim();
        const authUser = users.find((u) => u.id === studentId);
        if (authUser && authUser.email?.toLowerCase() !== normalizedEmail) {
          try {
            console.log(`Syncing email for user ${studentId}: ${authUser.email} -> ${normalizedEmail}`);
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
              email: normalizedEmail,
              email_confirm: true, // Keep email verified
            });

            if (updateError) {
              console.warn(`Failed to sync email for user ${studentId}:`, updateError);
              // Continue with invitation even if email sync fails
            } else {
              console.log(`Successfully synced email for user ${studentId}`);
            }
          } catch (syncError) {
            console.warn(`Error syncing email for user ${studentId}:`, syncError);
            // Continue with invitation even if email sync fails
          }
        }

        // Generate password reset link with redirect to portal reset password page
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: email.toLowerCase().trim(),
          options: {
          redirectTo: `https://portal.urbanhub.uk/portal/reset-password`,
        },
      });

        if (linkError || !linkData) {
          results.failed++;
          results.errors.push({
            email,
            error: linkError?.message || "Failed to generate invitation link",
          });
          // Still add delay to maintain rate limit even for failed
          if (i < applications.length - 1) {
            await delay(RATE_LIMIT_DELAY_MS);
          }
          continue;
        }

        // Update user metadata
        await supabaseAdmin.auth.admin.updateUserById(studentId, {
          user_metadata: {
            ...userMetadata,
            account_status: "invited",
            invitation_sent_at: new Date().toISOString(),
            invitation_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          },
        });

        // Send email
        // If no template selected, try to use default account_invitation template
        let templateToUse = emailTemplate;
        if (!templateToUse && resendApiKey) {
          const { data: defaultTemplate } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("template_type", "account_invitation")
            .eq("is_active", true)
            .eq("name", "Account Invitation")
            .single();
          
          if (defaultTemplate) {
            templateToUse = defaultTemplate;
            console.log(`Using default account_invitation template for ${email}`);
          }
        }

        if (resendApiKey && templateToUse) {
          // Use email template
          let emailBody = templateToUse.body_html || templateToUse.body_text || "";
          let emailSubject = templateToUse.subject || "Activate Your Account";

          // Replace template variables (comprehensive replacement with company_name support)
          const firstName = userMetadata.first_name || step2?.payload?.first_name || "Student";
          const contractName = app.contract?.name || "Your Contract";
          const academicYear = app.contract?.academic_years?.name || "";

          // Comprehensive variable replacement function
          const replaceVariables = (text: string): string => {
            if (!text) return "";
            let result = text;
            
            const vars: Record<string, string> = {
              student_name: firstName,
              portal_url: portalUrl,
              invitation_link: linkData.properties.action_link,
              contract_name: contractName,
              academic_year: academicYear,
              expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
              company_name: companyName,
              COMPANY_NAME: companyName.toUpperCase(),
              current_year: new Date().getFullYear().toString(),
            };

            // Multiple passes for comprehensive replacement
            for (let pass = 0; pass < 3; pass++) {
              Object.entries(vars).forEach(([key, value]) => {
                const stringValue = String(value || "").trim();
                if (!stringValue) return;
                
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Replace {variable} format - case insensitive, global replace
                result = result.replace(new RegExp(`\\{${escapedKey}\\}`, "gi"), stringValue);
                
                // Replace [variable] format - case insensitive, global replace
                result = result.replace(new RegExp(`\\[${escapedKey}\\]`, "gi"), stringValue);
              });
            }
            
            return result;
          };

          emailBody = replaceVariables(emailBody);
          emailSubject = replaceVariables(emailSubject);

          // Format from email properly
          const formattedFromEmail = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;

          // Send via Resend with retry logic
          const emailPayload = {
            from: formattedFromEmail,
            to: email,
            subject: emailSubject,
            html: emailBody,
          };

          const success = await sendEmailWithRetry(emailPayload, email);
          
          if (!success) {
            throw new Error("Failed to send email after retries");
          }
        } else {
          // No template and no Resend API key: Use default Supabase password reset email
          // The link generation already sends an email via Supabase
          console.log(`Invitation link generated for ${email} (using Supabase default email - no Resend API key configured)`);
        }

        results.sent++;
        
        // Log progress every 10 invitations
        if (results.sent % 10 === 0) {
          console.log(`Progress: Sent ${results.sent}/${applications.length} invitations (${Math.round(results.sent / applications.length * 100)}%)`);
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          email: app.student_application_steps?.find((s: any) => s.step_number === 2)?.payload?.email || "unknown",
          error: error.message || "Unknown error",
        });
        console.error("Error processing invitation:", error);
      }

      // Rate limiting: Wait before processing next invitation (except for the last one)
      if (i < applications.length - 1) {
        await delay(RATE_LIMIT_DELAY_MS);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: applications.length,
        sent: results.sent,
        skipped: results.skipped,
        failed: results.failed,
        errors: results.errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in bulk-invite-students:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

