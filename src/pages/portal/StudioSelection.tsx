import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, MapPin, Clock, AlertTriangle } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useStudentApplication } from "@/hooks/useStudentApplication";
import { useReserveStudio, useReleaseStudio, useStudios } from "@/hooks/useStudios";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const StudioSelection = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: application, isLoading: applicationLoading } =
    useStudentApplication(applicationId);

  const studioGradeId = application?.studio_grade_id;
  const academicYearId = application?.contract?.academic_year_id ?? undefined;

  const {
    data: studios,
    isLoading: studiosLoading,
    refetch: refetchStudios,
  } = useStudios(studioGradeId ?? undefined, academicYearId);

  const blockingApplicationStatuses = [
    "draft",
    "awaiting_deposit",
    "awaiting_signature",
    "awaiting_verification",
    "confirmed",
  ] as const;

  // Safety check: studios held by other applications on this contract
  const { data: blockedStudioIds } = useQuery({
    queryKey: ["blocked-studios", application?.contract_id],
    queryFn: async () => {
      if (!application?.contract_id) return [];

      const { data, error } = await supabase
        .from("student_applications")
        .select("assigned_studio_id")
        .eq("contract_id", application.contract_id)
        .in("status", [...blockingApplicationStatuses])
        .not("assigned_studio_id", "is", null);

      if (error) {
        console.error("Error fetching blocked studios:", error);
        return [];
      }

      return (data || []).map((app) => app.assigned_studio_id).filter(Boolean) as string[];
    },
    enabled: Boolean(application?.contract_id),
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const availableStudios = useMemo(() => {
    if (!studios || !blockedStudioIds) return studios;
    return studios.filter((studio) => {
      if (studio.id === application?.assigned_studio_id) return true;
      return !blockedStudioIds.includes(studio.id);
    });
  }, [studios, blockedStudioIds, application?.assigned_studio_id]);

  const { mutateAsync: reserveStudio, isLoading: reserving } = useReserveStudio(
    studioGradeId,
  );
  const { mutateAsync: releaseStudio, isLoading: releasing } = useReleaseStudio(
    studioGradeId,
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refetchStudios();
  }, [refetchStudios]);

  const selectedStudio = useMemo(() => {
    if (!application?.assigned_studio_id) return null;
    return studios?.find(
      (studio) => studio.id === application.assigned_studio_id,
    );
  }, [application?.assigned_studio_id, studios]);

  const handleSelect = async (studioId: string) => {
    if (!studioGradeId || !application || !user) return;

    setSaving(true);
    try {
      if (application.assigned_studio_id) {
        await releaseStudio({
          studioId: application.assigned_studio_id,
          applicationId: application.id,
        });
      }

      await reserveStudio({
        studioId,
        applicationId: application.id,
        studentId: user.id,
      });

      toast({
        title: "Studio reserved",
        description:
          "Finish your booking journey within 30 minutes to confirm this studio.",
      });
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "That studio may have just been reserved. Try another one.";
      toast({
        variant: "destructive",
        title: "Reservation failed",
        description: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = async () => {
    if (!application?.assigned_studio_id || !applicationId) return;

    setSaving(true);
    try {
      await releaseStudio({
        studioId: application.assigned_studio_id,
        applicationId,
      });
      toast({
        title: "Reservation released",
        description: "Select another studio when you're ready.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to release reservation",
        description: "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (application?.assigned_studio_id) {
      navigate(`/portal/applications/${application.id}`);
    } else {
      toast({
        variant: "destructive",
        title: "Select a studio first",
        description: "Reserve a studio to continue with your booking journey.",
      });
    }
  };

  const reservationExpiry = application?.reserved_studio_expires_at
    ? formatDistanceToNow(
        new Date(application.reserved_studio_expires_at),
        { addSuffix: true },
      )
    : null;

  const StudioSelectionSkeleton = () => (
    <div className="space-y-6 pb-28">
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-3xl border border-border/60 px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (applicationLoading) {
    return (
      <PortalLayout title="Select Studio" subtitle="Loading your application" hideNav={true}>
        <StudioSelectionSkeleton />
      </PortalLayout>
    );
  }

  if (!application || !studioGradeId) {
    return (
      <PortalLayout
        title="Select Studio"
        subtitle="We couldn't find the associated studio grade."
        onBack={() => navigate("/portal")}
        hideNav={true}
      >
        <Card className="rounded-3xl border-dashed">
          <CardHeader>
            <CardTitle className="text-2xl font-display uppercase tracking-wide">
              Application Not Found
            </CardTitle>
            <CardDescription>
              Your application could not be located. Return to the dashboard to
              start again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="rounded-full uppercase tracking-wide"
              onClick={() => navigate("/portal")}
            >
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title="Select Studio"
      subtitle="Reserve your studio to continue your booking journey."
      backLabel="Back"
      onBack={() => {
        if (application?.contract?.slug) {
          navigate(`/contracts/${encodeURIComponent(application.contract.slug)}`);
        } else {
          navigate("/portal/dashboard");
        }
      }}
    >
      <section className="space-y-6 pb-28">
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Available Studios
            </CardTitle>
            <CardDescription>
              Choose a studio to reserve it for 30 minutes while you finish your
              booking journey.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {studiosLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-3xl border border-border/60 px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {availableStudios?.map((studio) => {
                  const isSelected =
                    studio.id === application.assigned_studio_id;
                  const isAvailable = studio.status === "available";
                  const isOccupied = studio.status === "occupied";
                  const isReservedByOther =
                    studio.status === "reserved" &&
                    studio.allocation !== application.student_id;
                  const isExpiredReservation =
                    studio.status === "reserved" &&
                    studio.reservation_expires_at &&
                    new Date(studio.reservation_expires_at).getTime() <
                      Date.now();

                  let statusLabel = "Available";
                  if (!isAvailable) {
                    statusLabel =
                      studio.status === "occupied"
                        ? "Occupied"
                        : studio.status === "maintenance"
                        ? "Maintenance"
                        : isSelected
                        ? "Reserved by you"
                        : "Reserved";
                  }

                  const disabled =
                    (!isAvailable && !isExpiredReservation && !isSelected) ||
                    saving ||
                    reserving;

                  const cardClasses = `rounded-3xl border px-5 py-4 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-lg"
                      : isOccupied
                      ? "border-gray-300 bg-gray-50/50"
                      : isAvailable
                      ? "border-green-200 bg-green-50/30 hover:border-green-300 hover:bg-green-50/50 hover:-translate-y-1 hover:shadow-md"
                      : "border-amber-200 bg-amber-50/30 hover:border-amber-300 hover:bg-amber-50/50 hover:-translate-y-1"
                  } ${
                    disabled && !isSelected
                      ? "opacity-60 cursor-not-allowed"
                      : ""
                  }`;

                  const cardContent = (
                    <>
                      <div className="flex items-center justify-between">
                        <p
                          className={`text-lg font-display font-black uppercase tracking-wide ${
                            isOccupied
                              ? "text-gray-500"
                              : isAvailable
                              ? "text-green-700"
                              : "text-foreground"
                          }`}
                        >
                          {studio.studio_number}
                        </p>
                        <span
                          className={`text-xs font-semibold uppercase tracking-[0.3em] px-2 py-1 rounded-full ${
                            isSelected
                              ? "text-primary bg-primary/10"
                              : isOccupied
                              ? "text-gray-600 bg-gray-200"
                              : isAvailable
                              ? "text-green-700 bg-green-100"
                              : "text-amber-700 bg-amber-100"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div
                        className={`mt-3 space-y-2 text-sm ${
                          isOccupied
                            ? "text-gray-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {studio.floor && (
                          <p className="flex items-center gap-2">
                            <MapPin
                              className={`h-4 w-4 ${
                                isOccupied
                                  ? "text-gray-400"
                                  : isAvailable
                                  ? "text-green-600"
                                  : "text-primary"
                              }`}
                            />
                            Floor {studio.floor}
                          </p>
                        )}
                        {studio.status === "reserved" &&
                          studio.reservation_expires_at && (
                            <p className="flex items-center gap-2 text-xs text-amber-600">
                              <Clock className="h-4 w-4" />
                              Reserved until{" "}
                              {formatDistanceToNow(
                                new Date(studio.reservation_expires_at),
                                { addSuffix: true },
                              )}
                            </p>
                          )}
                        {isReservedByOther && (
                          <p className="flex items-center gap-2 text-xs text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                            Reserved by another student
                          </p>
                        )}
                      </div>
                    </>
                  );

                  if (isSelected) {
                    return (
                      <div key={studio.id} className={cardClasses}>
                        <div className="text-left">{cardContent}</div>
                        <Button
                          className="mt-4 w-full rounded-full uppercase tracking-wide gap-2"
                          onClick={handleContinue}
                          disabled={saving}
                        >
                          Continue to booking
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={studio.id}
                      type="button"
                      className={`text-left w-full ${cardClasses}`}
                      onClick={() => handleSelect(studio.id)}
                      disabled={disabled}
                    >
                      {cardContent}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur lg:left-64">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-3 md:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              {selectedStudio ? (
                <>
                  <p className="font-display font-black uppercase tracking-wide truncate">
                    {selectedStudio.studio_number} reserved
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Complete before{" "}
                      <strong>{reservationExpiry ?? "the reservation expires"}</strong>
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a studio to continue your booking journey.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                className="rounded-full uppercase tracking-wide"
                onClick={() => navigate("/portal")}
              >
                Save for later
              </Button>
              {selectedStudio && (
                <Button
                  variant="ghost"
                  className="rounded-full uppercase tracking-wide"
                  onClick={handleRelease}
                  disabled={saving || releasing}
                >
                  {releasing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Release"
                  )}
                </Button>
              )}
              <Button
                className="rounded-full uppercase tracking-wide gap-2"
                onClick={handleContinue}
                disabled={!application.assigned_studio_id || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export default StudioSelection;

