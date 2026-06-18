import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { useAmendStudentApplicationBooking } from "@/hooks/useAmendStudentApplicationBooking";
import {
  clampExtraDays,
  computeContractEndDate,
  computeContractTotal,
  datesToWeeksAndExtraDays,
  formatContractDuration,
} from "@/utils/contractDuration";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  hasAnyActiveEnvelopes,
  hasCompletedActiveEnvelopes,
  hasSentActiveEnvelopes,
  type EnvelopeLike,
} from "@/utils/envelopeStatus";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AmendBookingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  academicYearId?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  weeks?: number | null;
  extraDays?: number | null;
  studioGradeId?: string | null;
  weeklyPrice?: number | null;
  requestedStart?: string | null;
  requestedEnd?: string | null;
  isFlexiblePlaceholder?: boolean;
  docusignEnvelopes?: EnvelopeLike[] | null;
  onSuccess?: () => void;
};

function sliceDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function AmendBookingDialog({
  open,
  onOpenChange,
  applicationId,
  academicYearId,
  contractStart,
  contractEnd,
  weeks,
  extraDays,
  studioGradeId,
  weeklyPrice,
  requestedStart,
  requestedEnd,
  isFlexiblePlaceholder,
  docusignEnvelopes,
  onSuccess,
}: AmendBookingDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const amendBooking = useAmendStudentApplicationBooking();
  const { data: gradesData } = useAdminStudioGrades(academicYearId ?? undefined);

  const { data: academicYear } = useQuery({
    queryKey: ["academic-year-bounds", academicYearId],
    queryFn: async () => {
      if (!academicYearId) return null;
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, start_date, end_date, min_flexible_weeks")
        .eq("id", academicYearId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!academicYearId,
  });

  const [startDate, setStartDate] = useState("");
  const [weeksValue, setWeeksValue] = useState(1);
  const [extraDaysValue, setExtraDaysValue] = useState(0);
  const [endDate, setEndDate] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [reason, setReason] = useState("");
  const [resetSigning, setResetSigning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const hasEnvelopes = hasAnyActiveEnvelopes(docusignEnvelopes);
  const hasCompletedEnvelopes = hasCompletedActiveEnvelopes(docusignEnvelopes);
  const hasSentEnvelopes = hasSentActiveEnvelopes(docusignEnvelopes);

  useEffect(() => {
    if (!open) return;

    const initialStart = isFlexiblePlaceholder && requestedStart
      ? sliceDate(requestedStart)
      : sliceDate(contractStart);

    let initialWeeks = weeks ?? 1;
    let initialExtra = clampExtraDays(extraDays ?? 0);

    if (isFlexiblePlaceholder && requestedStart && requestedEnd) {
      const derived = datesToWeeksAndExtraDays(
        sliceDate(requestedStart),
        sliceDate(requestedEnd),
      );
      initialWeeks = derived.weeks;
      initialExtra = derived.extraDays;
    } else if (contractStart && contractEnd && !weeks) {
      const derived = datesToWeeksAndExtraDays(
        sliceDate(contractStart),
        sliceDate(contractEnd),
      );
      initialWeeks = derived.weeks;
      initialExtra = derived.extraDays;
    }

    setStartDate(initialStart);
    setWeeksValue(Math.max(1, initialWeeks));
    setExtraDaysValue(initialExtra);
    setEndDate(
      computeContractEndDate(initialStart, Math.max(1, initialWeeks), initialExtra),
    );
    setGradeId(studioGradeId ?? "");
    setReason("");
    setResetSigning(hasCompletedEnvelopes || hasSentEnvelopes);
    setValidationError(null);
  }, [
    open,
    contractStart,
    contractEnd,
    weeks,
    extraDays,
    studioGradeId,
    requestedStart,
    requestedEnd,
    isFlexiblePlaceholder,
    hasCompletedEnvelopes,
    hasSentEnvelopes,
  ]);

  const computedEnd = useMemo(
    () => computeContractEndDate(startDate, weeksValue, extraDaysValue),
    [startDate, weeksValue, extraDaysValue],
  );

  const previewTotal = useMemo(
    () => computeContractTotal(weeklyPrice ?? 0, weeksValue, extraDaysValue),
    [weeklyPrice, weeksValue, extraDaysValue],
  );

  useEffect(() => {
    if (computedEnd) setEndDate(computedEnd);
  }, [computedEnd]);

  useEffect(() => {
    if (!open) return;
    if (!startDate) {
      setValidationError("Check-in date is required.");
      return;
    }
    if (weeksValue < 1) {
      setValidationError("Weeks must be at least 1.");
      return;
    }
    const yearStart = academicYear?.start_date
      ? sliceDate(academicYear.start_date)
      : null;
    const yearEnd = academicYear?.end_date ? sliceDate(academicYear.end_date) : null;
    if (yearStart && startDate < yearStart) {
      setValidationError("Check-in must be within the academic year.");
      return;
    }
    if (yearEnd && computedEnd && computedEnd > yearEnd) {
      setValidationError("Check-out must be within the academic year.");
      return;
    }
    const minWeeks = academicYear?.min_flexible_weeks ?? 1;
    const effectiveWeeks = weeksValue + clampExtraDays(extraDaysValue) / 7;
    if (effectiveWeeks < minWeeks) {
      setValidationError(`Minimum stay is ${minWeeks} week${minWeeks === 1 ? "" : "s"}.`);
      return;
    }
    if (!gradeId) {
      setValidationError("Studio grade is required.");
      return;
    }
    setValidationError(null);
  }, [
    open,
    startDate,
    weeksValue,
    extraDaysValue,
    computedEnd,
    academicYear,
    gradeId,
  ]);

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    if (!startDate || !value) return;
    const { weeks: w, extraDays: d } = datesToWeeksAndExtraDays(startDate, value);
    setWeeksValue(w);
    setExtraDaysValue(d);
  };

  const handleSubmit = async () => {
    if (validationError || !applicationId || !startDate || !gradeId) return;

    try {
      const result = await amendBooking.mutateAsync({
        applicationId,
        contractStart: startDate,
        weeks: weeksValue,
        extraDays: extraDaysValue,
        studioGradeId: gradeId,
        reason: reason.trim() || null,
        resetSigning: hasEnvelopes ? resetSigning : false,
      });

      const nextSteps =
        hasEnvelopes && resetSigning
          ? " Signing status was reset — use Resend agreements on the application page."
          : hasEnvelopes
            ? " Existing agreements may not match the new terms — resend or re-upload when ready."
            : "";

      toast({
        title: "Booking amended",
        description: `New stay: ${result.contract_start} → ${result.contract_end} (${formatContractDuration({ weeks: result.weeks, extra_days: result.extra_days })}).${nextSteps}`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Could not amend booking",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const sheetClass = cn(
    "flex flex-col gap-0 overflow-hidden p-4 sm:p-6",
    isMobile ? "max-h-[90vh] mb-0 rounded-t-2xl" : "h-full w-full sm:max-w-lg",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={sheetClass}>
        <SheetHeader className="flex-shrink-0 text-left space-y-1 pr-10">
          <SheetTitle className="text-xl font-display uppercase tracking-wide">
            Amend booking
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Updates check-in, check-out, and studio grade. Creates a new per-application contract;
            the original contract is kept for audit. Payment plan and journey data are preserved.
          </p>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amend-check-in">Check-in</Label>
            <Input
              id="amend-check-in"
              type="date"
              value={startDate}
              min={academicYear?.start_date ? sliceDate(academicYear.start_date) : undefined}
              max={academicYear?.end_date ? sliceDate(academicYear.end_date) : undefined}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                setEndDate(computeContractEndDate(next, weeksValue, extraDaysValue));
              }}
              className="rounded-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amend-weeks">Weeks</Label>
              <Input
                id="amend-weeks"
                type="number"
                min={1}
                max={52}
                value={weeksValue}
                onChange={(e) => {
                  const w = Math.max(1, parseInt(e.target.value, 10) || 1);
                  setWeeksValue(w);
                  setEndDate(computeContractEndDate(startDate, w, extraDaysValue));
                }}
                className="rounded-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amend-extra-days">Extra days (0–6)</Label>
              <Input
                id="amend-extra-days"
                type="number"
                min={0}
                max={6}
                value={extraDaysValue}
                onChange={(e) => {
                  const d = clampExtraDays(parseInt(e.target.value, 10) || 0);
                  setExtraDaysValue(d);
                  setEndDate(computeContractEndDate(startDate, weeksValue, d));
                }}
                className="rounded-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amend-check-out">Check-out</Label>
            <Input
              id="amend-check-out"
              type="date"
              value={endDate}
              min={startDate ? computeContractEndDate(startDate, 1, 0) : undefined}
              max={academicYear?.end_date ? sliceDate(academicYear.end_date) : undefined}
              disabled={!startDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="rounded-full"
            />
            <p className="text-[11px] text-muted-foreground">
              Duration: {formatContractDuration({ weeks: weeksValue, extra_days: extraDaysValue })}
              {weeklyPrice != null && weeklyPrice > 0 && (
                <> · Est. contract total £{previewTotal.toFixed(2)}</>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Studio grade</Label>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {(gradesData?.grades ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gradeId && studioGradeId && gradeId !== studioGradeId && (
              <p className="text-[11px] text-amber-700">
                Grade change will clear the assigned studio if it no longer matches.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amend-reason">Reason (optional)</Label>
            <Textarea
              id="amend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Student requested different start date"
              className="rounded-xl min-h-[72px]"
            />
          </div>

          {hasEnvelopes && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-3">
              <p className="text-xs text-amber-900 leading-snug">
                This application already has agreement envelopes. Amending the booking does not
                automatically update signed documents — terms may be out of date until you resend
                or re-upload agreements.
              </p>
              {(hasCompletedEnvelopes || hasSentEnvelopes) && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="amend-reset-signing"
                    checked={resetSigning}
                    onCheckedChange={(checked) => setResetSigning(checked === true)}
                  />
                  <Label
                    htmlFor="amend-reset-signing"
                    className="text-xs font-normal leading-snug cursor-pointer"
                  >
                    Reset signing status (mark current agreements as superseded and return
                    application to awaiting signature)
                  </Label>
                </div>
              )}
            </div>
          )}

          {validationError && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}
        </div>

        <SheetFooter className="flex-shrink-0 flex-row gap-2 pt-4 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            className="rounded-full flex-1"
            onClick={() => onOpenChange(false)}
            disabled={amendBooking.isPending}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full flex-1"
            disabled={amendBooking.isPending || !!validationError}
            onClick={() => void handleSubmit()}
          >
            {amendBooking.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              "Save amendment"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
