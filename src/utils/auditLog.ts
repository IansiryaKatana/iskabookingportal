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

    // Check if user is staff
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !["staff", "superadmin"].includes(profile.role)) {
      console.warn("Cannot log activity: user is not staff", profileError);
      return;
    }

    // Try using the database function first (if it exists), otherwise fall back to direct insert
    const { error: functionError } = await supabase.rpc('log_staff_activity', {
      p_action: params.action,
      p_entity_type: params.entityType || null,
      p_entity_id: params.entityId || null,
      p_payload: params.payload || null,
    });

    if (functionError) {
      // Fall back to direct insert if function doesn't exist or fails
      const { error: logError } = await supabase
        .from("staff_activity_logs")
        .insert({
          staff_id: user.id,
          action: params.action,
          entity_type: params.entityType || null,
          entity_id: params.entityId || null,
          payload: params.payload || null,
        });

      if (logError) {
        console.error("Failed to log activity:", logError);
      }
    }
  } catch (error) {
    console.error("Error in logActivity:", error);
  }
}

