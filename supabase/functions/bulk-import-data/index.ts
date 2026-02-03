import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

interface ImportRequest {
  import_type:
    | "academic_years"
    | "studio_grades"
    | "studios"
    | "studio_grade_prices"
    | "payment_plans"
    | "payment_plan_installments"
    | "contracts"
    | "partners"
    | "cashback_campaigns"
    | "applications"
    | "ota_bookings";
  csv_data: string; // CSV content as string
  file_name?: string;
  options?: {
    validate_only?: boolean;
    skip_duplicates?: boolean;
    dry_run?: boolean;
    create_users?: boolean; // For applications: create users if they don't exist
    send_welcome_email?: boolean; // For applications: send password reset email
  };
}

const OTA_CHANNELS = ["airbnb", "booking", "agoda", "expedia", "other"];
const OTA_STATUSES = [
  "arriving", "expected_arrivals", "pre_check_in", "checked_in", "in_house_guest",
  "day_use", "checked_out", "expected_departures", "departing", "no_show", "cancelled",
];

// CSV parsing function - handles quoted fields with commas
function parseCSV(csvText: string): Record<string, string>[] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  // Parse lines handling multi-line quoted fields
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (not in quotes)
      if (currentLine.trim().length > 0) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }

  // Add last line if exists
  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim());
  }

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() ?? "";
    });
    rows.push(row);
  }

  return rows;
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentValue += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator (not in quotes)
      values.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += char;
    }
  }

  // Add last value
  values.push(currentValue.trim());

  return values;
}

// Convert CSV rows to JSONB array
function rowsToJsonb(rows: Record<string, string>[]): any[] {
  return rows.map((row) => {
    const jsonRow: any = {};
    Object.keys(row).forEach((key) => {
      const value = row[key];
      if (value === "" || value === null || value === undefined) {
        jsonRow[key] = null;
      } else {
        jsonRow[key] = value;
      }
    });
    return jsonRow;
  });
}

// Generate random password for new users
function generateRandomPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Create or find user for application import
async function ensureUserExists(
  email: string,
  firstName: string,
  lastName: string,
  createUsers: boolean,
  sendWelcomeEmail: boolean
): Promise<{ userId: string; created: boolean; isPlaceholder?: boolean } | null> {
  // Clean email: remove quotes, trim, lowercase
  let normalizedEmail = email
    ?.toString()
    .replace(/^["']+|["']+$/g, "") // Remove surrounding quotes (single or double)
    .replace(/["']/g, "") // Remove any remaining quotes
    .trim()
    .toLowerCase();

  // Validate email format - more permissive regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
    throw new Error(`Invalid email format: ${email} (normalized: ${normalizedEmail})`);
  }
  
  // Additional validation: ensure no whitespace or special characters that could cause issues
  if (normalizedEmail.includes(" ") || normalizedEmail.includes("\n") || normalizedEmail.includes("\r")) {
    throw new Error(`Invalid email: contains whitespace: ${email}`);
  }

  // Check if user exists - use listUsers and filter by email
  // Note: getUserByEmail doesn't exist in this Supabase JS version
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (listError) {
    console.error(`Error listing users:`, listError);
    throw new Error(`Failed to check if user exists: ${listError.message}`);
  }

  const existingUser = users?.find((u) => u.email?.toLowerCase() === normalizedEmail);

  if (existingUser) {
    console.log(`User already exists: ${normalizedEmail} (${existingUser.id})`);
    
    // Ensure profile exists (upsert to handle cases where profile was deleted)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: existingUser.id,
        first_name: firstName || null,
        last_name: lastName || null,
        role: "student",
      }, {
        onConflict: "id"
      });

    if (profileError) {
      console.error(`Failed to upsert profile for ${normalizedEmail}:`, profileError);
      // Don't fail - profile might exist, just log the error
    }
    
    // Update account_status to pending_activation if it's not already set or if it's an old import
    // This ensures bulk imported users start as pending
    const currentMetadata = (existingUser.user_metadata as any) || {};
    if (!currentMetadata.account_status || currentMetadata.account_status === "active") {
      try {
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            ...currentMetadata,
            account_status: "pending_activation",
            imported_at: new Date().toISOString(),
          },
        });
      } catch (updateError) {
        console.warn(`Failed to update user metadata for ${normalizedEmail}:`, updateError);
        // Don't fail - continue with existing metadata
      }
    }
    
    return { userId: existingUser.id, created: false };
  }

  if (!createUsers) {
    throw new Error(`User with email ${normalizedEmail} does not exist and user creation is disabled`);
  }

  // Create new user (placeholder if sendWelcomeEmail is false)
  const tempPassword = generateRandomPassword();
  console.log(`Attempting to create user: ${normalizedEmail}`);
  
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: tempPassword,
    email_confirm: true, // Mark email as verified for historical imports
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      account_status: sendWelcomeEmail ? "active" : "pending_activation", // Placeholder flag
      imported_at: new Date().toISOString(),
    },
  });

  if (createError) {
    console.error(`User creation error for ${normalizedEmail}:`, createError);
    throw new Error(`Failed to create user ${normalizedEmail}: ${createError.message || "Unknown error"}`);
  }

  if (!newUser?.user) {
    console.error(`User creation returned no user for ${normalizedEmail}`);
    throw new Error(`Failed to create user ${normalizedEmail}: User object is null`);
  }

  console.log(`User created successfully: ${newUser.user.id} for ${normalizedEmail}`);

  // Update profile
  await supabaseAdmin
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      role: "student",
    })
    .eq("id", newUser.user.id);

  // Send password reset email if requested (only for immediate activation)
  if (sendWelcomeEmail) {
    try {
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: normalizedEmail,
      });
      // Note: The link generation sends the email automatically
      // Update metadata to indicate invitation sent
      await supabaseAdmin.auth.admin.updateUserById(newUser.user.id, {
        user_metadata: {
          ...newUser.user.user_metadata,
          account_status: "invited",
          invitation_sent_at: new Date().toISOString(),
        },
      });
    } catch (emailError) {
      console.warn(`Failed to send welcome email to ${normalizedEmail}:`, emailError);
      // Don't fail the import if email fails
    }
  }

  return { userId: newUser.user.id, created: true, isPlaceholder: !sendWelcomeEmail };
}

// Map import type to database function name
function getFunctionName(importType: string): string {
  const functionMap: Record<string, string> = {
    academic_years: "bulk_import_academic_years",
    studio_grades: "bulk_import_studio_grades",
    studios: "bulk_import_studios",
    studio_grade_prices: "bulk_import_studio_grade_prices",
    payment_plans: "bulk_import_payment_plans",
    payment_plan_installments: "bulk_import_payment_plan_installments",
    contracts: "bulk_import_contracts",
    partners: "bulk_import_partners",
    cashback_campaigns: "bulk_import_cashback_campaigns",
    applications: "bulk_import_student_applications",
  };
  return functionMap[importType] || "";
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
    let requestBody: ImportRequest;
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

    const { import_type, csv_data, file_name, options } = requestBody;

    if (!import_type || !csv_data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: import_type, csv_data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate import type
    const validTypes = [
      "academic_years",
      "studio_grades",
      "studios",
      "studio_grade_prices",
      "payment_plans",
      "payment_plan_installments",
      "contracts",
      "partners",
      "cashback_campaigns",
      "applications",
      "ota_bookings",
    ];

    if (!validTypes.includes(import_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid import_type: ${import_type}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create import history record
    const { data: importHistory, error: historyError } = await supabaseAdmin
      .from("import_history")
      .insert({
        imported_by: user.id,
        import_type,
        file_name: file_name || "unknown.csv",
        total_rows: 0,
        status: "processing",
      })
      .select()
      .single();

    if (historyError) {
      console.error("Error creating import history:", historyError);
    }

    const importHistoryId = importHistory?.id;

    try {
      // Parse CSV
      const rows = parseCSV(csv_data);
      let jsonbData = rowsToJsonb(rows);

      // Track pre-import failures (user creation errors, etc.)
      let preImportFailedRows: Array<{ row: any; reason: string; email?: string }> = [];
      let userCreationErrors: Array<{ email: string; error: string }> = [];

      // Special handling for applications: create users first
      if (import_type === "applications") {
        const createUsers = options?.create_users !== false; // Default to true
        // For bulk imports, default to NOT sending emails (create placeholders)
        // Admin can send invitations later via bulk invitation system
        const sendWelcomeEmail = options?.send_welcome_email === true; // Default to false

        // Create users for applications that don't have them
        const usersCreated: Record<string, string> = {};
        const usersCreatedCount = { count: 0 };
        userCreationErrors = [];

        for (const row of jsonbData) {
          // Clean email: remove quotes, trim, lowercase
          let email = row.email
            ?.toString()
            .replace(/^["']|["']$/g, "") // Remove surrounding quotes
            .replace(/["']/g, "") // Remove any remaining quotes
            .trim()
            .toLowerCase();
          
          if (!email) {
            userCreationErrors.push({
              email: row.email || "unknown",
              error: "Email is missing or invalid",
            });
            continue;
          }

          if (!usersCreated[email]) {
            try {
              console.log(`Creating user for email: ${email}`);
              const userResult = await ensureUserExists(
                email,
                row.first_name || "",
                row.last_name || "",
                createUsers,
                sendWelcomeEmail
              );

              if (userResult) {
                console.log(`User created/found for ${email}: ${userResult.userId}`);
                usersCreated[email] = userResult.userId;
                if (userResult.created) {
                  usersCreatedCount.count++;
                  // Small delay to ensure user is committed to database
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              } else {
                console.error(`User creation returned null for ${email}`);
                userCreationErrors.push({
                  email,
                  error: "User creation returned null (user may not exist and creation disabled)",
                });
              }
            } catch (userError: any) {
              const errorMessage = userError?.message || userError?.toString() || "Unknown error during user creation";
              console.error(`Failed to create user for ${email}:`, errorMessage);
              console.error(`Error type:`, typeof userError);
              console.error(`Error keys:`, userError ? Object.keys(userError) : 'null');
              userCreationErrors.push({
                email,
                error: errorMessage,
              });
              // Don't continue - fail this row
            }
          }
        }

        // Log user creation summary (continue even if there are errors)
        console.log(`User creation summary: ${usersCreatedCount.count} created, ${Object.keys(usersCreated).length} total, ${userCreationErrors.length} failed`);
        
        // Filter out rows with failed user creation - only import records with valid users
        const validRows: any[] = [];
        const failedRows: Array<{ row: any; reason: string; email?: string }> = [];
        // Note: failedRows will be assigned to preImportFailedRows later
        
        for (const row of jsonbData) {
          const email = row.email
            ?.toString()
            .replace(/^["']|["']$/g, "")
            .replace(/["']/g, "")
            .trim()
            .toLowerCase();
          
          if (!email || !email.includes("@")) {
            failedRows.push({
              row,
              reason: "Email is missing or invalid",
              email: row.email || "unknown",
            });
            continue;
          }
          
          if (!usersCreated[email]) {
            // Find the specific error for this email
            const error = userCreationErrors.find((e) => e.email.toLowerCase() === email);
            failedRows.push({
              row,
              reason: error?.error || "User creation failed",
              email,
            });
            continue;
          }
          
          // Add user_id to the row for the database function
          validRows.push({
            ...row,
            student_id: usersCreated[email],
          });
        }
        
        // Update jsonbData to only include valid rows
        jsonbData = validRows;
        
        console.log(`Filtered rows: ${validRows.length} valid, ${failedRows.length} failed`);
        
        // If all rows failed, return early with error details
        if (validRows.length === 0 && failedRows.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              partial: false,
              error: `All ${failedRows.length} record(s) failed user creation. No records imported.`,
              total_rows: jsonbData.length + failedRows.length,
              succeeded: 0,
              failed: failedRows.length,
              user_creation_errors: userCreationErrors,
              failed_records: failedRows.map((fr, idx) => ({
                row_number: idx + 1,
                email: fr.email,
                reason: fr.reason,
              })),
              import_history_id: importHistoryId,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        
        // Add a delay to ensure all users are committed to database
        if (validRows.length > 0) {
          console.log(`Waiting 1 second for users to be committed...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        
        // Store failed rows info for later inclusion in response
        preImportFailedRows = failedRows;
      }

      if (options?.dry_run || options?.validate_only) {
        // Return validation results without importing
        return new Response(
          JSON.stringify({
            success: true,
            dry_run: true,
            total_rows: rows.length,
            validated_rows: rows.length,
            import_history_id: importHistoryId,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // OTA bookings: handle in edge function (no RPC)
      if (import_type === "ota_bookings") {
        const skipDuplicates = options?.skip_duplicates !== false;
        const otaResults: Array<{ row_number: number; status: string; error_message?: string }> = [];
        let otaSucceeded = 0;
        let otaFailed = 0;

        for (let i = 0; i < jsonbData.length; i++) {
          const row = jsonbData[i];
          const rowNum = i + 1;

          const externalRef = (row.external_ref ?? "").toString().trim();
          const channel = ((row.channel ?? "").toString().trim().toLowerCase()) || "other";
          const guestName = (row.guest_name ?? "").toString().trim();
          const checkIn = (row.check_in ?? "").toString().trim();
          const checkOut = (row.check_out ?? "").toString().trim();

          if (!externalRef || !guestName || !checkIn || !checkOut) {
            otaResults.push({ row_number: rowNum, status: "error", error_message: "external_ref, guest_name, check_in, check_out are required" });
            otaFailed++;
            continue;
          }
          if (!OTA_CHANNELS.includes(channel)) {
            otaResults.push({ row_number: rowNum, status: "error", error_message: `channel must be one of: ${OTA_CHANNELS.join(", ")}` });
            otaFailed++;
            continue;
          }

          const status = (row.status ?? "arriving").toString().trim().toLowerCase() || "arriving";
          if (!OTA_STATUSES.includes(status)) {
            otaResults.push({ row_number: rowNum, status: "error", error_message: `Invalid status: ${status}` });
            otaFailed++;
            continue;
          }

          const checkInDate = new Date(checkIn);
          const checkOutDate = new Date(checkOut);
          if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
            otaResults.push({ row_number: rowNum, status: "error", error_message: "check_in and check_out must be valid dates (YYYY-MM-DD)" });
            otaFailed++;
            continue;
          }
          if (checkOutDate <= checkInDate) {
            otaResults.push({ row_number: rowNum, status: "error", error_message: "check_out must be after check_in" });
            otaFailed++;
            continue;
          }

          let studioId: string | null = null;
          const studioNumber = (row.studio_number ?? "").toString().trim();
          if (studioNumber) {
            const { data: studio } = await supabaseAdmin
              .from("studios")
              .select("id")
              .eq("studio_number", studioNumber)
              .maybeSingle();
            if (studio) studioId = studio.id;
          }

          const payload = {
            external_ref: externalRef,
            channel,
            guest_name: guestName,
            guest_phone: (row.guest_phone ?? "").toString().trim() || null,
            guest_email: (row.guest_email ?? "").toString().trim() || null,
            studio_id: studioId,
            check_in: checkIn,
            check_out: checkOut,
            status,
            notes: (row.notes ?? "").toString().trim() || null,
            internal_notes: (row.internal_notes ?? "").toString().trim() || null,
            price_per_night: row.price_per_night != null && row.price_per_night !== "" ? parseFloat(String(row.price_per_night)) : null,
            commission_amount: row.commission_amount != null && row.commission_amount !== "" ? parseFloat(String(row.commission_amount)) : null,
            currency: (row.currency ?? "GBP").toString().trim() || "GBP",
            created_by: user.id,
          };

          const { error: insertError } = await supabaseAdmin
            .from("ota_bookings")
            .insert(payload);

          if (insertError) {
            const isDuplicate = insertError.code === "23505" || (insertError.message && insertError.message.includes("unique") && insertError.message.includes("external_ref"));
            if (skipDuplicates && isDuplicate) {
              otaResults.push({ row_number: rowNum, status: "success" });
              otaSucceeded++;
            } else {
              otaResults.push({ row_number: rowNum, status: "error", error_message: insertError.message || "Insert failed" });
              otaFailed++;
            }
          } else {
            otaResults.push({ row_number: rowNum, status: "success" });
            otaSucceeded++;
          }
        }

        const totalFailed = otaFailed + preImportFailedRows.length;
        const allFailedRecords = [
          ...preImportFailedRows.map((fr: any, idx: number) => ({ row_number: idx + 1, email: fr.email, reason: fr.reason, stage: "user_creation" })),
          ...otaResults.filter((r: any) => r.status === "error").map((e: any) => ({ row_number: e.row_number, error: e.error_message, reason: e.error_message, stage: "database_import" })),
        ];
        const isPartialSuccess = otaSucceeded > 0 && totalFailed > 0;

        if (importHistoryId) {
          await supabaseAdmin
            .from("import_history")
            .update({
              total_rows: rows.length,
              succeeded: otaSucceeded,
              failed: totalFailed,
              status: otaSucceeded === 0 ? "failed" : isPartialSuccess ? "partial" : "completed",
              completed_at: new Date().toISOString(),
              report: { total_rows: rows.length, succeeded: otaSucceeded, failed: totalFailed, pre_import_failed: preImportFailedRows.length, import_failed: otaFailed },
              errors: allFailedRecords,
            })
            .eq("id", importHistoryId);
        }

        await supabaseAdmin
          .from("staff_activity_logs")
          .insert({
            staff_id: user.id,
            action: "import",
            entity_type: import_type,
            entity_id: null,
            payload: { import_type, file_name: file_name || "unknown.csv", total_rows: rows.length, succeeded: otaSucceeded, failed: otaFailed, import_history_id: importHistoryId },
          });

        return new Response(
          JSON.stringify({
            success: true,
            partial: isPartialSuccess,
            total_rows: rows.length,
            succeeded: otaSucceeded,
            failed: totalFailed,
            pre_import_failed: preImportFailedRows.length,
            import_failed: otaFailed,
            results: otaResults,
            errors: allFailedRecords,
            user_creation_errors: userCreationErrors,
            import_history_id: importHistoryId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Call database function
      const functionName = getFunctionName(import_type);
      console.log(`Calling database function: ${functionName}`);
      console.log(`Data rows: ${jsonbData.length}`);
      
      const { data: results, error: functionError } = await supabaseAdmin.rpc(
        functionName,
        {
          p_data: jsonbData,
          p_imported_by: user.id,
        }
      );

      if (functionError) {
        console.error(`Database function error:`, functionError);
        console.error(`Error message:`, functionError.message);
        console.error(`Error details:`, functionError.details);
        console.error(`Error hint:`, functionError.hint);
        throw new Error(`Database function failed: ${functionError.message || "Unknown error"}`);
      }

      if (!results) {
        console.error(`Database function returned no results`);
        throw new Error("Database function returned no results");
      }

      console.log(`Database function returned ${results.length} results`);

      // Process results
      const succeeded = results?.filter((r: any) => r.status === "success").length || 0;
      const failed = results?.filter((r: any) => r.status === "error").length || 0;
      const errors = results?.filter((r: any) => r.status === "error").map((r: any) => ({
        row_number: r.row_number,
        error: r.error_message,
      })) || [];
      
      // Combine pre-import failures with database function failures
      const totalFailed = failed + preImportFailedRows.length;
      const allFailedRecords = [
        ...preImportFailedRows.map((fr, idx) => ({
          row_number: idx + 1,
          email: fr.email,
          reason: fr.reason,
          stage: "user_creation",
        })),
        ...errors.map((e) => ({
          ...e,
          stage: "database_import",
        })),
      ];
      
      const isPartialSuccess = succeeded > 0 && totalFailed > 0;

      // Update import history
      if (importHistoryId) {
        await supabaseAdmin
          .from("import_history")
          .update({
            total_rows: rows.length,
            succeeded,
            failed: totalFailed,
            status: succeeded === 0 ? "failed" : isPartialSuccess ? "partial" : "completed",
            completed_at: new Date().toISOString(),
            report: {
              total_rows: rows.length,
              succeeded,
              failed: totalFailed,
              pre_import_failed: preImportFailedRows.length,
              import_failed: failed,
            },
            errors: allFailedRecords,
          })
          .eq("id", importHistoryId);
      }

      // Log bulk import activity
      await supabaseAdmin
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: "import",
          entity_type: import_type,
          entity_id: null,
          payload: {
            import_type,
            file_name: file_name || "unknown.csv",
            total_rows: rows.length,
            succeeded,
            failed,
            import_history_id: importHistoryId,
          },
        });

      return new Response(
        JSON.stringify({
          success: true,
          partial: isPartialSuccess,
          total_rows: rows.length,
          succeeded,
          failed: totalFailed,
          pre_import_failed: preImportFailedRows.length,
          import_failed: failed,
          results: results || [],
          errors: allFailedRecords,
          user_creation_errors: userCreationErrors,
          import_history_id: importHistoryId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Import failed";
      const errorStack = error?.stack || "No stack trace";
      
      console.error("Import error:", errorMessage);
      console.error("Error stack:", errorStack);
      console.error("Error type:", typeof error);
      console.error("Error keys:", error ? Object.keys(error) : 'null');

      // Update import history with error
      if (importHistoryId) {
        try {
          await supabaseAdmin
            .from("import_history")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              errors: [{ error: errorMessage }],
            })
            .eq("id", importHistoryId);
        } catch (historyError) {
          console.error("Failed to update import history:", historyError);
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          error_type: typeof error,
          import_history_id: importHistoryId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Server error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

