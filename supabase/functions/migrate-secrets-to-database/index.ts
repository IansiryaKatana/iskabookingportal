import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface SecretToMigrate {
  key: string;
  value: string;
  category: string;
  description: string;
  requires_encryption: boolean;
}

// List of secrets to migrate (based on codebase analysis)
// Note: System secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.) are NOT migrated
// as they are required for Edge Functions to connect to the database
const SECRETS_TO_MIGRATE: Omit<SecretToMigrate, "value">[] = [
  // Stripe
  { key: "STRIPE_SECRET_KEY", category: "api_key", description: "Stripe secret key for payment processing", requires_encryption: true },
  { key: "STRIPE_WEBHOOK_SECRET", category: "webhook", description: "Stripe webhook signing secret", requires_encryption: true },
  
  // DocuSign
  { key: "DOCUSIGN_CLIENT_ID", category: "integration", description: "DocuSign integration client ID", requires_encryption: false },
  { key: "DOCUSIGN_USER_ID", category: "integration", description: "DocuSign API user ID", requires_encryption: false },
  { key: "DOCUSIGN_ACCOUNT_ID", category: "integration", description: "DocuSign account ID", requires_encryption: false },
  { key: "DOCUSIGN_PRIVATE_KEY", category: "api_key", description: "DocuSign RSA private key (PEM format)", requires_encryption: true },
  { key: "DOCUSIGN_AUTH_SERVER", category: "url", description: "DocuSign authentication server URL", requires_encryption: false },
  { key: "DOCUSIGN_BASE_URL", category: "url", description: "DocuSign API base URL", requires_encryption: false },
  { key: "DOCUSIGN_TENANCY_TEMPLATE_ID", category: "integration", description: "DocuSign tenancy agreement template ID (legacy - now in docusign_templates table)", requires_encryption: false },
  { key: "DOCUSIGN_GUARANTOR_TEMPLATE_ID", category: "integration", description: "DocuSign guarantor agreement template ID (legacy - now in docusign_templates table)", requires_encryption: false },
  { key: "DOCUSIGN_WEBHOOK_SECRET", category: "webhook", description: "DocuSign webhook signing secret", requires_encryption: true },
  { key: "DOCUSIGN_TENANCY_STUDENT_ROLE", category: "integration", description: "DocuSign tenancy agreement student role name", requires_encryption: false },
  { key: "DOCUSIGN_TENANCY_WITNESS_ROLE", category: "integration", description: "DocuSign tenancy agreement witness role name", requires_encryption: false },
  { key: "DOCUSIGN_GUARANTOR_ROLE", category: "integration", description: "DocuSign guarantor agreement role name", requires_encryption: false },
  { key: "DOCUSIGN_SIGNING_RETURN_URL", category: "url", description: "DocuSign signing return URL after completion", requires_encryption: false },
  
  // Resend
  { key: "RESEND_API_KEY", category: "api_key", description: "Resend API key for sending emails", requires_encryption: true },
  { key: "RESEND_FROM_EMAIL", category: "email", description: "Default from email address for Resend", requires_encryption: false },
  
  // Notifications
  { key: "NOTIFICATIONS_STAFF_EMAIL", category: "email", description: "Email address for staff notifications", requires_encryption: false },
  { key: "NOTIFICATIONS_FROM_EMAIL", category: "email", description: "From email address for notifications", requires_encryption: false },
  
  // Application
  { key: "PORTAL_URL", category: "url", description: "Portal application URL", requires_encryption: false },
];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Authentication required." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Verify user is superadmin
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Invalid token." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "Forbidden. Superadmin access required." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request
    let requestBody: { dry_run?: boolean; secrets?: Array<{ key: string; value: string }> } = {};
    if (req.method === "POST") {
      try {
        requestBody = await req.json();
      } catch {
        // No body is okay
      }
    }

    const { dry_run = false, secrets: providedSecrets } = requestBody;

    // Get secrets to migrate
    const secretsToMigrate: SecretToMigrate[] = [];

    if (providedSecrets && providedSecrets.length > 0) {
      // Use provided secrets
      for (const provided of providedSecrets) {
        const template = SECRETS_TO_MIGRATE.find(s => s.key === provided.key.toUpperCase());
        if (template) {
          secretsToMigrate.push({
            ...template,
            value: provided.value,
          });
        }
      }
    } else {
      // Read from environment variables
      // Note: Only secrets that exist in Deno.env will be migrated
      // If a secret doesn't exist in env vars, it will be skipped
      for (const template of SECRETS_TO_MIGRATE) {
        const envValue = Deno.env.get(template.key);
        if (envValue && envValue.trim() !== "") {
          secretsToMigrate.push({
            ...template,
            value: envValue,
          });
        } else {
          console.log(`Secret ${template.key} not found in environment variables, skipping...`);
        }
      }
    }

    if (secretsToMigrate.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No secrets found to migrate",
          migrated: [],
          skipped: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check which secrets already exist
    const existingKeys = new Set<string>();
    const { data: existing } = await supabaseAdmin
      .from("credentials")
      .select("credential_key")
      .in("credential_key", secretsToMigrate.map(s => s.key.toLowerCase()));

    if (existing) {
      existing.forEach(c => existingKeys.add(c.credential_key.toLowerCase()));
    }

    const toMigrate = secretsToMigrate.filter(s => !existingKeys.has(s.key.toLowerCase()));
    const skipped = secretsToMigrate.filter(s => existingKeys.has(s.key.toLowerCase()));

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: "Dry run completed. No secrets were migrated.",
          would_migrate: toMigrate.map(s => ({
            key: s.key,
            category: s.category,
            description: s.description,
            requires_encryption: s.requires_encryption,
            value_length: s.value.length,
            value_preview: s.value.substring(0, 10) + "...",
          })),
          would_skip: skipped.map(s => ({ key: s.key, reason: "Already exists in database" })),
          total: secretsToMigrate.length,
          to_migrate: toMigrate.length,
          skipped: skipped.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Migrate secrets
    const migrated: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];

    for (const secret of toMigrate) {
      try {
        const { error } = await supabaseAdmin
          .from("credentials")
          .insert({
            credential_key: secret.key.toLowerCase(),
            credential_value: secret.value,
            credential_type: secret.requires_encryption ? "api_key" : "other",
            category: secret.category,
            description: secret.description,
            requires_encryption: secret.requires_encryption,
            sync_to_edge_function: true,
          });

        if (error) {
          // If it's a duplicate key error, that's okay (race condition)
          if (error.code === "23505") {
            skipped.push(secret);
          } else {
            throw error;
          }
        } else {
          migrated.push(secret.key);
        }
      } catch (error) {
        errors.push({
          key: secret.key,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Log activity
    await supabaseAdmin.from("staff_activity_logs").insert({
      action: "migrate",
      entity_type: "credentials",
      user_id: user.id,
      payload: {
        migrated_count: migrated.length,
        skipped_count: skipped.length,
        error_count: errors.length,
        migrated_keys: migrated,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migration completed. ${migrated.length} secret(s) migrated, ${skipped.length} skipped, ${errors.length} errors.`,
        migrated: migrated.map(key => ({
          key,
          status: "success",
        })),
        skipped: skipped.map(s => ({
          key: s.key,
          reason: "Already exists in database",
        })),
        errors,
        total: secretsToMigrate.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Migrate secrets error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to migrate secrets",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

