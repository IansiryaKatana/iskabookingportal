import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MessageCard from "./MessageCard";
import clsx from "clsx";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | null;
  created_at: string;
}

interface CardStackProps {
  messages: Notification[];
  onAllDismissed: () => void;
  onSkip: () => void;
}

const CardStack = ({ messages, onAllDismissed, onSkip }: CardStackProps) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleCards = messages.slice(currentIndex, currentIndex + 5);
  const totalMessages = messages.length;
  const currentMessageNumber = currentIndex + 1;

  const handleDismiss = async () => {
    if (currentIndex >= messages.length || isAnimating) return;

    const currentMessage = messages[currentIndex];
    if (!currentMessage) return;

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
    }, 300); // Match animation duration
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

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Progress Indicator */}
      <div className="absolute -top-12 left-0 right-0 text-center z-50">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-sm rounded-md border border-border/60 shadow-sm">
          <span className="text-sm font-medium text-foreground">
            Message {currentMessageNumber} of {totalMessages}
          </span>
        </div>
      </div>

      {/* Card Stack Container */}
      <div className="relative h-[400px] w-full">
        {visibleCards.map((message, stackIndex) => {
          const actualIndex = currentIndex + stackIndex;
          const isTop = stackIndex === 0;
          const isDismissed = dismissedIds.has(message.id);

          if (isDismissed && !isTop) return null;

          return (
            <MessageCard
              key={message.id}
              id={message.id}
              title={message.title}
              message={message.message}
              type={message.type}
              createdAt={message.created_at}
              index={stackIndex}
              isTop={isTop}
              isAnimating={isAnimating && isTop}
              onDismiss={handleDismiss}
            />
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          onClick={handleSkip}
          className="flex-1 rounded-md uppercase tracking-wide gap-2"
        >
          <ExternalLink className="h-4 w-4" />
          View All Messages
        </Button>
        <Button
          onClick={handleDismiss}
          disabled={isAnimating}
          className="flex-1 rounded-md uppercase tracking-wide gap-2"
        >
          <X className="h-4 w-4" />
          {currentIndex >= messages.length - 1 ? "Close" : "Next"}
        </Button>
      </div>
    </div>
  );
};

export default CardStack;

