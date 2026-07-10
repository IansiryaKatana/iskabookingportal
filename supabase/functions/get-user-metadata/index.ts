import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type UserInvitationMetadata = {
  account_status: string;
  invitation_sent_at: string | null;
  invitation_expires_at: string | null;
};

function metadataFromUser(user: {
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): UserInvitationMetadata {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const explicitStatus = (meta.account_status as string) || "";

  // Staff-created / self-signup users often have no account_status.
  // If they've signed in, treat as activated so the Bulk Invitations UI matches reality.
  let accountStatus = explicitStatus;
  if (!accountStatus) {
    accountStatus = user.last_sign_in_at ? "activated" : "pending_activation";
  }

  return {
    account_status: accountStatus,
    invitation_sent_at: (meta.invitation_sent_at as string) || null,
    invitation_expires_at: (meta.invitation_expires_at as string) || null,
  };
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
      },
    );
  }

  try {
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
        },
      );
    }

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
        },
      );
    }

    let requestBody: { userIds: string[] };
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { userIds } = requestBody;

    if (!userIds || !Array.isArray(userIds)) {
      return new Response(
        JSON.stringify({ error: "userIds must be an array" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ metadata: {} }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const requested = new Set(userIds);
    const metadataMap: Record<string, UserInvitationMetadata> = {};

    // Paginate listUsers — default page size is 50 and silently truncates without this.
    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (usersError) {
        console.error("Error fetching users:", usersError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch users", details: usersError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const users = data?.users || [];
      if (users.length === 0) {
        break;
      }

      for (const authUser of users) {
        if (requested.has(authUser.id)) {
          metadataMap[authUser.id] = metadataFromUser(authUser);
        }
      }

      const allFound = userIds.every((id) => id in metadataMap);
      if (allFound || users.length < perPage) {
        hasMore = false;
      } else {
        page += 1;
      }
    }

    // Fallback for any IDs still missing after pagination
    const missingIds = userIds.filter((id) => !(id in metadataMap));
    for (const userId of missingIds) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (!error && data?.user) {
          metadataMap[userId] = metadataFromUser(data.user);
        } else {
          // Keep UI consistent: unknown users stay pending until proven otherwise
          metadataMap[userId] = {
            account_status: "pending_activation",
            invitation_sent_at: null,
            invitation_expires_at: null,
          };
        }
      } catch (err) {
        console.warn(`Exception fetching user ${userId}:`, err);
        metadataMap[userId] = {
          account_status: "pending_activation",
          invitation_sent_at: null,
          invitation_expires_at: null,
        };
      }
    }

    return new Response(
      JSON.stringify({ metadata: metadataMap }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error in get-user-metadata:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
