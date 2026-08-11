import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNotifications, useUnreadNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: notifications, isLoading } = useNotifications(user?.id);
  const { data: unreadCount } = useUnreadNotifications(user?.id);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadNotifications = notifications?.filter((n) => !n.is_read) || [];
  const readNotifications = notifications?.filter((n) => n.is_read) || [];
  const showBadge = (unreadCount ?? 0) > 0;

  const handleNotificationClick = async (notification: typeof notifications[0]) => {
    if (!notification.is_read) {
      await markRead.mutateAsync(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (user?.id && unreadNotifications.length > 0) {
      await markAllRead.mutateAsync(user.id);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-500";
      case "warning":
        return "bg-yellow-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-md h-10 w-10"
          aria-label={showBadge ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <Bell className="h-5 w-5" />
          {showBadge && (
            <span
              className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background"
            >
              {unreadCount! > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-4 pr-12 text-left">
          <SheetTitle className="text-sm font-semibold uppercase tracking-wide">
            Notifications
          </SheetTitle>
          {unreadNotifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-auto p-1 rounded-md uppercase tracking-wide"
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : notifications && notifications.length > 0 ? (
            <div className="p-2">
              {unreadNotifications.length > 0 && (
                <div className="space-y-1 mb-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide px-2 mb-2">
                    Unread
                  </p>
                  {unreadNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={clsx(
                        "p-3 rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors border-l-4",
                        notification.type === "success" && "border-green-500",
                        notification.type === "warning" && "border-yellow-500",
                        notification.type === "error" && "border-red-500",
                        notification.type === "info" && "border-blue-500"
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-2">
                        <div className={clsx("h-2 w-2 rounded-md mt-2 flex-shrink-0", getTypeColor(notification.type))} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(notification.created_at), "d MMM yyyy, HH:mm")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {readNotifications.length > 0 && (
                <div className="space-y-1">
                  {unreadNotifications.length > 0 && (
                    <p className="text-xs text-muted-foreground uppercase tracking-wide px-2 mb-2">
                      Earlier
                    </p>
                  )}
                  {readNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-3 rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors opacity-60"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(notification.created_at), "d MMM yyyy, HH:mm")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;
