import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  financeStatusBadgeProps,
  formatFinanceStatusLabel,
} from "@/utils/financeStatusStyles";
import {
  OTA_PAYMENT_STATUS_LABELS,
  type OTAPaymentStatus,
} from "@/utils/otaPayment";

type FinanceStatusBadgeProps = {
  status: string | null | undefined;
  label?: string;
  className?: string;
};

export function FinanceStatusBadge({ status, label, className }: FinanceStatusBadgeProps) {
  return (
    <Badge {...financeStatusBadgeProps(status, cn("text-xs", className))}>
      {label ?? formatFinanceStatusLabel(status)}
    </Badge>
  );
}

type OTAPaymentStatusBadgeProps = {
  status: OTAPaymentStatus;
  className?: string;
};

export function OTAPaymentStatusBadge({ status, className }: OTAPaymentStatusBadgeProps) {
  return (
    <FinanceStatusBadge
      status={status}
      label={OTA_PAYMENT_STATUS_LABELS[status]}
      className={className}
    />
  );
}
