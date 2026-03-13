import { Button } from "@/components/ui/button";

type ContractShowcaseProps<TContract> = {
  title?: string;
  subtitle?: string;
  contracts: TContract[];
  getWeeks: (contract: TContract) => number;
  getWeeksLabel?: (contract: TContract, weeks: number) => string;
  getWeeklyPrice: (contract: TContract) => number | null;
  getDeposit: (contract: TContract) => number | null;
  getStartDate: (contract: TContract) => string | null;
  getEndDate: (contract: TContract) => string | null;
  ctaLabel?: string;
  onSelect?: (contract: TContract) => void;
  emptyState?: React.ReactNode;
};

const formatDate = (value: string | null) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const ContractShowcase = <TContract,>({
  title = "Available Contracts",
  subtitle,
  contracts,
  getWeeks,
  getWeeksLabel,
  getWeeklyPrice,
  getDeposit,
  getStartDate,
  getEndDate,
  ctaLabel = "Enquire",
  onSelect,
  emptyState,
}: ContractShowcaseProps<TContract>) => {
  return (
    <div className="rounded-3xl border border-border/60 bg-background/80 shadow-xl h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <h2 className="text-3xl font-display font-black uppercase">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="px-6 pb-6 flex-1 flex flex-col gap-4">
        {contracts.map((contract, index) => {
          const weeks = getWeeks(contract);
          const weeklyPrice = getWeeklyPrice(contract);
          const deposit = getDeposit(contract);
          const startDate = formatDate(getStartDate(contract));
          const endDate = formatDate(getEndDate(contract));

          return (
            <div
              key={index}
              className="rounded-2xl border border-border/50 bg-muted/30 px-3 py-3 flex flex-col gap-4"
            >
              <div className="grid grid-cols-[35%_65%] gap-4">
                <div className="border border-border/60 rounded-2xl overflow-hidden divide-y divide-border/40">
                  <div className="px-3 py-3 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-[0.3em]">
                    {getWeeksLabel ? getWeeksLabel(contract, weeks) : `${weeks} Weeks`}
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    <p className="text-2xl font-black">
                      {weeklyPrice
                        ? `£${weeklyPrice.toLocaleString("en-GB", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}`
                        : "Pricing on enquiry"}
                    </p>
                    {weeklyPrice && (
                      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                        PP/PW
                      </p>
                    )}
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    <p className="text-lg font-semibold">
                      {deposit !== null
                        ? `£${deposit.toLocaleString("en-GB", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })} Deposit`
                        : "Deposit on enquiry"}
                    </p>
                  </div>
                </div>
                <div className="space-y-3 flex flex-col justify-center pr-1">
                  <div className="space-y-1">
                    {(startDate || endDate) && (
                      <p className="text-xs text-muted-foreground uppercase tracking-[0.2em]">
                        {startDate}
                        {startDate || endDate ? " – " : ""}
                        {endDate}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-foreground">
                    Instalments are available, including custom contracts. Your
                    final amount depends on your stay length—reach out to
                    personalise your plan.
                  </p>
                  <Button
                    className="rounded-xl uppercase tracking-wide self-start"
                    onClick={() => onSelect?.(contract)}
                  >
                    {ctaLabel}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {!contracts.length && (
          <div className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            {emptyState ?? "No contracts available for this studio grade yet."}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractShowcase;


