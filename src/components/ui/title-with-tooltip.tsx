import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";

type TitleWithTooltipProps = {
  children: React.ReactNode;
  tooltip?: React.ReactNode;
  tooltipLabel?: string;
  className?: string;
  titleClassName?: string;
};

export function TitleWithTooltip({
  children,
  tooltip,
  tooltipLabel,
  className,
  titleClassName,
}: TitleWithTooltipProps) {
  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
      <span className={cn("min-w-0", titleClassName)}>{children}</span>
      {tooltip ? (
        <InfoTooltip content={tooltip} label={tooltipLabel} />
      ) : null}
    </div>
  );
}
