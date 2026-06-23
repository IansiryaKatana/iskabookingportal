import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

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

    const { data, error } = await supabaseClient.rpc(
      "release_expired_studio_holds",
    );

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(data ?? { released_applications: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in release-expired-reservations function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
