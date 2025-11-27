import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, PlusCircle, CalendarRange, ArrowRightCircle, CreditCard, FileText, FolderOpen, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { supabase } from "@/integrations/supabase/client";
import PortalLayout from "@/components/portal/PortalLayout";
import { format } from "date-fns";

const statusLabels: Record<string, string> = {
  draft: "In Progress",
  awaiting_deposit: "Awaiting Deposit",
  awaiting_signature: "Awaiting Signature",
  awaiting_verification: "Under Review",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const {
    data: applications,
    isLoading,
    refetch,
  } = useStudentApplicationsList(user?.id);
  const [rebookingContracts, setRebookingContracts] = useState<Array<{
    contract: any;
    canRebook: boolean;
    message: string;
  }>>([]);
  const [loadingRebooking, setLoadingRebooking] = useState(false);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Fetch available contracts for rebooking
  useEffect(() => {
    if (!user?.id) return;

    const fetchRebookingOpportunities = async () => {
      setLoadingRebooking(true);
      try {
        // Get active contracts for future academic years only (rebooking is for future years)
        const today = new Date().toISOString().split('T')[0];
        const { data: contracts, error } = await supabase
          .from("contracts")
          .select(`
            *,
            studio_grade:studio_grades(*),
            academic_year:academic_years(*)
          `)
          .eq("is_active", true)
          .gte("contract_start", today) // Only future contracts
          .order("contract_start", { ascending: true });

        if (error) throw error;

        console.log("Dashboard: Found contracts for rebooking check:", contracts?.length || 0, contracts);

        // Check rebooking eligibility for each contract
        const opportunities = [];
        for (const contract of contracts || []) {
          try {
            console.log("Dashboard: Checking rebooking for contract:", contract.id, contract.name);
            const { data: rebookingCheck, error: checkError } = await supabase
              .rpc("can_student_rebook", {
                p_user_id: user.id,
                p_contract_id: contract.id,
              });

            if (checkError) {
              console.error("Rebooking check error for contract", contract.id, checkError);
              continue;
            }

            console.log("Dashboard: Rebooking check result for", contract.name, ":", rebookingCheck);

            // Only show banner if can_rebook is true AND there's a previous application
            // (excludes first-time applications where previous_application_id is null)
            if (rebookingCheck?.[0]?.can_rebook && rebookingCheck[0].previous_application_id) {
              console.log("Dashboard: Adding rebooking opportunity:", contract.name);
              opportunities.push({
                contract,
                canRebook: true,
                message: rebookingCheck[0].message,
              });
            } else {
              console.log("Dashboard: Contract not eligible - can_rebook:", rebookingCheck?.[0]?.can_rebook, "previous_application_id:", rebookingCheck?.[0]?.previous_application_id);
            }
          } catch (err) {
            console.error("Error checking rebooking for contract", contract.id, err);
          }
        }

        console.log("Dashboard: Total rebooking opportunities found:", opportunities.length);
        setRebookingContracts(opportunities);
      } catch (error) {
        console.error("Error fetching rebooking opportunities:", error);
        // Log more details for debugging
        if (error instanceof Error) {
          console.error("Error details:", error.message, error.stack);
        }
      } finally {
        setLoadingRebooking(false);
      }
    };

    fetchRebookingOpportunities();
  }, [user?.id]);

  const DashboardSkeleton = () => (
    <div className="space-y-6">
      {[1, 2].map((i) => (
        <Card key={i} className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-full rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return <DashboardSkeleton />;
    }

    if (!applications?.length) {
      return (
        <Card className="rounded-3xl border-dashed">
          <CardHeader>
            <CardTitle className="text-2xl font-display uppercase tracking-wide">
              Start Your Booking
            </CardTitle>
            <CardDescription>
              You haven’t started a booking journey yet. Explore studio grades to
              choose a contract and begin your application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="rounded-full uppercase tracking-wide"
              onClick={() => navigate("/")}
            >
              Explore Studios
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {/* Prominent Rebooking Banner */}
        {loadingRebooking && (
          <Card className="rounded-3xl border border-border/60">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Checking rebooking opportunities...</p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {!loadingRebooking && rebookingContracts.length > 0 && (
          <Alert className="rounded-3xl border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 p-6">
            <RotateCcw className="h-6 w-6 text-primary" />
            <AlertTitle className="text-xl font-display uppercase tracking-wide text-primary mb-2">
              Rebooking Available! 🎉
            </AlertTitle>
            <AlertDescription className="text-base mb-4">
              You can rebook for upcoming academic years using your previous application data. 
              Your information will be pre-filled automatically!
            </AlertDescription>
            <div className="flex flex-wrap gap-3 mt-4">
              {rebookingContracts.map(({ contract, message }) => (
                <Button
                  key={contract.id}
                  size="lg"
                  className="rounded-full uppercase tracking-wide bg-primary hover:bg-primary/90 text-white shadow-lg"
                  onClick={() => navigate(`/contracts/${contract.slug}`)}
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  Rebook for {contract.academic_year?.name || contract.name}
                </Button>
              ))}
            </div>
          </Alert>
        )}

        {/* Rebooking Opportunities Card (Secondary) */}
        {rebookingContracts.length > 0 && (
          <Card className="rounded-3xl border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                All Rebooking Options
              </CardTitle>
              <CardDescription>
                View all available contracts for rebooking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rebookingContracts.map(({ contract, message }) => (
                <Alert key={contract.id} className="border-primary/30 bg-background">
                  <AlertTitle className="font-semibold">
                    {contract.name}
                  </AlertTitle>
                  <AlertDescription className="text-sm mt-1">
                    {contract.academic_year?.name} · {message}
                  </AlertDescription>
                  <Button
                    className="mt-3 rounded-full uppercase tracking-wide"
                    size="sm"
                    onClick={() => navigate(`/contracts/${contract.slug}`)}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </Alert>
              ))}
            </CardContent>
          </Card>
        )}

        {applications.map((application) => {
          const contract = application.contract;
          const gradeName = contract?.studio_grade?.name ?? "Studio Grade";
          const status = statusLabels[application.status] ?? application.status;
          const startDate = contract
            ? format(new Date(contract.contract_start), "d MMM yyyy")
            : "";
          const endDate = contract
            ? format(new Date(contract.contract_end), "d MMM yyyy")
            : "";
          const hasReservedStudio = Boolean(application.assigned_studio_id);
          const isConfirmed = application.status === "confirmed";
          const primaryActionLabel = hasReservedStudio
            ? "Continue Booking Journey"
            : "Select Studio";
          const primaryActionDestination = hasReservedStudio
            ? `/portal/applications/${application.id}`
            : `/portal/applications/${application.id}/select-studio`;

          return (
            <Card
              key={application.id}
              className="rounded-3xl border border-border/60 shadow-xl"
            >
              <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-display uppercase tracking-wide">
                    {contract?.name ?? "Contract"}
                  </CardTitle>
                  <CardDescription>
                    {gradeName} · {startDate} – {endDate}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Status
                  </span>
                  <span className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                    isConfirmed
                      ? "bg-green-600 text-white"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-primary" />
                    {contract?.weeks ?? "—"} weeks
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowRightCircle className="h-4 w-4 text-primary" />
                    Created {format(new Date(application.created_at), "d MMM yyyy")}
                  </div>
                </div>

                {isConfirmed ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-green-600/20 bg-green-600/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="font-semibold text-green-600">Application Confirmed</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your booking is confirmed! Use the quick actions below to manage your contract.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Button
                        variant="outline"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => navigate("/portal/payments")}
                      >
                        <CreditCard className="h-4 w-4" />
                        Payments
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => navigate("/portal/contracts")}
                      >
                        <FileText className="h-4 w-4" />
                        Contracts
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => navigate("/portal/documents")}
                      >
                        <FolderOpen className="h-4 w-4" />
                        Documents
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="rounded-full uppercase tracking-wide gap-2"
                    onClick={() => navigate(primaryActionDestination)}
                  >
                    {primaryActionLabel}
                    <ArrowRightCircle className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <PortalLayout
      subtitle={`Welcome back, ${profile?.first_name ?? "student"}`}
    >
      <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-display font-black uppercase tracking-wide">
            Your Applications
          </h2>
          <p className="text-muted-foreground text-sm">
            Resume your booking journey or start a new application.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-full uppercase tracking-wide gap-2"
          onClick={() => navigate("/")}
        >
          <PlusCircle className="h-4 w-4" />
          New Booking
        </Button>
      </section>

      {renderContent()}
    </PortalLayout>
  );
};

export default Dashboard;

