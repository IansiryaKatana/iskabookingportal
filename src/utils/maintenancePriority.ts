export type MaintenanceUrgency = "low" | "medium" | "high" | "emergency";

export type MaintenancePriorityBand = "P1" | "P2" | "P3";

export interface PriorityInfo {
  band: MaintenancePriorityBand;
  label: string;
  description: string;
  targetWindowLabel: string;
}

export const getPriorityBandFromUrgency = (
  urgency: MaintenanceUrgency
): MaintenancePriorityBand => {
  switch (urgency) {
    case "emergency":
      return "P1";
    case "high":
      return "P2";
    case "medium":
    case "low":
    default:
      return "P3";
  }
};

export const getPriorityInfoFromUrgency = (
  urgency: MaintenanceUrgency
): PriorityInfo => {
  const band = getPriorityBandFromUrgency(urgency);

  if (band === "P1") {
    return {
      band,
      label: "Priority 1 – Emergency",
      description: "Emergency repairs that must be completed as soon as possible.",
      targetWindowLabel: "Target: within 24 hours",
    };
  }

  if (band === "P2") {
    return {
      band,
      label: "Priority 2 – Urgent",
      description: "Urgent repairs that materially affect comfort or operation.",
      targetWindowLabel: "Target: within 5 working days",
    };
  }

  return {
    band,
    label: "Priority 3 – Non‑urgent",
    description: "Non‑urgent repairs that can be grouped into planned work.",
    targetWindowLabel: "Target: within 28 days",
  };
};

export const computeSlaDueAtFromUrgency = (
  createdAt: Date,
  urgency: MaintenanceUrgency
): string => {
  const band = getPriorityBandFromUrgency(urgency);
  const base = createdAt.getTime();

  let offsetMs: number;

  if (band === "P1") {
    // Priority 1 – within 24 hours
    offsetMs = 24 * 60 * 60 * 1000;
  } else if (band === "P2") {
    // Priority 2 – within 5 working days (approximate as 5 calendar days)
    offsetMs = 5 * 24 * 60 * 60 * 1000;
  } else {
    // Priority 3 – within 28 days
    offsetMs = 28 * 24 * 60 * 60 * 1000;
  }

  return new Date(base + offsetMs).toISOString();
};

