import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type InfoTooltipProps = {
  content: React.ReactNode;
  label?: string;
  className?: string;
  iconClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
};

export function InfoTooltip({
  content,
  label = "More information",
  className,
  iconClassName,
  side = "top",
}: InfoTooltipProps) {
  if (!content) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground shrink-0",
            className,
          )}
          aria-label={label}
        >
          <Info className={cn("h-3.5 w-3.5", iconClassName)} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
