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

    // Get user IDs from request body
    let body: any;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { userIds } = body || {};

    // Validate userIds is an array
    if (!userIds || !Array.isArray(userIds)) {
      return new Response(
        JSON.stringify({ error: "userIds must be an array" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If empty array, return empty emails map (not an error)
    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ emails: {} }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch users from auth.users - handle pagination
    const emailsMap: Record<string, string> = {};
    let page = 1;
    const perPage = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: { users }, error } = await supabaseClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.error("Error fetching users (page", page, "):", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!users || users.length === 0) {
        hasMore = false;
        break;
      }

      // Filter to requested user IDs and create map
      users.forEach((user) => {
        if (userIds.includes(user.id) && user.email) {
          emailsMap[user.id] = user.email;
          console.log(`Found email for user ${user.id}: ${user.email}`);
        }
      });

      // Check if we've found all requested users
      const foundUserIds = Object.keys(emailsMap);
      const allFound = userIds.every((id) => foundUserIds.includes(id));
      
      if (allFound) {
        hasMore = false;
      } else if (users.length < perPage) {
        // Last page
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`Fetched emails for ${Object.keys(emailsMap).length} out of ${userIds.length} requested users`);
    console.log("Requested user IDs:", userIds);
    console.log("Found user IDs:", Object.keys(emailsMap));

    // If we didn't find all users, try fetching them individually (handles edge cases)
    const foundUserIds = Object.keys(emailsMap);
    const missingUserIds = userIds.filter((id) => !foundUserIds.includes(id));
    
    if (missingUserIds.length > 0) {
      console.log(`Attempting to fetch ${missingUserIds.length} missing users individually`);
      for (const userId of missingUserIds) {
        try {
          const { data: { user }, error: getUserError } = await supabaseClient.auth.admin.getUserById(userId);
          if (!getUserError && user && user.email) {
            emailsMap[user.id] = user.email;
            console.log(`Found email for user ${userId} via getUserById: ${user.email}`);
          } else if (getUserError) {
            console.warn(`Could not fetch user ${userId}:`, getUserError.message);
          } else if (user && !user.email) {
            console.warn(`User ${userId} exists but has no email`);
          } else {
            console.warn(`User ${userId} not found in auth.users`);
          }
        } catch (err) {
          console.warn(`Exception fetching user ${userId}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({ emails: emailsMap }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in get-user-emails function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

