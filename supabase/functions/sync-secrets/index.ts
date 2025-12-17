import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface SyncRequest {
  credential_key?: string; // Optional: sync specific credential, otherwise sync all
  dry_run?: boolean; // If true, return what would be synced without actually syncing
}

interface Credential {
  credential_key: string;
  credential_value: string;
  category: string;
  sync_to_edge_function: boolean;
  description?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Check if user is superadmin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "Forbidden. Superadmin access required." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    let requestBody: SyncRequest = {};
    if (req.method === "POST") {
      try {
        requestBody = await req.json();
      } catch {
        // If no body, that's okay - we'll sync all
      }
    }

    const { credential_key, dry_run = false } = requestBody;

    // Get credentials from database
    let query = supabaseAdmin
      .from("credentials")
      .select("credential_key, credential_value, category, sync_to_edge_function, description, is_encrypted, encrypted_value")
      .eq("sync_to_edge_function", true);

    if (credential_key) {
      query = query.eq("credential_key", credential_key);
    }

    const { data: credentials, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch credentials: ${fetchError.message}`);
    }

    if (!credentials || credentials.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No credentials found to sync",
          synced: [],
          skipped: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Decrypt encrypted values
    const decryptedCredentials: Credential[] = [];
    for (const cred of credentials) {
      let value = cred.credential_value;

      // If encrypted, decrypt it
      if (cred.is_encrypted && cred.encrypted_value) {
        try {
          // Call database function to decrypt
          const { data: decrypted, error: decryptError } = await supabaseAdmin.rpc(
            "get_credential_value",
            { p_credential_key: cred.credential_key },
          );

          if (decryptError || !decrypted) {
            console.error(`Failed to decrypt ${cred.credential_key}:`, decryptError);
            continue; // Skip this credential
          }

          value = decrypted;
        } catch (error) {
          console.error(`Error decrypting ${cred.credential_key}:`, error);
          continue; // Skip this credential
        }
      }

      // Skip if value is placeholder
      if (value === "[ENCRYPTED]" || !value || value.trim() === "") {
        continue;
      }

      decryptedCredentials.push({
        credential_key: cred.credential_key,
        credential_value: value,
        category: cred.category || "integration",
        sync_to_edge_function: cred.sync_to_edge_function,
        description: cred.description,
      });
    }

    if (dry_run) {
      // Return what would be synced without actually syncing
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: "Dry run completed. No secrets were actually synced.",
          would_sync: decryptedCredentials.map((c) => ({
            key: c.credential_key,
            category: c.category,
            description: c.description,
            value_length: c.credential_value.length,
            value_preview: c.credential_value.substring(0, 10) + "...",
          })),
          total: decryptedCredentials.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Note: Supabase doesn't provide a direct Management API for Edge Function secrets
    // The actual sync must be done via Supabase CLI or Dashboard
    // This function prepares the secrets and provides instructions

    // Format secrets for CLI sync
    const secretsForCLI = decryptedCredentials.map((cred) => ({
      key: cred.credential_key.toUpperCase(),
      value: cred.credential_value,
    }));

    // Update sync status in database
    const updatePromises = decryptedCredentials.map((cred) =>
      supabaseAdmin.rpc("update_credential_sync_status", {
        p_credential_key: cred.credential_key,
        p_synced: true,
      }),
    );

    await Promise.all(updatePromises);

    // Log activity
    await supabaseAdmin.from("staff_activity_logs").insert({
      action: "sync",
      entity_type: "credentials",
      user_id: user.id,
      payload: {
        credential_count: decryptedCredentials.length,
        credential_keys: decryptedCredentials.map((c) => c.credential_key),
        dry_run: false,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Secrets prepared for sync. Use Supabase CLI to sync to Edge Functions.",
        synced: decryptedCredentials.map((c) => ({
          key: c.credential_key,
          category: c.category,
          description: c.description,
        })),
        total: decryptedCredentials.length,
        cli_commands: secretsForCLI.map(
          (s) => `supabase secrets set ${s.key}="${s.value.replace(/"/g, '\\"')}"`,
        ),
        instructions: [
          "1. Copy the CLI commands above",
          "2. Run them in your terminal with Supabase CLI",
          "3. Or manually set secrets in Supabase Dashboard: Project Settings > Edge Functions > Secrets",
          "4. Secrets have been marked as synced in the database",
        ],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Sync secrets error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to sync secrets",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

