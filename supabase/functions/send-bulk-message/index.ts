import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      bulk_message_id,
      title,
      message,
      notification_type = "info",
      email_template_id,
      filters = {},
    } = await req.json();

    if (!bulk_message_id || !title || !message) {
      return new Response(
        JSON.stringify({ error: "bulk_message_id, title, and message are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update status to sending
    await supabaseClient
      .from("bulk_messages")
      .update({ status: "sending" })
      .eq("id", bulk_message_id);

    // Fetch all confirmed students (or apply filters)
    let query = supabaseClient
      .from("student_applications")
      .select("id, student_id, status, contract_id, assigned_studio_id")
      .eq("status", "confirmed");

    // Apply filters if provided
    if (filters && typeof filters === "object") {
      // Filter by contract_id
      if (filters.contract_id && typeof filters.contract_id === "string") {
        query = query.eq("contract_id", filters.contract_id);
      }
      
      // Filter by studio_grade (via assigned_studio_id -> studios -> studio_grades)
      if (filters.studio_grade_id && typeof filters.studio_grade_id === "string") {
        // We'll filter this after fetching by joining with studios
        // For now, we'll fetch all and filter in memory for simplicity
      }
      
      // Filter by academic_year (via contract -> academic_year_id)
      if (filters.academic_year_id && typeof filters.academic_year_id === "string") {
        // We'll filter this after fetching by joining with contracts
        // For now, we'll fetch all and filter in memory for simplicity
      }
    }

    const { data: applications, error: appsError } = await query;
    
    // Apply post-query filters if needed (for complex joins)
    let filteredApplications = applications || [];
    
    if (filters && typeof filters === "object" && filteredApplications.length > 0) {
      // Filter by studio_grade_id
      if (filters.studio_grade_id && typeof filters.studio_grade_id === "string") {
        const studioIds = filteredApplications
          .map((app) => app.assigned_studio_id)
          .filter(Boolean) as string[];
        
        if (studioIds.length > 0) {
          const { data: studios } = await supabaseClient
            .from("studios")
            .select("id, studio_grade_id")
            .in("id", studioIds)
            .eq("studio_grade_id", filters.studio_grade_id);
          
          const matchingStudioIds = new Set(studios?.map((s) => s.id) || []);
          filteredApplications = filteredApplications.filter((app) =>
            app.assigned_studio_id && matchingStudioIds.has(app.assigned_studio_id),
          );
        } else {
          filteredApplications = [];
        }
      }
      
      // Filter by academic_year_id
      if (filters.academic_year_id && typeof filters.academic_year_id === "string") {
        const contractIds = filteredApplications
          .map((app) => app.contract_id)
          .filter(Boolean) as string[];
        
        if (contractIds.length > 0) {
          const { data: contracts } = await supabaseClient
            .from("contracts")
            .select("id, academic_year_id")
            .in("id", contractIds)
            .eq("academic_year_id", filters.academic_year_id);
          
          const matchingContractIds = new Set(contracts?.map((c) => c.id) || []);
          filteredApplications = filteredApplications.filter((app) =>
            app.contract_id && matchingContractIds.has(app.contract_id),
          );
        } else {
          filteredApplications = [];
        }
      }
    }

    if (appsError) {
      console.error("Error fetching applications:", appsError);
      throw appsError;
    }

    console.log(`Found ${filteredApplications.length} confirmed applications after applying filters`);

    if (!filteredApplications || filteredApplications.length === 0) {
      await supabaseClient
        .from("bulk_messages")
        .update({
          status: "completed",
          total_recipients: 0,
          notifications_sent: 0,
          emails_sent: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", bulk_message_id);

      return new Response(
        JSON.stringify({ message: "No recipients found", recipients: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const studentIds = [...new Set(filteredApplications.map((app) => app.student_id).filter(Boolean))];
    console.log(`Sending to ${studentIds.length} unique students:`, studentIds);
    
    if (studentIds.length === 0) {
      await supabaseClient
        .from("bulk_messages")
        .update({
          status: "completed",
          total_recipients: 0,
          notifications_sent: 0,
          emails_sent: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", bulk_message_id);

      return new Response(
        JSON.stringify({ message: "No valid student IDs found", recipients: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    
    let notificationsSent = 0;
    let emailsSent = 0;

    // Fetch email template if provided
    let emailTemplate = null;
    if (email_template_id) {
      const { data: template, error: templateError } = await supabaseClient
        .from("email_templates")
        .select("*")
        .eq("id", email_template_id)
        .eq("is_active", true)
        .single();

      if (!templateError && template) {
        emailTemplate = template;
      }
    }

    // Create notifications for all students
    // First, try to determine which schema is in use by checking table structure
    // We'll try the new schema first (with type and is_read)
    const notifications = studentIds.map((studentId) => ({
      user_id: studentId,
      title,
      message,
      type: notification_type,
      is_read: false,
      link: null,
      metadata: email_template_id ? {
        bulk_message_id,
        email_template_id,
      } : { bulk_message_id },
    }));

    let { error: notifError, data: insertedNotifications } = await supabaseClient
      .from("notifications")
      .insert(notifications)
      .select();

    // If that fails, try old schema format (notification_type instead of type)
    if (notifError) {
      console.error("Error creating notifications with new schema:", notifError);
      console.error("Trying old schema format...");
      
      const oldFormatNotifications = studentIds.map((studentId) => ({
        user_id: studentId,
        title: title || "",
        message: message || "",
        notification_type: notification_type,
        metadata: email_template_id ? {
          bulk_message_id,
          email_template_id,
        } : { bulk_message_id },
      }));
      
      const oldResult = await supabaseClient
        .from("notifications")
        .insert(oldFormatNotifications)
        .select();
        
      if (oldResult.error) {
        console.error("Error creating notifications with old format:", oldResult.error);
        console.error("Full error:", JSON.stringify(oldResult.error, null, 2));
        // Don't throw - we'll still update the bulk message status
      } else {
        notificationsSent = oldResult.data?.length || oldFormatNotifications.length;
        console.log(`Successfully created ${notificationsSent} notifications using old schema format`);
        notifError = null; // Clear error since old format worked
      }
    } else {
      notificationsSent = insertedNotifications?.length || notifications.length;
      console.log(`Successfully created ${notificationsSent} notifications using new schema format`);
    }

    // Send emails if template is provided
    if (emailTemplate) {
      // Fetch user emails and student data
      const { data: { users }, error: usersError } = await supabaseClient.auth.admin.listUsers();

      if (!usersError && users) {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey) {
          const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@send.portal.urbanhub.uk";
          console.log(`Using from email: ${fromEmail}`);
          console.log(`Resend API Key present: ${resendApiKey ? "Yes" : "No"}`);
          console.log(`Resend API Key length: ${resendApiKey?.length || 0} characters`);
          console.log(`Resend API Key starts with: ${resendApiKey?.substring(0, 10) || "N/A"}...`);
          console.log(`Total recipients: ${studentIds.length}`);

          // Fetch student data for variable replacement
          // Get student names from application steps
          // First get applications for these students
          const { data: studentApplications } = await supabaseClient
            .from("student_applications")
            .select("id, student_id")
            .in("student_id", studentIds)
            .eq("status", "confirmed");

          const applicationIds = studentApplications?.map((app: any) => app.id) || [];
          const applicationToStudentMap = new Map<string, string>();
          studentApplications?.forEach((app: any) => {
            applicationToStudentMap.set(app.id, app.student_id);
          });

          // Then get step 1 data for these applications
          const { data: studentData } = applicationIds.length > 0
            ? await supabaseClient
                .from("student_application_steps")
                .select("application_id, payload")
                .eq("step_number", 1)
                .in("application_id", applicationIds)
            : { data: null, error: null };

          // Create a map of student_id -> student name
          const studentNameMap = new Map<string, string>();
          if (studentData) {
            studentData.forEach((step: any) => {
              const studentId = applicationToStudentMap.get(step.application_id);
              const payload = step.payload as any;
              if (studentId && payload?.first_name && payload?.last_name) {
                studentNameMap.set(studentId, `${payload.first_name} ${payload.last_name}`);
              }
            });
          }

          // Fetch application details for each student
          const { data: applicationDetails } = await supabaseClient
            .from("student_applications")
            .select(`
              id, 
              student_id, 
              assigned_studio_id,
              studios:assigned_studio_id(studio_number),
              contracts:contract_id(start_date, end_date)
            `)
            .in("student_id", studentIds)
            .eq("status", "confirmed");

          const applicationMap = new Map<string, any>();
          if (applicationDetails) {
            applicationDetails.forEach((app: any) => {
              applicationMap.set(app.student_id, app);
            });
          }

          // Function to replace template variables for a specific student
          const replaceVariables = (text: string, studentId: string): string => {
            if (!text) return "";
            
            let result = text;
            const studentName = studentNameMap.get(studentId) || "Student";
            const application = applicationMap.get(studentId);
            const studioNumber = application?.studios?.studio_number || "TBA";
            const contractStart = application?.contracts?.start_date 
              ? new Date(application.contracts.start_date).toLocaleDateString()
              : "TBA";
            const contractEnd = application?.contracts?.end_date
              ? new Date(application.contracts.end_date).toLocaleDateString()
              : "TBA";
            const applicationId = application?.id || "";
            // Use PORTAL_URL secret if available, otherwise construct from SUPABASE_URL
            const portalUrl = Deno.env.get("PORTAL_URL") || 
              `${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "") || "https://iskabookingportal.netlify.app"}/portal`;

            // Replace all template variables
            const replacements: Record<string, string> = {
              "{student_name}": studentName,
              "{title}": title,
              "{message}": message,
              "{date}": new Date().toLocaleDateString(),
              "{studio_number}": studioNumber,
              "{contract_start}": contractStart,
              "{contract_end}": contractEnd,
              "{application_id}": applicationId,
              "{portal_url}": portalUrl,
            };

            Object.entries(replacements).forEach(([key, value]) => {
              result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
            });

            return result;
          };

          // Send personalized emails to each student
          for (const studentId of studentIds) {
            const user = users.find((u) => u.id === studentId);
            if (!user?.email) {
              console.log(`Skipping student ${studentId} - no email found`);
              continue;
            }

            try {
            // Replace variables for this specific student
            const emailSubject = replaceVariables(emailTemplate.subject, studentId);
            let emailBodyHtml = replaceVariables(
              emailTemplate.body_html || emailTemplate.body_text || "",
              studentId
            );
            // Replace logo URL placeholder with actual logo URL
            // Use PORTAL_URL for logo URL, fallback to SUPABASE_URL
            const baseUrl = Deno.env.get("PORTAL_URL")?.replace("/portal", "") || 
              Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "") || 
              "https://iskabookingportal.netlify.app";
            const logoUrl = `${baseUrl}/storage/v1/object/public/studio-media/favicon.png`;
            emailBodyHtml = emailBodyHtml.replace(/{logo_url}/g, logoUrl);
            
            const emailBodyText = replaceVariables(
              emailTemplate.body_text || emailTemplate.body_html?.replace(/<[^>]*>/g, "") || "",
              studentId
            );

              // Format from email properly (Resend accepts both formats, but let's be explicit)
              const formattedFromEmail = fromEmail.includes("<") ? fromEmail : `Urban Hub Management <${fromEmail}>`;
              
              console.log(`Attempting to send email to ${user.email} from ${formattedFromEmail}`);
              console.log(`Email subject: ${emailSubject.substring(0, 50)}...`);
              
              // Prepare email payload
              const emailPayload = {
                from: formattedFromEmail,
                to: user.email,
                subject: emailSubject,
                html: emailBodyHtml,
                text: emailBodyText,
              };
              
              console.log(`Sending email payload:`, JSON.stringify({
                from: emailPayload.from,
                to: emailPayload.to,
                subject: emailPayload.subject.substring(0, 50),
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
              console.log(`Resend API response type: ${resendResponse.headers.get("content-type")}`);
              console.log(`Resend API response length: ${responseText.length} characters`);
              
              // Check if response is HTML (error page) instead of JSON
              if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
                console.error(`✗ Resend API returned HTML instead of JSON for ${user.email}`);
                console.error(`This usually indicates an authentication error or API endpoint issue`);
                console.error(`Response preview: ${responseText.substring(0, 1000)}`);
                // Don't increment emailsSent, continue to next email
                continue;
              }

              if (resendResponse.ok) {
                try {
                  const responseData = JSON.parse(responseText);
                  emailsSent++;
                  console.log(`✓ Email sent successfully to ${user.email} (ID: ${responseData.id || "N/A"})`);
                  if (emailsSent % 10 === 0) {
                    console.log(`Sent ${emailsSent} emails so far...`);
                  }
                } catch (parseError) {
                  console.error(`✗ Error parsing response for ${user.email}:`, parseError);
                  console.error(`Response text (first 500 chars): ${responseText.substring(0, 500)}`);
                }
              } else {
                try {
                  const errorData = JSON.parse(responseText);
                  console.error(`✗ Resend API error for ${user.email}:`, JSON.stringify(errorData, null, 2));
                  console.error(`Response status: ${resendResponse.status}`);
                } catch (parseError) {
                  console.error(`✗ Error parsing error response for ${user.email}:`, parseError);
                  console.error(`Response is not valid JSON. First 1000 chars: ${responseText.substring(0, 1000)}`);
                  console.error(`Response status: ${resendResponse.status}`);
                  console.error(`Content-Type: ${resendResponse.headers.get("content-type")}`);
                }
              }
            } catch (emailError) {
              console.error(`✗ Exception sending email to student ${studentId} (${user.email}):`, emailError);
            }
          }

          console.log(`Successfully sent ${emailsSent} personalized emails`);
        } else {
          console.warn("RESEND_API_KEY not configured, skipping email sending");
        }
      }
    }

    // Update bulk message with results
    await supabaseClient
      .from("bulk_messages")
      .update({
        status: "completed",
        total_recipients: studentIds.length,
        notifications_sent: notificationsSent,
        emails_sent: emailsSent,
        completed_at: new Date().toISOString(),
      })
      .eq("id", bulk_message_id);

    return new Response(
      JSON.stringify({
        message: "Bulk message sent successfully",
        recipients: studentIds.length,
        notifications_sent: notificationsSent,
        emails_sent: emailsSent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-bulk-message function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

