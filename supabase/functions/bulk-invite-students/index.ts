import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { getCredential } from "../_shared/get-credential.ts";
import { buildPortalRecoveryLink, resolvePortalUrl } from "../_shared/recovery-link.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

/** PostgREST `.in()` with hundreds of UUIDs exceeds URL limits and returns 400. */
const IN_QUERY_CHUNK_SIZE = 80;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const APPLICATION_SELECT = `
        id,
        student_id,
        status,
        contract:contracts!student_applications_contract_id_fkey (
          id,
          name,
          academic_year_id,
          academic_years:academic_years (
            id,
            name
          )
        )
      `;

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

    const applyApplicationFilters = (query: ReturnType<typeof supabaseAdmin.from>) => {
      let filteredQuery = query;
      if (filters) {
        if (filters.contract_id) {
          filteredQuery = filteredQuery.eq("contract_id", filters.contract_id);
        }
        if (filters.status) {
          filteredQuery = filteredQuery.eq("status", filters.status);
        }
        if (filters.academic_year_id) {
          filteredQuery = filteredQuery.eq("contract.academic_year_id", filters.academic_year_id);
        }
        if (filters.imported_after) {
          filteredQuery = filteredQuery.gte("created_at", filters.imported_after);
        }
      }
      return filteredQuery;
    };

    let applications: any[] = [];

    if (application_ids && application_ids.length > 0) {
      for (const applicationIdChunk of chunkArray(application_ids, IN_QUERY_CHUNK_SIZE)) {
        let chunkQuery = supabaseAdmin
          .from("student_applications")
          .select(APPLICATION_SELECT)
          .in("id", applicationIdChunk);

        chunkQuery = applyApplicationFilters(chunkQuery);

        const { data: chunkApps, error: chunkError } = await chunkQuery;
        if (chunkError) {
          console.error("Error fetching applications:", chunkError);
          return new Response(
            JSON.stringify({ error: "Failed to fetch applications", details: chunkError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (chunkApps?.length) {
          applications.push(...chunkApps);
        }
      }
    } else {
      let query = supabaseAdmin
        .from("student_applications")
        .select(APPLICATION_SELECT);

      query = applyApplicationFilters(query);

      const { data: filteredApps, error: appsError } = await query;

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

      applications = filteredApps || [];
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

    // Fetch step 2 payload separately so applications without step 2 are not excluded
    const applicationIds = applications.map((app: any) => app.id).filter(Boolean);
    const step2ByApplicationId = new Map<string, any>();
    if (applicationIds.length > 0) {
      for (const applicationIdChunk of chunkArray(applicationIds, IN_QUERY_CHUNK_SIZE)) {
        const { data: stepRows, error: stepRowsError } = await supabaseAdmin
          .from("student_application_steps")
          .select("application_id, step_number, payload")
          .in("application_id", applicationIdChunk)
          .eq("step_number", 2);

        if (stepRowsError) {
          console.warn("Failed to fetch step 2 rows for bulk invitations:", stepRowsError);
          break;
        }

        (stepRows || []).forEach((row: any) => {
          step2ByApplicationId.set(row.application_id, row.payload || {});
        });
      }
    }

    // Get user metadata to check account status (paginate — listUsers defaults to 50)
    const studentIds = [...new Set(applications.map((app: any) => app.student_id))];
    const users: any[] = [];
    {
      let page = 1;
      const perPage = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (usersError || !usersData) {
          console.error("Error fetching users:", usersError);
          return new Response(
            JSON.stringify({
              error: "Failed to fetch users",
              details: usersError?.message || "Auth admin.listUsers returned no data",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const pageUsers = usersData.users || [];
        users.push(...pageUsers);

        const foundIds = new Set(users.map((u) => u.id));
        const allFound = studentIds.every((id) => foundIds.has(id));
        if (allFound || pageUsers.length < perPage) {
          hasMore = false;
        } else {
          page += 1;
        }
      }

      // Fallback for any student IDs still missing
      const missingIds = studentIds.filter((id) => !users.some((u) => u.id === id));
      for (const userId of missingIds) {
        try {
          const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (!error && data?.user) {
            users.push(data.user);
          }
        } catch (err) {
          console.warn(`Could not fetch auth user ${userId}:`, err);
        }
      }
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

    // Get Resend credentials (database + env, with decryption support)
    const envResendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const [fromDbKey, fromEmailRaw] = await Promise.all([
      getCredential("RESEND_API_KEY", {
        supabase: supabaseAdmin,
        fallback: envResendKey,
      }),
      getCredential("RESEND_FROM_EMAIL", {
        supabase: supabaseAdmin,
        fallback: Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk",
      }),
    ]);
    const resendApiKey = (fromDbKey?.trim() || envResendKey?.trim()) ?? "";
    const fromEmail = fromEmailRaw?.trim() || "noreply@send.portal.urbanhub.uk";
    if (!resendApiKey) {
      console.log("Resend API key: not set (check Settings > Email or Supabase Edge Function secret RESEND_API_KEY)");
    } else {
      console.log(`Resend API key: present (${fromDbKey?.trim() ? "database" : "env"}, length ${resendApiKey.length})`);
    }

    const portalUrl = await resolvePortalUrl(supabaseAdmin);

    // Get branding settings (company name) for template replacement
    const { data: brandingSettings } = await supabaseAdmin
      .from("branding_settings")
      .select("setting_value")
      .eq("setting_key", "company_name")
      .single();
    const companyName = brandingSettings?.setting_value || "Urban Hub";

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
              
              console.warn(`âš  Rate limit hit for ${email}. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
              await delay(waitTime);
              continue; // Retry
            }
            
            // For other errors, throw
            throw new Error(`Resend API error: ${errorText}`);
          }
        } catch (fetchError: any) {
          if (attempt < maxRetries - 1) {
            const waitTime = 1000 * Math.pow(2, attempt); // Exponential backoff
            console.warn(`âš  Network error for ${email} (attempt ${attempt + 1}). Waiting ${waitTime}ms before retry`);
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
        const step2Payload = step2ByApplicationId.get(app.id) || {};
        const authUser = users.find((u) => u.id === studentId);
        const email = (step2Payload?.email || authUser?.email || "").toString().trim();

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
          redirectTo: `${portalUrl}/portal/reset-password`,
        },
      });

        if (linkError || !linkData?.properties) {
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

        let invitationLink: string;
        try {
          invitationLink = buildPortalRecoveryLink(
            portalUrl,
            "/portal/reset-password",
            linkData.properties,
            "recovery",
          );
        } catch (linkBuildError: any) {
          results.failed++;
          results.errors.push({
            email,
            error: linkBuildError?.message || "Failed to build invitation link",
          });
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
        const firstName = userMetadata.first_name || step2Payload?.first_name || "Student";
        const contractName = app.contract?.name || "Your Contract";
        const academicYear = app.contract?.academic_years?.name || "";
        const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();

        const vars: Record<string, string> = {
          student_name: firstName,
          portal_url: portalUrl,
          invitation_link: invitationLink,
          contract_name: contractName,
          academic_year: academicYear,
          expiration_date: expirationDate,
          company_name: companyName,
          COMPANY_NAME: companyName.toUpperCase(),
          current_year: new Date().getFullYear().toString(),
        };

        const replaceVariables = (text: string): string => {
          if (!text) return "";
          let result = text;
          for (let pass = 0; pass < 3; pass++) {
            Object.entries(vars).forEach(([key, value]) => {
              const stringValue = String(value || "").trim();
              if (!stringValue) return;
              const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              result = result.replace(new RegExp(`\\{${escapedKey}\\}`, "gi"), stringValue);
              result = result.replace(new RegExp(`\\[${escapedKey}\\]`, "gi"), stringValue);
            });
          }
          return result;
        };

        // If no template selected, try default account_invitation template from DB (any active one)
        let templateToUse = emailTemplate;
        if (!templateToUse && resendApiKey) {
          const { data: defaultTemplate } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("template_type", "account_invitation")
            .eq("is_active", true)
            .order("name")
            .limit(1)
            .maybeSingle();
          if (defaultTemplate) {
            templateToUse = defaultTemplate;
            console.log(`Using account_invitation template "${templateToUse.name}" for ${email}`);
          }
        }

        let emailBody: string;
        let emailSubject: string;

        if (resendApiKey && templateToUse) {
          emailBody = replaceVariables(templateToUse.body_html || templateToUse.body_text || "");
          emailSubject = replaceVariables(templateToUse.subject || "Activate Your Account");
        } else if (resendApiKey) {
          // No template in DB: send built-in default invitation email so "default" always sends
          emailSubject = `Activate Your Student Portal Account - ${contractName}`;
          emailBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2>Activate Your Account</h2>
<p>Hello ${firstName},</p>
<p>Your account has been created for <strong>${contractName}</strong>${academicYear ? ` (${academicYear})` : ""}. Click the link below to set your password and activate your student portal.</p>
<p><a href="${invitationLink}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Activate Account</a></p>
<p style="color: #666; font-size: 14px;">Or copy this link: ${invitationLink}</p>
<p style="color: #666; font-size: 14px;">This link expires on ${expirationDate}.</p>
<p>Portal: <a href="${portalUrl}">${portalUrl}</a></p>
<p>â€” ${companyName}</p>
</body></html>`;
          console.log(`Using built-in default invitation email for ${email}`);
        } else {
          console.log(`Invitation link generated for ${email} (no Resend API key - email not sent)`);
        }

        if (resendApiKey && typeof emailBody === "string" && typeof emailSubject === "string") {
          const formattedFromEmail = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;
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
        }

        results.sent++;
        
        // Log progress every 10 invitations
        if (results.sent % 10 === 0) {
          console.log(`Progress: Sent ${results.sent}/${applications.length} invitations (${Math.round(results.sent / applications.length * 100)}%)`);
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          email: step2ByApplicationId.get(app.id)?.email || "unknown",
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

