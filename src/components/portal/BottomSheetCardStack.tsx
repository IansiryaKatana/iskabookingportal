import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, X, Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import clsx from "clsx";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | null;
  created_at: string;
}

interface BottomSheetCardStackProps {
  messages: Notification[];
  onAllDismissed: () => void;
  onSkip: () => void;
}

const BottomSheetCardStack = ({ messages, onAllDismissed, onSkip }: BottomSheetCardStackProps) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const currentMessage = messages[currentIndex];
  const totalMessages = messages.length;
  const currentMessageNumber = currentIndex + 1;

  const getTypeIcon = () => {
    if (!currentMessage) return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    switch (currentMessage.type) {
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
    if (!currentMessage) return "bg-blue-500 hover:bg-blue-600 text-white";
    switch (currentMessage.type) {
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
    if (!currentMessage) return "Info";
    switch (currentMessage.type) {
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

  const handleDismiss = async () => {
    if (currentIndex >= messages.length || isAnimating || !currentMessage) return;

    setIsAnimating(true);
    setDismissedIds((prev) => new Set(prev).add(currentMessage.id));

    // Mark message as shown in database
    try {
      await supabase
        .from("notifications")
        .update({ login_dialog_shown: true })
        .eq("id", currentMessage.id);
    } catch (error) {
      console.error("Error updating notification:", error);
    }

    // Wait for animation to complete
    setTimeout(() => {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= messages.length) {
        onAllDismissed();
      } else {
        setCurrentIndex(nextIndex);
        setIsAnimating(false);
      }
    }, 300);
  };

  const handleSkip = () => {
    // Mark all remaining messages as shown
    const remainingIds = messages.slice(currentIndex).map((m) => m.id);
    
    supabase
      .from("notifications")
      .update({ login_dialog_shown: true })
      .in("id", remainingIds)
      .then(() => {
        onSkip();
      })
      .catch((error) => {
        console.error("Error updating notifications:", error);
        onSkip();
      });
  };

  if (messages.length === 0 || !currentMessage) {
    return null;
  }

  // Truncate message for mobile
  const truncatedMessage = currentMessage.message.length > 200 
    ? `${currentMessage.message.substring(0, 200)}...` 
    : currentMessage.message;

  return (
    <div className="w-full">
      {/* Progress Indicator */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-md">
          <span className="text-sm font-medium">
            {currentMessageNumber} of {totalMessages}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className={clsx(
        "bg-background rounded-t-3xl border-t border-l border-r border-border/60 p-6 transition-all duration-300",
        isAnimating && "opacity-0 translate-y-4"
      )}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={clsx(
              "p-2 rounded-md flex-shrink-0",
              currentMessage.type === "success" && "bg-green-100 dark:bg-green-900",
              currentMessage.type === "warning" && "bg-yellow-100 dark:bg-yellow-900",
              currentMessage.type === "error" && "bg-red-100 dark:bg-red-900",
              (!currentMessage.type || currentMessage.type === "info") && "bg-blue-100 dark:bg-blue-900"
            )}>
              {getTypeIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-display font-bold uppercase tracking-wide break-words">
                {currentMessage.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className={clsx("uppercase text-xs rounded-md px-2 py-0.5", getTypeBadgeColor())}>
                  {getTypeLabel()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(currentMessage.created_at), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Message Content */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
            {truncatedMessage}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleDismiss}
            disabled={isAnimating}
            className="w-full rounded-md uppercase tracking-wide gap-2"
          >
            <X className="h-4 w-4" />
            {currentIndex >= messages.length - 1 ? "Close" : "Next Message"}
          </Button>
          <Button
            variant="outline"
            onClick={handleSkip}
            className="w-full rounded-md uppercase tracking-wide gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            View All Messages
          </Button>
        </div>
      </div>

      {/* Stack Preview - Show next 2 cards peeking */}
      {currentIndex < messages.length - 1 && (
        <div className="relative -mt-2">
          {messages.slice(currentIndex + 1, currentIndex + 3).map((msg, idx) => (
            <div
              key={msg.id}
              className={clsx(
                "bg-muted/30 rounded-t-3xl border-t border-l border-r border-border/40 p-4 mx-2",
                idx === 0 && "h-16",
                idx === 1 && "h-12 -mt-2"
              )}
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-md bg-muted-foreground/30" />
                <span className="text-xs text-muted-foreground truncate">{msg.title}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BottomSheetCardStack;

