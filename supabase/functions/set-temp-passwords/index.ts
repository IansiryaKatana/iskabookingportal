import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const IN_QUERY_CHUNK_SIZE = 80;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["staff", "superadmin"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden: Staff access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const applicationIds: string[] = Array.isArray(body?.application_ids)
      ? body.application_ids.filter(Boolean)
      : [];
    const sharedPassword =
      typeof body?.password === "string" && body.password.trim().length >= 6
        ? body.password.trim()
        : null;

    if (applicationIds.length === 0) {
      return new Response(JSON.stringify({ error: "application_ids is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof body?.password === "string" && body.password.trim().length > 0 && !sharedPassword) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const applications: Array<{ id: string; student_id: string }> = [];
    for (const chunk of chunkArray(applicationIds, IN_QUERY_CHUNK_SIZE)) {
      const { data, error } = await supabaseAdmin
        .from("student_applications")
        .select("id, student_id")
        .in("id", chunk);
      if (error) {
        throw new Error(error.message);
      }
      applications.push(...((data || []) as Array<{ id: string; student_id: string }>));
    }

    const studentIds = [...new Set(applications.map((a) => a.student_id).filter(Boolean))];
    const results: Array<{
      application_id: string;
      student_id: string;
      email: string;
      name: string;
      password?: string;
      error?: string;
    }> = [];

    for (const app of applications) {
      const studentId = app.student_id;
      try {
        const { data: userData, error: getError } = await supabaseAdmin.auth.admin.getUserById(
          studentId,
        );
        if (getError || !userData?.user) {
          results.push({
            application_id: app.id,
            student_id: studentId,
            email: "",
            name: "",
            error: getError?.message || "Auth user not found",
          });
          continue;
        }

        const authUser = userData.user;
        const { data: profileRow } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("id", studentId)
          .maybeSingle();

        const email = (authUser.email || profileRow?.email || "").toString();
        const name = [profileRow?.first_name, profileRow?.last_name].filter(Boolean).join(" ").trim() ||
          email ||
          "Student";
        const password = sharedPassword || generateTempPassword();

        const existingAppMeta = (authUser.app_metadata || {}) as Record<string, unknown>;
        const existingUserMeta = (authUser.user_metadata || {}) as Record<string, unknown>;

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
          password,
          app_metadata: {
            ...existingAppMeta,
            must_change_password: true,
          },
          user_metadata: {
            ...existingUserMeta,
            // Keep invitation tracking honest: temp password is an access fallback
            account_status:
              existingUserMeta.account_status === "activated" ||
                existingUserMeta.account_status === "active"
                ? existingUserMeta.account_status
                : "invited",
            temp_password_set_at: new Date().toISOString(),
          },
        });

        if (updateError) {
          results.push({
            application_id: app.id,
            student_id: studentId,
            email,
            name,
            error: updateError.message,
          });
          continue;
        }

        results.push({
          application_id: app.id,
          student_id: studentId,
          email,
          name,
          password,
        });
      } catch (err: any) {
        results.push({
          application_id: app.id,
          student_id: studentId,
          email: "",
          name: "",
          error: err?.message || "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;

    return new Response(
      JSON.stringify({
        success: true,
        total: applications.length,
        unique_students: studentIds.length,
        succeeded,
        failed,
        shared_password: Boolean(sharedPassword),
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error in set-temp-passwords:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
