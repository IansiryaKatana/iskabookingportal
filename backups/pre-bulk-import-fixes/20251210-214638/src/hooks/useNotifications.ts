import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export const useNotifications = (userId?: string) => {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });

      if (userId) {
        query.eq("user_id", userId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
};

export const useUnreadNotifications = (userId?: string) => {
  return useQuery({
    queryKey: ["notifications", "unread", userId],
    queryFn: async () => {
      if (!userId) return 0;

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useCreateNotification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      user_id: string;
      title: string;
      message: string;
      type?: "info" | "success" | "warning" | "error";
      link?: string;
    }) => {
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id: payload.user_id,
          title: payload.title,
          message: payload.message,
          type: payload.type || "info",
          link: payload.link || null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useToggleStarNotification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ notificationId, isStarred }: { notificationId: string; isStarred: boolean }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_starred: isStarred })
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useBulkMarkRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .in("id", notificationIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useBulkStar = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ notificationIds, isStarred }: { notificationIds: string[]; isStarred: boolean }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_starred: isStarred })
        .in("id", notificationIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

