import { cn } from "@/lib/utils";

/** Shared badge shell — border + light/dark tints */
const badgeBase =
  "border font-medium uppercase tracking-wide";

const badgePalette: Record<string, string> = {
  emerald:
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  green:
    "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  blue:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  sky:
    "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  cyan:
    "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
  indigo:
    "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  violet:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  purple:
    "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  amber:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  orange:
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  rose:
    "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  red:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  teal:
    "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  slate:
    "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700",
  gray:
    "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/50 dark:text-gray-300 dark:border-gray-700",
};

function paletteClass(key: keyof typeof badgePalette | string, extra?: string) {
  return cn(badgeBase, badgePalette[key] ?? badgePalette.gray, extra);
}

const AUDIT_ACTION_COLORS: Record<string, keyof typeof badgePalette> = {
  create: "emerald",
  update: "blue",
  delete: "red",
  approve: "green",
  reject: "rose",
  verify: "teal",
  confirm: "green",
  cancel: "orange",
  export: "indigo",
  import: "cyan",
  link: "violet",
  reassign: "amber",
  reassign_allocation: "amber",
  reactivate: "teal",
  deactivate: "orange",
  resend: "sky",
  process_refund: "purple",
  branding_updated: "purple",
};

export function getAuditActionBadgeClass(action: string | null | undefined): string {
  const key = action?.toLowerCase().trim() ?? "";
  return paletteClass(AUDIT_ACTION_COLORS[key] ?? "gray");
}

export function formatAuditActionLabel(action: string | null | undefined): string {
  if (!action) return "—";
  return action.replace(/_/g, " ");
}

const USER_ROLE_COLORS: Record<string, keyof typeof badgePalette> = {
  superadmin: "red",
  admin: "indigo",
  staff: "slate",
};

export function getUserRoleBadgeClass(role: string | null | undefined): string {
  const key = role?.toLowerCase().trim() ?? "";
  return paletteClass(USER_ROLE_COLORS[key] ?? "gray");
}

const STAFF_SUBROLE_COLORS: Record<string, keyof typeof badgePalette> = {
  operations_manager: "violet",
  reservationist: "sky",
  accountant: "emerald",
  front_desk: "amber",
  maintenance_officer: "orange",
  housekeeper: "teal",
};

export function getStaffSubroleBadgeClass(subrole: string | null | undefined): string {
  const key = subrole?.toLowerCase().trim() ?? "";
  return paletteClass(STAFF_SUBROLE_COLORS[key] ?? "blue");
}

export function formatStaffSubroleLabel(subrole: string | null | undefined): string {
  if (!subrole) return "";
  return subrole
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
