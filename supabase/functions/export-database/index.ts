import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface ExportPackage {
  metadata: {
    export_date: string;
    supabase_url: string;
    project_ref?: string;
    version: string;
  };
  database: {
    schema: {
      tables: any[];
      functions: any[];
      views: any[];
      enums: any[];
      triggers: any[];
      indexes: any[];
      rls_policies: any[];
      grants: any[];
    };
  };
  storage: {
    buckets: any[];
    policies: any[];
  };
  edge_functions: {
    functions: string[];
    note: string;
  };
  secrets: {
    required_secrets: string[];
    note: string;
  };
  migration_guide: {
    steps: string[];
    notes: string[];
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify user is superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is superadmin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: Superadmin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Starting database export for superadmin:", user.id);

    const exportPackage: ExportPackage = {
      metadata: {
        export_date: new Date().toISOString(),
        supabase_url: supabaseUrl,
        version: "1.0.0",
      },
      database: {
        schema: {
          tables: [],
          functions: [],
          views: [],
          enums: [],
          triggers: [],
          indexes: [],
          rls_policies: [],
          grants: [],
        },
      },
      storage: {
        buckets: [],
        policies: [],
      },
      edge_functions: {
        functions: [],
        note: "Edge function source code is in your repository at supabase/functions/. This list shows function names only.",
      },
      secrets: {
        required_secrets: [],
        note: "Secrets must be manually exported from Supabase Dashboard > Settings > API. Values are not included for security.",
      },
      migration_guide: {
        steps: [],
        notes: [],
      },
    };

    // ============================================================================
    // EXPORT DATABASE SCHEMA
    // ============================================================================

    // 1. Export Tables (using helper function)
    const { data: tables, error: tablesError } = await supabaseAdmin.rpc("export_get_tables");
    if (!tablesError && tables) {
      exportPackage.database.schema.tables = tables;
    }

    // 2. Export Functions
    const { data: functions, error: functionsError } = await supabaseAdmin.rpc("export_get_functions");
    if (!functionsError && functions) {
      exportPackage.database.schema.functions = functions;
    }

    // 3. Export Views
    const { data: views, error: viewsError } = await supabaseAdmin.rpc("export_get_views");
    if (!viewsError && views) {
      exportPackage.database.schema.views = views;
    }

    // 4. Export Enums
    const { data: enums, error: enumsError } = await supabaseAdmin.rpc("export_get_enums");
    if (!enumsError && enums) {
      exportPackage.database.schema.enums = enums;
    }

    // 5. Export Triggers
    const { data: triggers, error: triggersError } = await supabaseAdmin.rpc("export_get_triggers");
    if (!triggersError && triggers) {
      exportPackage.database.schema.triggers = triggers;
    }

    // 6. Export Indexes
    const { data: indexes, error: indexesError } = await supabaseAdmin.rpc("export_get_indexes");
    if (!indexesError && indexes) {
      exportPackage.database.schema.indexes = indexes;
    }

    // 7. Export RLS Policies
    const { data: policies, error: policiesError } = await supabaseAdmin.rpc("export_get_rls_policies");
    if (!policiesError && policies) {
      exportPackage.database.schema.rls_policies = policies;
    }

    // 8. Export Grants
    const { data: grants, error: grantsError } = await supabaseAdmin.rpc("export_get_grants");
    if (!grantsError && grants) {
      exportPackage.database.schema.grants = grants;
    }

    // ============================================================================
    // EXPORT STORAGE
    // ============================================================================

    // Export Storage Buckets
    const { data: buckets, error: bucketsError } = await supabaseAdmin
      .from("buckets")
      .select("*");

    if (!bucketsError && buckets) {
      exportPackage.storage.buckets = buckets;
    }

    // Export Storage Policies (already included in rls_policies above, but filter for storage.objects)
    const storagePolicies = exportPackage.database.schema.rls_policies.filter(
      (p: any) => p.schemaname === "storage" && p.tablename === "objects"
    );
    exportPackage.storage.policies = storagePolicies;

    // ============================================================================
    // EXPORT EDGE FUNCTIONS METADATA
    // ============================================================================

    // List edge functions (we'll get this from the functions directory structure)
    // For now, we'll document the known functions
    exportPackage.edge_functions.functions = [
      "bulk-import-data",
      "calculate-forecast",
      "check-integration-status",
      "check-payment-status",
      "create-contract-pdf",
      "create-partner-account",
      "create-payment",
      "docusign-check-status",
      "docusign-envelopes",
      "docusign-recipient-view",
      "download-signed-document",
      "generate-payment-history-pdf",
      "generate-student-invoice-pdf",
      "get-email-template",
      "get-payment-intent-details",
      "get-publishable-key",
      "get-user-emails",
      "manage-users",
      "process-refund",
      "release-expired-reservations",
      "send-bulk-message",
      "send-confirmation-email",
      "send-installment-invoice-email",
      "send-ota-payment-receipt",
      "send-transactional-email",
      "notify-booking-event",
      "stripe-webhook",
      "sync-payment-from-stripe",
      "weekly-payment-report",
    ];

    // ============================================================================
    // EXPORT SECRETS CHECKLIST
    // ============================================================================

    exportPackage.secrets.required_secrets = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "DOCUSIGN_CLIENT_ID",
      "DOCUSIGN_USER_ID",
      "DOCUSIGN_ACCOUNT_ID",
      "DOCUSIGN_BASE_URL",
      "DOCUSIGN_AUTH_SERVER",
      "DOCUSIGN_PRIVATE_KEY",
      "DOCUSIGN_TENANCY_TEMPLATE_ID",
      "DOCUSIGN_GUARANTOR_TEMPLATE_ID",
      "DOCUSIGN_TENANCY_STUDENT_ROLE",
      "DOCUSIGN_TENANCY_WITNESS_ROLE",
      "DOCUSIGN_GUARANTOR_ROLE",
      "RESEND_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    // ============================================================================
    // MIGRATION GUIDE
    // ============================================================================

    exportPackage.migration_guide.steps = [
      "1. Create a new Supabase project",
      "2. Run all migrations from supabase/migrations/ directory in order",
      "3. Export and import secrets from Supabase Dashboard > Settings > API",
      "4. Deploy edge functions from supabase/functions/ directory",
      "5. Create storage buckets and policies as documented in storage section",
      "6. Verify all RLS policies are correctly applied",
      "7. Test database functions and triggers",
      "8. Import any required seed data",
    ];

    exportPackage.migration_guide.notes = [
      "This export contains schema and configuration only. Actual data is not included.",
      "Storage files must be manually downloaded using: supabase storage download <bucket-name>",
      "Edge function source code is in your repository at supabase/functions/",
      "Secrets must be manually configured in the new project's dashboard",
      "Test all integrations (Stripe, DocuSign, Resend) after migration",
      "Update environment variables in your application code to point to the new project",
    ];

    // Log the export action
    await supabaseAdmin
      .from("staff_activity_logs")
      .insert({
        staff_id: user.id,
        action: "export",
        entity_type: "database",
        entity_id: null,
        payload: {
          export_date: exportPackage.metadata.export_date,
          tables_count: exportPackage.database.schema.tables.length,
          functions_count: exportPackage.database.schema.functions.length,
        },
      });

    console.log("Database export completed successfully");

    return new Response(JSON.stringify(exportPackage, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="supabase-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("Error in export-database function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

