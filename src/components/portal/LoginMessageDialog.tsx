import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import CardStack from "./CardStack";
import BottomSheetCardStack from "./BottomSheetCardStack";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | null;
  created_at: string;
}

const LoginMessageDialog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [messages, setMessages] = useState<Notification[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setDialogOpen(false);
      return;
    }

    const checkUnreadMessages = async () => {
      try {
        // Fetch unread notifications. Try with login_dialog_shown first (requires 20251210 migration).
        // If that column doesn't exist (400), fall back to unread-only.
        let notifications: Record<string, unknown>[] | null = null;
        let error: { code?: string; message?: string } | null = null;

        const baseQuery = () =>
          supabase
            .from("notifications")
            .select("*")
            .eq("user_id", user.id)
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(20);

        const withLoginDialog = await baseQuery().eq("login_dialog_shown", false);

        if (withLoginDialog.error) {
          // login_dialog_shown column may not exist (e.g. migration not run); retry without it
          const fallback = await baseQuery();
          notifications = fallback.data;
          error = fallback.error;
        } else {
          notifications = withLoginDialog.data;
          error = null;
        }

        if (error) {
          console.error("Error checking unread messages:", error);
          return;
        }

        if (notifications && notifications.length > 0) {
          // Filter for bulk/targeted messages (those with bulk_message_id in metadata)
          const bulkMessages = notifications.filter((n) => {
            const metadata = n.metadata as any;
            return metadata && metadata.bulk_message_id;
          }).slice(0, 10); // Limit to 10 messages

          if (bulkMessages.length > 0) {
            // Map notifications to our format
            // Handle both 'type' and 'notification_type' fields
            const formattedMessages: Notification[] = bulkMessages.map((n: any) => ({
              id: n.id,
              title: n.title || "",
              message: n.message || "",
              type: (n.type || n.notification_type || "info") as "info" | "success" | "warning" | "error" | null,
              created_at: n.created_at,
            }));

            setMessages(formattedMessages);
            setDialogOpen(true);
          }
        }
      } catch (error) {
        console.error("Error in checkUnreadMessages:", error);
      }
    };

    // Small delay to ensure user is fully loaded
    const timer = setTimeout(() => {
      checkUnreadMessages();
    }, 500);

    return () => clearTimeout(timer);
  }, [user?.id]);

  const handleAllDismissed = () => {
    setDialogOpen(false);
    setMessages([]);
  };

  const handleSkip = () => {
    setDialogOpen(false);
    setMessages([]);
    navigate("/portal/notifications");
  };

  // Handle ESC key to close
  useEffect(() => {
    if (!dialogOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDialogOpen(false);
        setMessages([]);
        navigate("/portal/notifications");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dialogOpen, navigate]);

  // Early return after all hooks
  if (messages.length === 0) {
    return null;
  }

  // Mobile: Use Sheet (bottom sheet)
  if (isMobile) {
    return (
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-3xl p-0 mb-0 max-h-[90vh] overflow-y-auto bg-transparent border-none shadow-none"
        >
          <div className="p-4 pb-6">
            <BottomSheetCardStack
              messages={messages}
              onAllDismissed={handleAllDismissed}
              onSkip={handleSkip}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Use Dialog (centered modal)
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl p-0 [&>button]:hidden bg-transparent border-none shadow-none">
        <CardStack
          messages={messages}
          onAllDismissed={handleAllDismissed}
          onSkip={handleSkip}
        />
      </DialogContent>
    </Dialog>
  );
};

export default LoginMessageDialog;

