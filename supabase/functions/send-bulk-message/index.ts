import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { resolvePortalUrl } from "../_shared/recovery-link.ts";
import {
  computeDaysOverdue,
  filterPaymentInstallmentsForReminders,
  formatDueDateForEmail,
  formatGbpAmount,
  type PaymentDueWithinDays,
  type PaymentInstallmentRow,
  type PaymentReminderStatus,
} from "../_shared/payment-due-window.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  // Log immediately when function is called
  console.log("🚀 send-bulk-message function called");
  console.log("Request method:", req.method);

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

    // Parse request body
    const requestBody = await req.json();
    console.log("📥 Raw request body:", JSON.stringify(requestBody, null, 2));

    const {
      mode = "bulk",
      bulk_message_id,
      title,
      message,
      notification_type = "info",
      email_template_id,
      filters = {},
    } = requestBody;

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

    // DEBUG: Log incoming request
    console.log("=== 🔍 DEBUG: Request received ===");
    console.log("Mode:", mode);
    console.log("Mode type:", typeof mode);
    console.log("Mode === 'targeted':", mode === "targeted");
    console.log("Filters:", JSON.stringify(filters, null, 2));
    console.log("Filters type:", typeof filters);
    console.log("Filters is object:", filters && typeof filters === "object");

    // Check if this is a targeted message
    const filtersObject = (filters && typeof filters === "object") ? filters : {};
    const hasStudentIds = Array.isArray(filtersObject.student_ids) && filtersObject.student_ids.length > 0;
    const hasMessageType = filtersObject.message_type === "targeted";
    const isTargeted = mode === "targeted" || hasStudentIds || hasMessageType;

    console.log("=== DEBUG: Targeted check ===");
    console.log("hasStudentIds:", hasStudentIds, "student_ids:", filtersObject.student_ids);
    console.log("hasMessageType:", hasMessageType, "message_type:", filtersObject.message_type);
    console.log("mode === 'targeted':", mode === "targeted");
    console.log("isTargeted:", isTargeted);

    let filteredApplications: any[] = [];
    const hasStudentSelection = isTargeted && hasStudentIds;
    const paymentStatusRaw = filtersObject.payment_status;
    const hasPaymentFilter =
      paymentStatusRaw === "upcoming" || paymentStatusRaw === "overdue";
    const paymentInstallmentByStudent = new Map<string, PaymentInstallmentRow>();

    async function fetchAllInstallmentRows(): Promise<PaymentInstallmentRow[]> {
      const pageSize = 1000;
      let offset = 0;
      const allRows: PaymentInstallmentRow[] = [];
      while (true) {
        const { data, error } = await supabaseClient
          .from("upcoming_and_paid_installments_report")
          .select("*")
          .order("due_date", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const pageRows = (data || []) as PaymentInstallmentRow[];
        allRows.push(...pageRows);
        if (pageRows.length < pageSize) break;
        offset += pageSize;
      }
      return allRows;
    }

    async function resolvePaymentRecipients(): Promise<PaymentInstallmentRow[]> {
      const paymentStatus = paymentStatusRaw as PaymentReminderStatus;
      let dueWithinDays: PaymentDueWithinDays | null = null;
      if (paymentStatus === "upcoming") {
        const rawDays = Number(filtersObject.payment_due_within_days);
        if (rawDays === 7 || rawDays === 14 || rawDays === 30) {
          dueWithinDays = rawDays;
        } else {
          dueWithinDays = 14;
        }
      }
      const academicYearId = Array.isArray(filtersObject.academic_year_id)
        ? filtersObject.academic_year_id[0]
        : filtersObject.academic_year_id || null;

      const rows = await fetchAllInstallmentRows();
      return filterPaymentInstallmentsForReminders(rows, {
        paymentStatus,
        dueWithinDays,
        academicYearId: academicYearId || null,
      });
    }

    if (isTargeted) {
      console.log("=== DEBUG: TARGETED MESSAGE PATH ===");
      console.log(
        hasStudentSelection
          ? `Targeted message: Sending to ${filtersObject.student_ids.length} specific students`
          : "Targeted message: Sending to students matching filters",
      );

      let query = supabaseClient
        .from("student_applications")
        .select("id, student_id, status, contract_id, assigned_studio_id, studio_grade_id");

      if (hasStudentSelection) {
        console.log("=== DEBUG: Filtering by student_ids ===");
        console.log("student_ids to filter:", filtersObject.student_ids);
        query = query.in("student_id", filtersObject.student_ids);
      }

      // Apply status filter if provided
      if (filtersObject.application_status && Array.isArray(filtersObject.application_status) && filtersObject.application_status.length > 0) {
        console.log("=== DEBUG: Filtering by application_status ===", filtersObject.application_status);
        query = query.in("status", filtersObject.application_status);
      }

      // Filter by contract_id directly if possible
      if (filtersObject.contract_id) {
        if (typeof filtersObject.contract_id === "string") {
          query = query.eq("contract_id", filtersObject.contract_id);
        } else if (Array.isArray(filtersObject.contract_id) && filtersObject.contract_id.length > 0) {
          query = query.in("contract_id", filtersObject.contract_id);
        }
      }

      // Filter by studio_grade_id directly if available
      if (filtersObject.studio_grade_id) {
        if (typeof filtersObject.studio_grade_id === "string") {
          query = query.eq("studio_grade_id", filtersObject.studio_grade_id);
        } else if (Array.isArray(filtersObject.studio_grade_id) && filtersObject.studio_grade_id.length > 0) {
          query = query.in("studio_grade_id", filtersObject.studio_grade_id);
        }
      }

      const { data: applications, error: appsError } = await query;

      console.log("=== DEBUG: Query results ===");
      console.log("Applications found:", applications?.length || 0);
      console.log("Applications:", JSON.stringify(applications?.map(a => ({ id: a.id, student_id: a.student_id, status: a.status })), null, 2));

      if (appsError) {
        console.error("Error fetching applications for targeted message:", appsError);
        throw appsError;
      }

      filteredApplications = applications || [];
    } else {
      // BULK: Original behavior - only confirmed students (preserve existing functionality)
      console.log("=== DEBUG: BULK MESSAGE PATH ===");
      console.log("Bulk message: Sending to all confirmed students");
      
      let query = supabaseClient
        .from("student_applications")
        .select("id, student_id, status, contract_id, assigned_studio_id, studio_grade_id")
        .eq("status", "confirmed");

      // Apply filters if provided (for backward compatibility)
      if (filtersObject && typeof filtersObject === "object") {
        // Filter by contract_id
        if (filtersObject.contract_id) {
          if (typeof filtersObject.contract_id === "string") {
            query = query.eq("contract_id", filtersObject.contract_id);
          } else if (Array.isArray(filtersObject.contract_id) && filtersObject.contract_id.length > 0) {
            query = query.in("contract_id", filtersObject.contract_id);
          }
        }
        
        // Filter by studio_grade_id
        if (filtersObject.studio_grade_id) {
          if (typeof filtersObject.studio_grade_id === "string") {
            query = query.eq("studio_grade_id", filtersObject.studio_grade_id);
          } else if (Array.isArray(filtersObject.studio_grade_id) && filtersObject.studio_grade_id.length > 0) {
            query = query.in("studio_grade_id", filtersObject.studio_grade_id);
          }
        }
      }

      const { data: applications, error: appsError } = await query;
      
      if (appsError) {
        console.error("Error fetching applications:", appsError);
        throw appsError;
      }

      filteredApplications = applications || [];
    }
    
    // Apply post-query filters for complex joins (works for both bulk and targeted)
    if (filtersObject && typeof filtersObject === "object" && filteredApplications.length > 0) {
      // Filter by studio_grade_id (if not already filtered in query)
      if (filtersObject.studio_grade_id && Array.isArray(filtersObject.studio_grade_id) && filtersObject.studio_grade_id.length > 0) {
        // Only filter if we need to check via assigned_studio_id -> studios
        const studioIds = filteredApplications
          .map((app) => app.assigned_studio_id)
          .filter(Boolean) as string[];
        
        if (studioIds.length > 0) {
          const { data: studios } = await supabaseClient
            .from("studios")
            .select("id, studio_grade_id")
            .in("id", studioIds)
            .in("studio_grade_id", filtersObject.studio_grade_id);
          
          const matchingStudioIds = new Set(studios?.map((s) => s.id) || []);
          filteredApplications = filteredApplications.filter((app) =>
            app.assigned_studio_id && matchingStudioIds.has(app.assigned_studio_id),
          );
        } else {
          filteredApplications = [];
        }
      }
      
      // Filter by academic_year_id
      if (filtersObject.academic_year_id) {
        const academicYearIds = Array.isArray(filtersObject.academic_year_id) 
          ? filtersObject.academic_year_id 
          : [filtersObject.academic_year_id];
        
        if (academicYearIds.length > 0) {
          const contractIds = filteredApplications
            .map((app) => app.contract_id)
            .filter(Boolean) as string[];
          
          if (contractIds.length > 0) {
            const { data: contracts } = await supabaseClient
              .from("contracts")
              .select("id, academic_year_id")
              .in("id", contractIds)
              .in("academic_year_id", academicYearIds);
            
            const matchingContractIds = new Set(contracts?.map((c) => c.id) || []);
            filteredApplications = filteredApplications.filter((app) =>
              app.contract_id && matchingContractIds.has(app.contract_id),
            );
          } else {
            filteredApplications = [];
          }
        }
      }

      // Filter by application status (for targeted messages)
      if (isTargeted && filtersObject.application_status && Array.isArray(filtersObject.application_status) && filtersObject.application_status.length > 0) {
        filteredApplications = filteredApplications.filter((app) =>
          filtersObject.application_status.includes(app.status),
        );
      }
    }

    console.log(`=== DEBUG: After post-query filters ===`);
    console.log(`Found ${filteredApplications.length} applications after applying filters`);

    // Get student IDs - for targeted messages with student selection, ALWAYS use the provided student_ids
    let studentIds: string[] = [];

    // Payment-due targeting: resolve from upcoming_and_paid_installments_report
    if (isTargeted && hasPaymentFilter) {
      console.log("=== DEBUG: PAYMENT FILTER PATH ===", {
        payment_status: paymentStatusRaw,
        payment_due_within_days: filtersObject.payment_due_within_days,
      });
      const paymentRows = await resolvePaymentRecipients();
      for (const row of paymentRows) {
        paymentInstallmentByStudent.set(row.student_id, row);
      }
      const paymentStudentIds = paymentRows.map((r) => r.student_id).filter(Boolean);
      console.log(`Payment filter matched ${paymentStudentIds.length} students`);

      if (hasStudentIds) {
        const selected = new Set(filtersObject.student_ids.filter(Boolean));
        studentIds = paymentStudentIds.filter((id) => selected.has(id));
      } else if (
        (filtersObject.application_status &&
          Array.isArray(filtersObject.application_status) &&
          filtersObject.application_status.length > 0) ||
        (filtersObject.studio_grade_id &&
          ((typeof filtersObject.studio_grade_id === "string" && filtersObject.studio_grade_id) ||
            (Array.isArray(filtersObject.studio_grade_id) &&
              filtersObject.studio_grade_id.length > 0))) ||
        (filtersObject.contract_id &&
          ((typeof filtersObject.contract_id === "string" && filtersObject.contract_id) ||
            (Array.isArray(filtersObject.contract_id) && filtersObject.contract_id.length > 0)))
      ) {
        // Intersect with application-filter results (academic year already applied in payment resolve)
        const appStudentIds = new Set(
          filteredApplications.map((app) => app.student_id).filter(Boolean),
        );
        studentIds = paymentStudentIds.filter((id) => appStudentIds.has(id));
      } else {
        studentIds = paymentStudentIds;
      }

      // Studio grade may not have been applied via application query when only payment filters set
      if (
        filtersObject.studio_grade_id &&
        Array.isArray(filtersObject.studio_grade_id) &&
        filtersObject.studio_grade_id.length > 0 &&
        studentIds.length > 0 &&
        !(
          filtersObject.application_status?.length ||
          filtersObject.contract_id?.length ||
          hasStudentIds
        )
      ) {
        const { data: appsForGrade } = await supabaseClient
          .from("student_applications")
          .select("student_id, studio_grade_id, assigned_studio_id")
          .in("student_id", studentIds);
        const gradeIds = filtersObject.studio_grade_id as string[];
        const matching = new Set<string>();
        for (const app of appsForGrade || []) {
          if (app.studio_grade_id && gradeIds.includes(app.studio_grade_id)) {
            matching.add(app.student_id);
          }
        }
        const needsStudio = (appsForGrade || []).filter(
          (a) => !a.studio_grade_id && a.assigned_studio_id && !matching.has(a.student_id),
        );
        if (needsStudio.length > 0) {
          const studioIds = needsStudio.map((a) => a.assigned_studio_id!).filter(Boolean);
          const { data: studios } = await supabaseClient
            .from("studios")
            .select("id, studio_grade_id")
            .in("id", studioIds)
            .in("studio_grade_id", gradeIds);
          const matchingStudios = new Set((studios || []).map((s) => s.id));
          for (const app of needsStudio) {
            if (app.assigned_studio_id && matchingStudios.has(app.assigned_studio_id)) {
              matching.add(app.student_id);
            }
          }
        }
        studentIds = studentIds.filter((id) => matching.has(id));
        for (const id of [...paymentInstallmentByStudent.keys()]) {
          if (!matching.has(id)) paymentInstallmentByStudent.delete(id);
        }
      }

      console.log(`Final payment-targeted student count: ${studentIds.length}`);
    } else if (isTargeted && hasStudentIds) {
      console.log("=== DEBUG: TARGETED with student_ids ===");
      console.log("Provided student_ids:", filtersObject.student_ids);
      console.log("Applications found:", filteredApplications.length);
      
      // For targeted messages with specific student selection, ALWAYS use the provided student_ids
      // This ensures we send to the selected students even if they don't have applications
      studentIds = filtersObject.student_ids.filter(Boolean);
      console.log("Final student_ids to send to:", studentIds);
    } else if (isTargeted) {
      // Targeted message with filters only (no specific student selection)
      console.log("=== DEBUG: TARGETED with filters only ===");
      studentIds = [...new Set(filteredApplications.map((app) => app.student_id).filter(Boolean))];
      console.log("Student IDs from filtered applications:", studentIds);
    } else {
      // Bulk message - only use students with applications
      if (filteredApplications.length === 0) {
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
      studentIds = [...new Set(filteredApplications.map((app) => app.student_id).filter(Boolean))];
    }
    
    console.log(`=== DEBUG: Final student list ===`);
    console.log(`Sending to ${studentIds.length} unique students`);
    console.log("Student IDs:", studentIds);
    
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
        // Get branding settings (company name)
        const { data: brandingSettings } = await supabaseClient
          .from("branding_settings")
          .select("setting_value")
          .eq("setting_key", "company_name")
          .single();
        const companyName = brandingSettings?.setting_value || "Urban Hub";

        // Get Resend credentials from database (fallback to env vars)
        const { data: credentials } = await supabaseClient
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

        if (resendApiKey) {
          console.log(`Using from email: ${fromEmail}`);
          console.log(`Resend API Key present: ${resendApiKey ? "Yes" : "No"}`);
          console.log(`Resend API Key length: ${resendApiKey?.length || 0} characters`);
          console.log(`Resend API Key starts with: ${resendApiKey?.substring(0, 10) || "N/A"}...`);
          console.log(`Total recipients: ${studentIds.length}`);

          // Fetch student data for variable replacement
          // Get student names from application steps
          // First get applications for these students
          let studentApplicationsQuery = supabaseClient
            .from("student_applications")
            .select("id, student_id")
            .in("student_id", studentIds);
          // Payment reminders include committed-sale statuses beyond confirmed
          if (!hasPaymentFilter) {
            studentApplicationsQuery = studentApplicationsQuery.eq("status", "confirmed");
          }
          const { data: studentApplications } = await studentApplicationsQuery;

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
          let applicationDetailsQuery = supabaseClient
            .from("student_applications")
            .select(`
              id, 
              student_id, 
              assigned_studio_id,
              studios:assigned_studio_id(studio_number),
              contracts:contract_id(start_date, end_date)
            `)
            .in("student_id", studentIds);
          if (!hasPaymentFilter) {
            applicationDetailsQuery = applicationDetailsQuery.eq("status", "confirmed");
          }
          const { data: applicationDetails } = await applicationDetailsQuery;

          const applicationMap = new Map<string, any>();
          if (applicationDetails) {
            applicationDetails.forEach((app: any) => {
              applicationMap.set(app.student_id, app);
            });
          }

          const portalBaseUrl = await resolvePortalUrl(supabaseClient);
          const portalAppUrl = `${portalBaseUrl}/portal`;

          // Function to replace template variables for a specific student
          // Uses comprehensive replacement logic consistent with other email functions
          const replaceVariables = (text: string, studentId: string): string => {
            if (!text) return "";
            
            let result = text;
            const installment = paymentInstallmentByStudent.get(studentId);
            const studentName =
              studentNameMap.get(studentId) ||
              installment?.student_name ||
              "Student";
            const application = applicationMap.get(studentId);
            const studioNumber = application?.studios?.studio_number || "TBA";
            const contractStart = application?.contracts?.start_date 
              ? new Date(application.contracts.start_date).toLocaleDateString()
              : "TBA";
            const contractEnd = application?.contracts?.end_date
              ? new Date(application.contracts.end_date).toLocaleDateString()
              : "TBA";
            const applicationId = application?.id || installment?.application_id || "";
            const portalUrl = portalAppUrl;
            const paymentUrl = `${portalBaseUrl}/portal/payments`;

            const amountValue = installment
              ? Number(installment.amount_remaining ?? installment.amount ?? 0)
              : 0;
            const dueDateRaw = installment?.due_date || "";

            // Build comprehensive variables object (keys without braces for flexible replacement)
            const vars: Record<string, string> = {
              student_name: studentName,
              title: title,
              message: message,
              date: new Date().toLocaleDateString(),
              studio_number: studioNumber,
              contract_start: contractStart,
              contract_end: contractEnd,
              application_id: applicationId,
              portal_url: portalUrl,
              payment_url: paymentUrl,
              company_name: companyName,
              COMPANY_NAME: companyName.toUpperCase(),
              current_year: new Date().getFullYear().toString(),
              amount: installment ? formatGbpAmount(amountValue) : "",
              due_date: dueDateRaw ? formatDueDateForEmail(dueDateRaw) : "",
              installment_number: installment
                ? String(installment.sequence ?? installment.installment_label ?? "")
                : "",
              days_overdue:
                installment && installment.status === "overdue" && dueDateRaw
                  ? computeDaysOverdue(dueDateRaw)
                  : "",
            };

            // Comprehensive replacement function - runs multiple passes to catch all variations
            // Supports both {variable} and [variable] formats, case-insensitive
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

          // Helper function to delay execution (for rate limiting)
          const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

          // Helper function to send email with retry logic for rate limiting
          const sendEmailWithRetry = async (
            emailPayload: any,
            userEmail: string,
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

                const responseText = await resendResponse.text();
                
                // Check if response is HTML (error page) instead of JSON
                if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
                  console.error(`✗ Resend API returned HTML instead of JSON for ${userEmail}`);
                  console.error(`Response preview: ${responseText.substring(0, 1000)}`);
                  return false;
                }

                if (resendResponse.ok) {
                  try {
                    const responseData = JSON.parse(responseText);
                    console.log(`✓ Email sent successfully to ${userEmail} (ID: ${responseData.id || "N/A"})`);
                    return true;
                  } catch (parseError) {
                    console.error(`✗ Error parsing response for ${userEmail}:`, parseError);
                    return false;
                  }
                } else {
                  try {
                    const errorData = JSON.parse(responseText);
                    
                    // Handle rate limiting (429) with exponential backoff
                    if (resendResponse.status === 429) {
                      const retryAfter = resendResponse.headers.get("retry-after");
                      const waitTime = retryAfter 
                        ? parseInt(retryAfter) * 1000 
                        : Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
                      
                      console.warn(`⚠ Rate limit hit for ${userEmail}. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                      await delay(waitTime);
                      continue; // Retry
                    }
                    
                    // For other errors, log and return false
                    console.error(`✗ Resend API error for ${userEmail}:`, JSON.stringify(errorData, null, 2));
                    console.error(`Response status: ${resendResponse.status}`);
                    return false;
                  } catch (parseError) {
                    console.error(`✗ Error parsing error response for ${userEmail}:`, parseError);
                    return false;
                  }
                }
              } catch (fetchError) {
                console.error(`✗ Network error sending email to ${userEmail} (attempt ${attempt + 1}):`, fetchError);
                if (attempt < maxRetries - 1) {
                  await delay(1000 * Math.pow(2, attempt)); // Exponential backoff
                }
              }
            }
            return false; // All retries failed
          };

          // Send personalized emails to each student with rate limiting
          // Resend allows 2 requests per second, so we'll send at max 1.5 per second (650ms delay) to be safe
          const RATE_LIMIT_DELAY_MS = 650; // Slightly less than 500ms to account for processing time
          
          console.log(`Starting to send ${studentIds.length} emails with rate limiting (${RATE_LIMIT_DELAY_MS}ms delay between emails)`);
          
          for (let i = 0; i < studentIds.length; i++) {
            const studentId = studentIds[i];
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
              
              // Debug logging for first email (to verify company_name replacement)
              if (i === 0) {
                console.log("=== EMAIL TEMPLATE REPLACEMENT (First Email) ===");
                console.log("Company name value:", companyName);
                console.log("Company name type:", typeof companyName);
                console.log("Template subject (before):", emailTemplate.subject);
                console.log("Template subject (after):", emailSubject);
                console.log("Template body_html contains {company_name}:", (emailTemplate.body_html || "").includes("{company_name}"));
                console.log("Template body_html contains {COMPANY_NAME}:", (emailTemplate.body_html || "").includes("{COMPANY_NAME}"));
                console.log("Replaced body_html contains {company_name}:", emailBodyHtml.includes("{company_name}"));
                console.log("Replaced body_html contains {COMPANY_NAME}:", emailBodyHtml.includes("{COMPANY_NAME}"));
                console.log("=== END REPLACEMENT ===");
              }
              
              // Replace logo URL placeholder with actual logo URL
              const baseUrl = portalBaseUrl;
              const logoUrl = `${baseUrl}/storage/v1/object/public/studio-media/favicon.png`;
              emailBodyHtml = emailBodyHtml.replace(/{logo_url}/gi, logoUrl);
              
              const emailBodyText = replaceVariables(
                emailTemplate.body_text || emailTemplate.body_html?.replace(/<[^>]*>/g, "") || "",
                studentId
              );

              // Format from email properly
              const formattedFromEmail = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;
              
              // Prepare email payload
              const emailPayload = {
                from: formattedFromEmail,
                to: user.email,
                subject: emailSubject,
                html: emailBodyHtml,
                text: emailBodyText,
              };
              
              // Send email with retry logic
              const success = await sendEmailWithRetry(emailPayload, user.email);
              
              if (success) {
                emailsSent++;
                // Log progress every 10 emails
                if (emailsSent % 10 === 0) {
                  console.log(`Progress: Sent ${emailsSent}/${studentIds.length} emails (${Math.round(emailsSent / studentIds.length * 100)}%)`);
                }
              }
              
              // Rate limiting: Wait before sending next email (except for the last one)
              if (i < studentIds.length - 1) {
                await delay(RATE_LIMIT_DELAY_MS);
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

