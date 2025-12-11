import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, useUnreadNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full h-10 w-10"
        >
          <div className="relative flex items-center justify-center">
            <Bell className="h-5 w-5" />
            {unreadCount !== undefined && (
              <Badge
                className="absolute -top-2 -right-2 h-5 px-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-semibold rounded-full min-w-[20px] flex items-center justify-center shadow-sm border-2 border-background"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-3xl" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-sm uppercase tracking-wide">Notifications</h3>
          {unreadNotifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-auto p-1 rounded-full uppercase tracking-wide"
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
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
                        <div className={clsx("h-2 w-2 rounded-full mt-2 flex-shrink-0", getTypeColor(notification.type))} />
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
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;

