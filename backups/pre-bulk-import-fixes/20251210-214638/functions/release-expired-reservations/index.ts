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

    const now = new Date().toISOString();

    // Find all applications with expired reservations
    const { data: expiredReservations, error: fetchError } = await supabaseClient
      .from("student_applications")
      .select("id, assigned_studio_id, reserved_studio_expires_at")
      .not("reserved_studio_expires_at", "is", null)
      .lt("reserved_studio_expires_at", now)
      .in("status", ["draft", "awaiting_deposit"]);

    if (fetchError) {
      throw fetchError;
    }

    if (!expiredReservations || expiredReservations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired reservations found", released: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let releasedCount = 0;

    // Release each expired reservation
    for (const application of expiredReservations) {
      // Update studio status back to available if it was reserved
      if (application.assigned_studio_id) {
        const { error: studioError } = await supabaseClient
          .from("studios")
          .update({ status: "available" })
          .eq("id", application.assigned_studio_id);

        if (studioError) {
          console.error(`Failed to release studio ${application.assigned_studio_id}:`, studioError);
          continue;
        }
      }

      // Clear the reservation expiry
      const { error: updateError } = await supabaseClient
        .from("student_applications")
        .update({
          assigned_studio_id: null,
          reserved_studio_expires_at: null,
        })
        .eq("id", application.id);

      if (updateError) {
        console.error(`Failed to clear reservation for application ${application.id}:`, updateError);
        continue;
      }

      releasedCount++;
    }

    return new Response(
      JSON.stringify({
        message: "Expired reservations released",
        released: releasedCount,
        total: expiredReservations.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in release-expired-reservations function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


