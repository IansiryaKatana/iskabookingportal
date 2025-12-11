import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

const LoginMessageDialog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setDialogOpen(false);
      return;
    }

    const checkUnreadMessages = async () => {
      try {
        // Check for unread notifications from bulk or targeted messages
        // that haven't had the login dialog shown yet
        const { data: notifications, error } = await supabase
          .from("notifications")
          .select("id, title, message, notification_type, source_type")
          .eq("user_id", user.id)
          .eq("is_read", false)
          .eq("login_dialog_shown", false)
          .in("source_type", ["bulk_message", "targeted_message"])
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("Error checking unread messages:", error);
          return;
        }

        if (notifications && notifications.length > 0) {
          setHasUnreadMessages(true);
          setDialogOpen(true);

          // Mark these notifications as having shown the login dialog
          const notificationIds = notifications.map((n) => n.id);
          await supabase
            .from("notifications")
            .update({ login_dialog_shown: true })
            .in("id", notificationIds);
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

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
              <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle>New Messages</DialogTitle>
          </div>
          <DialogDescription>
            You have unread messages in your notifications. Check them out to stay updated!
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            We've sent you important updates. Please check your notifications to view them.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setDialogOpen(false)}
            className="rounded-full"
          >
            Dismiss
          </Button>
          <Button
            onClick={() => {
              setDialogOpen(false);
              navigate("/portal/notifications");
            }}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            View Notifications
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoginMessageDialog;

