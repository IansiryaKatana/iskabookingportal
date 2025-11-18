import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudioContract } from "@/hooks/useStudioGrade";

type AvailableContractsProps = {
  academicYearName?: string;
  contracts: StudioContract[];
  onSelectContract?: (contract: StudioContract) => void;
  layout?: "full" | "panel";
};

const formatDateRange = (start: string, end: string) => {
  try {
    const startDate = format(new Date(start), "d MMM yyyy");
    const endDate = format(new Date(end), "d MMM yyyy");
    return `${startDate} to ${endDate}`;
  } catch {
    return `${start} to ${end}`;
  }
};

const EmptyContracts = () => (
  <div className="rounded-3xl border border-dashed border-muted-foreground/20 bg-muted/40 p-12 text-center space-y-4">
    <h3 className="text-3xl font-display font-bold uppercase tracking-wide">
      Contracts Coming Soon
    </h3>
    <p className="text-muted-foreground max-w-2xl mx-auto">
      Check back shortly while we finalise availability for this studio grade.
      Our team is preparing tailored agreements for the upcoming academic year.
    </p>
  </div>
);

const PanelCard = ({
  contract,
  onSelect,
}: {
  contract: StudioContract;
  onSelect?: (contract: StudioContract) => void;
}) => {
  const weeklyPrice = contract.computed_weekly_price;
  const deposit = contract.computed_deposit_amount;
  const amountLabel = weeklyPrice
    ? `£${weeklyPrice.toLocaleString("en-GB")} PP/PW`
    : "Weekly price to be confirmed";
  const depositLabel = deposit
    ? `£${deposit.toLocaleString("en-GB", {
        minimumFractionDigits: 2,
      })} deposit`
    : "Deposit on enquiry";

  const primaryPlanName =
    contract.contract_payment_plans?.[0]?.payment_plan?.name ??
    "Flexible instalments";

  return (
    <Card className="rounded-3xl border border-white/10 bg-background shadow-lg shadow-black/10">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl font-display uppercase tracking-wide">
          {contract.weeks} Weeks
        </CardTitle>
        <p className="text-2xl font-bold text-primary">{amountLabel}</p>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {primaryPlanName}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {formatDateRange(contract.contract_start, contract.contract_end)}
        </p>
        {contract.summary && (
          <p className="text-sm text-foreground/90 leading-relaxed">
            {contract.summary}
          </p>
        )}
        <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
          {depositLabel}
        </p>
        <Button
          size="lg"
          className="w-full rounded-full font-semibold uppercase tracking-wide"
          onClick={() => onSelect?.(contract)}
        >
          Enquire
        </Button>
      </CardContent>
    </Card>
  );
};

const PanelLayout = ({
  contracts,
  onSelectContract,
}: {
  contracts: StudioContract[];
  onSelectContract?: (contract: StudioContract) => void;
}) => {
  if (!contracts.length) {
    return <EmptyContracts />;
  }

  return (
    <div className="flex flex-col gap-4">
      {contracts.map((contract) => (
        <PanelCard
          key={contract.id}
          contract={contract}
          onSelect={onSelectContract}
        />
      ))}
    </div>
  );
};

const FullLayout = ({
  academicYearName,
  contracts,
  onSelectContract,
}: AvailableContractsProps) => {
  if (!contracts.length) {
    return (
      <section className="bg-muted/20 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-7xl">
          <EmptyContracts />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-muted/20 py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-7xl space-y-10">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Available Contracts
          </p>
          <h2 className="text-4xl md:text-6xl font-display font-black uppercase">
            {academicYearName ?? "Secure Your Stay"}
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Select the tenancy that matches your academic calendar. Every
            contract includes verified documentation, digital signing, and
            flexible payment plans aligned with your preferences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {contracts.map((contract) => (
            <PanelCard
              key={contract.id}
              contract={contract}
              onSelect={onSelectContract}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const AvailableContracts = ({
  academicYearName,
  contracts,
  onSelectContract,
  layout = "full",
}: AvailableContractsProps) => {
  if (layout === "panel") {
    return <PanelLayout contracts={contracts} onSelectContract={onSelectContract} />;
  }

  return (
    <FullLayout
      academicYearName={academicYearName}
      contracts={contracts}
      onSelectContract={onSelectContract}
      layout="full"
    />
  );
};

export default AvailableContracts;
