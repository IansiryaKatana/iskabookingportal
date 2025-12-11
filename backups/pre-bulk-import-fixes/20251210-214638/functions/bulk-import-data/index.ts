import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    | "applications";
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
): Promise<{ userId: string; created: boolean } | null> {
  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error(`Invalid email: ${email}`);
  }

  // Check if user exists
  const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(
    normalizedEmail
  );

  if (existingUser?.user) {
    // Update profile if needed
    if (firstName || lastName) {
      await supabaseAdmin
        .from("profiles")
        .update({
          first_name: firstName || null,
          last_name: lastName || null,
          role: "student",
        })
        .eq("id", existingUser.user.id);
    }
    return { userId: existingUser.user.id, created: false };
  }

  if (!createUsers) {
    throw new Error(`User with email ${normalizedEmail} does not exist and user creation is disabled`);
  }

  // Create new user
  const tempPassword = generateRandomPassword();
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: tempPassword,
    email_confirm: true, // Mark email as verified for historical imports
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
    },
  });

  if (createError || !newUser.user) {
    throw new Error(`Failed to create user ${normalizedEmail}: ${createError?.message || "Unknown error"}`);
  }

  // Update profile
  await supabaseAdmin
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      role: "student",
    })
    .eq("id", newUser.user.id);

  // Send password reset email if requested
  if (sendWelcomeEmail) {
    try {
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: normalizedEmail,
      });
      // Note: The link generation sends the email automatically
    } catch (emailError) {
      console.warn(`Failed to send welcome email to ${normalizedEmail}:`, emailError);
      // Don't fail the import if email fails
    }
  }

  return { userId: newUser.user.id, created: true };
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

      // Special handling for applications: create users first
      if (import_type === "applications") {
        const createUsers = options?.create_users !== false; // Default to true
        const sendWelcomeEmail = options?.send_welcome_email !== false; // Default to true

        // Create users for applications that don't have them
        const usersCreated: Record<string, string> = {};
        const usersCreatedCount = { count: 0 };

        for (const row of jsonbData) {
          const email = row.email?.toLowerCase().trim();
          if (!email) continue;

          if (!usersCreated[email]) {
            try {
              const userResult = await ensureUserExists(
                email,
                row.first_name || "",
                row.last_name || "",
                createUsers,
                sendWelcomeEmail
              );

              if (userResult) {
                usersCreated[email] = userResult.userId;
                if (userResult.created) {
                  usersCreatedCount.count++;
                }
              }
            } catch (userError: any) {
              console.error(`Failed to create user for ${email}:`, userError);
              // Continue processing - database function will handle the error
            }
          }
        }
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

      // Call database function
      const functionName = getFunctionName(import_type);
      const { data: results, error: functionError } = await supabaseAdmin.rpc(
        functionName,
        {
          p_data: jsonbData,
          p_imported_by: user.id,
        }
      );

      if (functionError) {
        throw functionError;
      }

      // Process results
      const succeeded = results?.filter((r: any) => r.status === "success").length || 0;
      const failed = results?.filter((r: any) => r.status === "error").length || 0;
      const errors = results?.filter((r: any) => r.status === "error").map((r: any) => ({
        row_number: r.row_number,
        error: r.error_message,
      })) || [];

      // Update import history
      if (importHistoryId) {
        await supabaseAdmin
          .from("import_history")
          .update({
            total_rows: rows.length,
            succeeded,
            failed,
            status: failed === rows.length ? "failed" : "completed",
            completed_at: new Date().toISOString(),
            report: {
              total_rows: rows.length,
              succeeded,
              failed,
            },
            errors: errors,
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
          total_rows: rows.length,
          succeeded,
          failed,
          results: results || [],
          errors,
          import_history_id: importHistoryId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (error: any) {
      console.error("Import error:", error);

      // Update import history with error
      if (importHistoryId) {
        await supabaseAdmin
          .from("import_history")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            errors: [{ error: error.message }],
          })
          .eq("id", importHistoryId);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Import failed",
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

