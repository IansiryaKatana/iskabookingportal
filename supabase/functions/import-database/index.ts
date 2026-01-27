import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface ImportPackage {
  metadata: {
    export_date: string;
    supabase_url: string;
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

    const requestBody = await req.json();
    const importPackage: ImportPackage = requestBody.exportPackage;

    if (!importPackage || !importPackage.database) {
      return new Response(
        JSON.stringify({ error: "Invalid export package format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Starting database import for superadmin:", user.id);
    console.log("Import package metadata:", importPackage.metadata);

    const results = {
      success: true,
      imported: {
        storage_buckets: 0,
        storage_policies: 0,
      },
      skipped: {
        tables: "Schema must be imported via migrations",
        functions: "Functions must be imported via migrations",
        views: "Views must be imported via migrations",
        enums: "Enums must be imported via migrations",
        triggers: "Triggers must be imported via migrations",
        indexes: "Indexes must be imported via migrations",
        rls_policies: "RLS policies must be imported via migrations",
        grants: "Grants must be imported via migrations",
      },
      notes: [
        "This import function only imports storage bucket configurations.",
        "All database schema (tables, functions, views, etc.) must be imported by running migrations from supabase/migrations/ directory.",
        "Storage policies are documented but must be created manually or via migrations.",
        "Edge functions must be deployed from supabase/functions/ directory.",
        "Secrets must be configured manually in Supabase Dashboard > Settings > API.",
      ],
    };

    // Import Storage Buckets
    if (importPackage.storage?.buckets && importPackage.storage.buckets.length > 0) {
      for (const bucket of importPackage.storage.buckets) {
        try {
          const { error } = await supabaseAdmin
            .from("buckets")
            .upsert(
              {
                id: bucket.id,
                name: bucket.name || bucket.id,
                public: bucket.public || false,
                file_size_limit: bucket.file_size_limit || null,
                allowed_mime_types: bucket.allowed_mime_types || null,
              },
              { onConflict: "id" }
            );

          if (!error) {
            results.imported.storage_buckets++;
          } else {
            console.error(`Error importing bucket ${bucket.id}:`, error);
          }
        } catch (err) {
          console.error(`Error importing bucket ${bucket.id}:`, err);
        }
      }
    }

    // Log the import action
    await supabaseAdmin
      .from("staff_activity_logs")
      .insert({
        staff_id: user.id,
        action: "import",
        entity_type: "database",
        entity_id: null,
        payload: {
          import_date: new Date().toISOString(),
          source_export_date: importPackage.metadata.export_date,
          source_url: importPackage.metadata.supabase_url,
          storage_buckets_imported: results.imported.storage_buckets,
        },
      });

    console.log("Database import completed successfully");

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in import-database function:", error);
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

