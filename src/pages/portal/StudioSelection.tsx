import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, MapPin, Clock, AlertTriangle } from "lucide-react";
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

  const {
    data: studios,
    isLoading: studiosLoading,
    refetch: refetchStudios,
  } = useStudios(studioGradeId ?? undefined);

  // Safety check: Get studios with confirmed applications for this contract
  const { data: occupiedStudioIds } = useQuery({
    queryKey: ["occupied-studios", application?.contract_id],
    queryFn: async () => {
      if (!application?.contract_id) return [];
      
      const { data, error } = await supabase
        .from("student_applications")
        .select("assigned_studio_id")
        .eq("contract_id", application.contract_id)
        .eq("status", "confirmed")
        .not("assigned_studio_id", "is", null);
      
      if (error) {
        console.error("Error fetching occupied studios:", error);
        return [];
      }
      
      return (data || []).map((app) => app.assigned_studio_id).filter(Boolean) as string[];
    },
    enabled: Boolean(application?.contract_id),
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Filter out studios with confirmed applications for this contract (safety check)
  const availableStudios = useMemo(() => {
    if (!studios || !occupiedStudioIds) return studios;
    return studios.filter((studio) => {
      // Always show the selected studio even if it has a confirmed application
      if (studio.id === application?.assigned_studio_id) return true;
      // Filter out studios with confirmed applications for this contract
      return !occupiedStudioIds.includes(studio.id);
    });
  }, [studios, occupiedStudioIds, application?.assigned_studio_id]);

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
      toast({
        variant: "destructive",
        title: "Reservation failed",
        description: "That studio may have just been reserved. Try another one.",
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
    <div className="space-y-6">
      <Card className="rounded-3xl border border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </CardHeader>
      </Card>
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
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>
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
      <section className="space-y-6">
        {selectedStudio && (
          <Card className="rounded-3xl border border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  {selectedStudio.studio_number} reserved
                </CardTitle>
                <CardDescription>
                  Complete your booking before{" "}
                  <strong>{reservationExpiry ?? "the reservation expires"}</strong>.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="rounded-full uppercase tracking-wide"
                  onClick={handleRelease}
                  disabled={saving || releasing}
                >
                  Release
                </Button>
                <Button
                  className="rounded-full uppercase tracking-wide"
                  onClick={handleContinue}
                  disabled={saving}
                >
                  Continue
                </Button>
              </div>
            </CardHeader>
          </Card>
        )}

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

                  return (
                    <button
                      key={studio.id}
                      className={`text-left rounded-3xl border px-5 py-4 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-lg"
                          : isOccupied
                          ? "border-gray-300 bg-gray-50/50 cursor-not-allowed"
                          : isAvailable
                          ? "border-green-200 bg-green-50/30 hover:border-green-300 hover:bg-green-50/50 hover:-translate-y-1 hover:shadow-md"
                          : "border-amber-200 bg-amber-50/30 hover:border-amber-300 hover:bg-amber-50/50 hover:-translate-y-1"
                      } ${
                        disabled && !isSelected
                          ? "opacity-60 cursor-not-allowed"
                          : ""
                      }`}
                      onClick={() => handleSelect(studio.id)}
                      disabled={disabled}
                    >
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
                            : isAvailable
                            ? "text-muted-foreground"
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
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-full uppercase tracking-wide"
            onClick={() => navigate("/portal")}
          >
            Save for later
          </Button>
          <Button
            className="rounded-full uppercase tracking-wide"
            onClick={handleContinue}
            disabled={!application.assigned_studio_id || saving}
          >
            Continue to booking journey
          </Button>
        </div>
      </section>
    </PortalLayout>
  );
};

export default StudioSelection;

