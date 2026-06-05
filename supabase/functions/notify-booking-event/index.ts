import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import {
  notifyBookingEvent,
  type BookingNotificationEvent,
  type BookingNotificationMetadata,
} from "../_shared/booking-notifications.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const VALID_EVENTS: BookingNotificationEvent[] = [
  "application_created",
  "studio_reserved",
  "deposit_paid",
  "application_submitted",
  "manual_payment_request_submitted",
];

function isStaffProfile(role: string | null, staffSubrole: string | null): boolean {
  if (!role) return false;
  const staffRoles = new Set([
    "staff",
    "superadmin",
    "admin",
    "operations_manager",
    "reservationist",
    "accountant",
    "front_desk",
    "maintenance_officer",
    "housekeeper",
  ]);
  if (staffRoles.has(role)) return true;
  if (role === "staff" && staffSubrole) return true;
  return false;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { event, applicationId, metadata } = body as {
      event?: BookingNotificationEvent;
      applicationId?: string;
      metadata?: BookingNotificationMetadata;
    };

    if (!event || !VALID_EVENTS.includes(event)) {
      return new Response(
        JSON.stringify({ error: `event must be one of: ${VALID_EVENTS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!applicationId) {
      return new Response(JSON.stringify({ error: "applicationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: application, error: appError } = await supabaseAdmin
      .from("student_applications")
      .select("student_id")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError || !application) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = application.student_id === user.id;
    if (!isOwner) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, staff_subrole")
        .eq("id", user.id)
        .maybeSingle();

      if (!isStaffProfile(profile?.role ?? null, profile?.staff_subrole ?? null)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const result = await notifyBookingEvent(
      supabaseAdmin,
      event,
      applicationId,
      metadata,
    );

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-booking-event error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
