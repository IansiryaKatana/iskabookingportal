type StripeFeeConfig = {
  percent: number;
  fixedPence: number;
};

const DEFAULT_PERCENT = 0.029;
const DEFAULT_FIXED_PENCE = 30;

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    return DEFAULT_PERCENT;
  }
  return value;
};

const clampFixedPence = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_FIXED_PENCE;
  }
  return Math.round(value);
};

export function getStripeFeeConfig(): StripeFeeConfig {
  const percentRaw = Deno.env.get("STRIPE_CARD_FEE_PERCENT");
  const fixedRaw = Deno.env.get("STRIPE_CARD_FEE_FIXED_PENCE");

  const percent = clampPercent(percentRaw ? Number(percentRaw) : DEFAULT_PERCENT);
  const fixedPence = clampFixedPence(fixedRaw ? Number(fixedRaw) : DEFAULT_FIXED_PENCE);

  return { percent, fixedPence };
}

export function calculateGrossAmountForNet(netAmountPence: number): {
  netAmountPence: number;
  grossAmountPence: number;
  processingFeePence: number;
  feePercent: number;
  fixedFeePence: number;
} {
  const safeNet = Math.max(0, Math.round(netAmountPence));
  const { percent, fixedPence } = getStripeFeeConfig();

  // Gross-up formula: gross - (gross * p + fixed) = net
  const exactGross = (safeNet + fixedPence) / (1 - percent);
  let gross = Math.ceil(exactGross);
  let fee = Math.round(gross * percent) + fixedPence;

  // Guard against rounding edge-cases where net could end up short by 1p.
  while (gross - fee < safeNet) {
    gross += 1;
    fee = Math.round(gross * percent) + fixedPence;
  }

  return {
    netAmountPence: safeNet,
    grossAmountPence: gross,
    processingFeePence: Math.max(0, gross - safeNet),
    feePercent: percent,
    fixedFeePence: fixedPence,
  };
}

