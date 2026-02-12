/**
 * Single source of truth for student application booking sources.
 * Used when creating applications as staff, during bulk import, and in filters/discounts.
 * DB: student_applications.booking_source CHECK constraint and bulk_import must allow these values.
 */

export const BOOKING_SOURCE_VALUES = [
  "website",
  "imported",
  "rebooker",
  "partner_referral",
  "unity_sales",
  "hfs_sales",
] as const;

export type BookingSourceValue = (typeof BOOKING_SOURCE_VALUES)[number];

export const BOOKING_SOURCE_OPTIONS: { value: BookingSourceValue; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "imported", label: "Imported" },
  { value: "rebooker", label: "Rebooker" },
  { value: "partner_referral", label: "Partner referral" },
  { value: "unity_sales", label: "Unity Sales" },
  { value: "hfs_sales", label: "HFS Sales" },
];

export const BOOKING_SOURCE_BADGE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  website: { label: "Website", className: "bg-blue-500 hover:bg-blue-600 text-white" },
  imported: { label: "Imported", className: "bg-slate-500 hover:bg-slate-600 text-white" },
  rebooker: { label: "Rebooker", className: "bg-purple-500 hover:bg-purple-600 text-white" },
  partner_referral: { label: "Partner referral", className: "bg-teal-500 hover:bg-teal-600 text-white" },
  unity_sales: { label: "Unity Sales", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  hfs_sales: { label: "HFS Sales", className: "bg-emerald-500 hover:bg-emerald-600 text-white" },
};
