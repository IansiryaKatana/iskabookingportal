import { supabase } from "@/integrations/supabase/client";

export interface AuditLogParams {
  action: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, any>;
}

/**
 * Logs a staff activity to the audit log system
 * @param params - The audit log parameters
 * @returns Promise that resolves when the log is created
 */
export async function logActivity(params: AuditLogParams): Promise<void> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.warn("Cannot log activity: user not authenticated", userError);
      return;
    }

    // Check if user is staff or superadmin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.warn("Cannot log activity: error fetching profile", profileError);
      return;
    }

    if (!profile) {
      console.warn("Cannot log activity: profile not found for user", user.id);
      return;
    }

    if (!["staff", "superadmin"].includes(profile.role)) {
      console.warn(`Cannot log activity: user role is "${profile.role}", expected "staff" or "superadmin"`);
      return;
    }

    // Debug log for superadmin (development only)
    if (import.meta.env.DEV && profile.role === "superadmin") {
      console.log("🔐 Logging activity as superadmin:", {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: user.id,
      });
    }

    // Try using the database function first (if it exists), otherwise fall back to direct insert
    const { data: rpcResult, error: functionError } = await supabase.rpc('log_staff_activity', {
      p_action: params.action,
      p_entity_type: params.entityType || null,
      p_entity_id: params.entityId || null,
      p_payload: params.payload || null,
    });

    // If function doesn't exist or fails, fall back to direct insert
    if (functionError) {
      // Check if function doesn't exist (this is OK, we'll use direct insert)
      const functionNotFound = 
        functionError.code === '42883' || 
        functionError.message?.includes('does not exist') ||
        functionError.message?.includes('function log_staff_activity');

      if (!functionNotFound) {
        console.warn("RPC function error, falling back to direct insert:", functionError);
      }

      // Fall back to direct insert if function doesn't exist or fails
      const { data: insertData, error: logError } = await supabase
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: params.action,
          entity_type: params.entityType || null,
          entity_id: params.entityId || null,
          payload: params.payload || null,
        })
        .select()
        .single();

      if (logError) {
        console.error("❌ Failed to log activity (both RPC and direct insert failed):", {
          rpcError: functionError,
          insertError: logError,
          params: {
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
          }
        });
        // Don't throw - allow the operation to succeed even if logging fails
        // But log the error so we can debug
      } else {
        if (import.meta.env.DEV) {
          console.log("✅ Activity logged successfully (direct insert):", {
            logId: insertData?.id,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
          });
        }
      }
    } else {
      // RPC function succeeded - if it returns a UUID, the insert worked
      // (RPC uses SECURITY DEFINER so it bypasses RLS)
      if (rpcResult && typeof rpcResult === 'string') {
        if (import.meta.env.DEV) {
          console.log("✅ Activity logged successfully (via RPC function):", {
            logId: rpcResult,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
          });
        }
        // RPC function worked - record is in database, no need to verify
        // (verification would fail due to RLS, but RPC bypasses RLS)
      } else {
        console.warn("⚠️ RPC function returned unexpected result:", {
          rpcResult,
          type: typeof rpcResult,
          params: {
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
          }
        });
        // RPC returned something unexpected, but no error - assume it worked
        // The function should always return a UUID if successful
      }
    }
  } catch (error) {
    console.error("Error in logActivity:", error);
  }
}

