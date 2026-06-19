import { Badge } from "@/components/ui/badge";
import { X, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { format } from "date-fns";
import clsx from "clsx";

type NotificationType = "info" | "success" | "warning" | "error";

interface MessageCardProps {
  id: string;
  title: string;
  message: string;
  type: NotificationType | null;
  createdAt: string;
  index: number;
  isTop: boolean;
  isAnimating: boolean;
  onDismiss: () => void;
}

const MessageCard = ({
  id,
  title,
  message,
  type,
  createdAt,
  index,
  isTop,
  isAnimating,
  onDismiss,
}: MessageCardProps) => {
  const getTypeIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      default:
        return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getTypeBadgeColor = () => {
    switch (type) {
      case "success":
        return "bg-green-500 hover:bg-green-600 text-white";
      case "warning":
        return "bg-yellow-500 hover:bg-yellow-600 text-white";
      case "error":
        return "bg-red-500 hover:bg-red-600 text-white";
      default:
        return "bg-blue-500 hover:bg-blue-600 text-white";
    }
  };

  const getTypeLabel = () => {
    switch (type) {
      case "success":
        return "Success";
      case "warning":
        return "Warning";
      case "error":
        return "Error";
      default:
        return "Info";
    }
  };

  // Truncate message to 2-3 lines
  const truncatedMessage = message.length > 150 ? `${message.substring(0, 150)}...` : message;

  return (
    <div
      className={clsx(
        "absolute inset-0 bg-background rounded-3xl border border-border/60 shadow-xl p-6 transition-all duration-300 ease-out",
        isAnimating && isTop && "opacity-0 translate-x-full scale-95",
        !isTop && !isAnimating && "cursor-pointer"
      )}
      style={{
        transform: isTop
          ? "translateY(0) rotate(0deg) scale(1)"
          : `translateY(${index * 8}px) rotate(${index % 2 === 0 ? -2 : 2}deg) scale(${1 - index * 0.02})`,
        zIndex: 100 - index,
        boxShadow: isTop
          ? "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
          : `0 ${index * 4}px ${index * 8}px rgba(0, 0, 0, ${0.1 + index * 0.05})`,
        pointerEvents: isTop ? "auto" : "none",
      }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={clsx(
              "p-2 rounded-md flex-shrink-0",
              type === "success" && "bg-green-100 dark:bg-green-900",
              type === "warning" && "bg-yellow-100 dark:bg-yellow-900",
              type === "error" && "bg-red-100 dark:bg-red-900",
              (!type || type === "info") && "bg-blue-100 dark:bg-blue-900"
            )}>
              {getTypeIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-display font-bold uppercase tracking-wide truncate">
                {title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={clsx("uppercase text-xs rounded-md px-2 py-0.5", getTypeBadgeColor())}>
                  {getTypeLabel()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(createdAt), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          </div>
          {isTop && (
            <button
              onClick={onDismiss}
              className="ml-2 p-1.5 rounded-md hover:bg-muted transition-colors flex-shrink-0"
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Message Content */}
        <div className="flex-1 overflow-hidden">
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {truncatedMessage}
          </p>
        </div>

        {/* Footer - only show on top card */}
        {isTop && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-xs text-muted-foreground text-center">
              Swipe or click to dismiss
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageCard;

