import { Badge } from "@/components/ui/badge";
import {
  BOOKING_SOURCE_BADGE_CONFIG,
} from "@/constants/bookingSources";
import { STAY_STATUS_LABELS, type StayStatus } from "@/utils/stayStatus";

const APPLICATION_STATUS_CONFIG: Record<string, { className: string; label: string }> = {
  draft: { className: "bg-gray-500 hover:bg-gray-600 text-white", label: "Draft" },
  awaiting_deposit: {
    className: "bg-yellow-500 hover:bg-yellow-600 text-white",
    label: "Awaiting Deposit",
  },
  awaiting_signature: {
    className: "bg-blue-500 hover:bg-blue-600 text-white",
    label: "Awaiting Signature",
  },
  awaiting_verification: {
    className: "bg-purple-500 hover:bg-purple-600 text-white",
    label: "Awaiting Verification",
  },
  confirmed: { className: "bg-green-500 hover:bg-green-600 text-white", label: "Confirmed" },
  cancelled: { className: "bg-red-500 hover:bg-red-600 text-white", label: "Cancelled" },
  expired: { className: "bg-orange-500 hover:bg-orange-600 text-white", label: "Expired" },
  checked_out: {
    className: "bg-slate-700 hover:bg-slate-800 text-white",
    label: "Checked Out",
  },
};

const STAY_STATUS_CLASS: Record<StayStatus, string> = {
  in_house: "text-emerald-700 border-emerald-500 bg-emerald-50",
  awaiting_check_in: "text-amber-700 border-amber-500 bg-amber-50",
  checked_out: "text-slate-700 border-slate-400 bg-slate-50",
};

const DOCUMENT_STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-500 hover:bg-yellow-600 text-white",
  pending_verification: "bg-yellow-500 hover:bg-yellow-600 text-white",
  verified: "bg-green-500 hover:bg-green-600 text-white",
  approved: "bg-green-500 hover:bg-green-600 text-white",
  rejected: "bg-red-500 hover:bg-red-600 text-white",
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const config = APPLICATION_STATUS_CONFIG[status] || {
    className: "bg-gray-500 hover:bg-gray-600 text-white",
    label: status.replace(/_/g, " "),
  };
  return (
    <Badge
      className={`uppercase rounded-md px-2.5 py-0.5 text-[10px] font-medium ${config.className}`}
    >
      {config.label}
    </Badge>
  );
}

export function StayStatusBadge({ status }: { status: StayStatus }) {
  return (
    <Badge
      variant="outline"
      className={`uppercase text-[10px] rounded-md ${STAY_STATUS_CLASS[status]}`}
    >
      {STAY_STATUS_LABELS[status]}
    </Badge>
  );
}

export function BookingSourceBadge({ source }: { source?: string | null }) {
  if (!source) {
    return (
      <Badge className="uppercase bg-muted text-muted-foreground rounded-md px-2.5 py-0.5 text-[10px] font-medium">
        No source
      </Badge>
    );
  }
  const config = BOOKING_SOURCE_BADGE_CONFIG[source];
  return (
    <Badge
      className={`uppercase rounded-md px-2.5 py-0.5 text-[10px] font-medium ${
        config?.className ?? "bg-muted text-muted-foreground"
      }`}
    >
      {config?.label ?? source}
    </Badge>
  );
}

export function DocumentStatusBadge({ status }: { status: string }) {
  const className =
    DOCUMENT_STATUS_CLASS[status] ?? "bg-gray-500 hover:bg-gray-600 text-white";
  return (
    <Badge className={`uppercase rounded-md px-2.5 py-0.5 text-[10px] font-medium ${className}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function DepositPaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <Badge className="uppercase rounded-md px-2.5 py-0.5 text-[10px] font-medium bg-green-500 hover:bg-green-600 text-white">
      Deposit Paid
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="uppercase rounded-md px-2.5 py-0.5 text-[10px] font-medium text-amber-700 border-amber-400"
    >
      No deposit
    </Badge>
  );
}
