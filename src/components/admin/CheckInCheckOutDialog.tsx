import { useEffect, useState } from "react";
import { format } from "date-fns";
import { LogIn, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCheckInCheckOut } from "@/hooks/useCheckInCheckOut";
import { useToast } from "@/hooks/use-toast";

export type CheckInCheckOutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  studentName?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  actualCheckInDate?: string | null;
  actualCheckOutDate?: string | null;
  checkInNotes?: string | null;
  checkOutNotes?: string | null;
  showViewApplicationLink?: boolean;
  onViewApplication?: () => void;
};

export function CheckInCheckOutDialog({
  open,
  onOpenChange,
  applicationId,
  studentName,
  contractStart,
  contractEnd,
  actualCheckInDate,
  actualCheckOutDate,
  checkInNotes: initialCheckInNotes,
  checkOutNotes: initialCheckOutNotes,
  showViewApplicationLink = false,
  onViewApplication,
}: CheckInCheckOutDialogProps) {
  const { toast } = useToast();
  const updateCheckInOut = useUpdateCheckInCheckOut();
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkOutNotes, setCheckOutNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setCheckInDate(actualCheckInDate ?? "");
    setCheckOutDate(actualCheckOutDate ?? "");
    setCheckInNotes(initialCheckInNotes ?? "");
    setCheckOutNotes(initialCheckOutNotes ?? "");
  }, [
    open,
    actualCheckInDate,
    actualCheckOutDate,
    initialCheckInNotes,
    initialCheckOutNotes,
  ]);

  const formatContractDate = (value?: string | null) => {
    if (!value) return null;
    try {
      return format(new Date(value), "MMM d, yyyy");
    } catch {
      return value;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl">
        <DialogHeader>
          <DialogTitle>Check-in / Check-out</DialogTitle>
          <DialogDescription>
            {studentName ? (
              <>
                Manage check-in and check-out dates for <strong>{studentName}</strong>
              </>
            ) : (
              "Manage check-in and check-out dates for this booking."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {(contractStart || contractEnd) && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Contract dates
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {formatContractDate(contractStart) ?? "—"} – {formatContractDate(contractEnd) ?? "—"}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="check_in_date" className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Check-in date
              </Label>
              <Input
                id="check_in_date"
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to clear actual check-in (contract start still applies).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="check_out_date" className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Check-out date
              </Label>
              <Input
                id="check_out_date"
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to clear actual check-out (contract end still applies).
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="check_in_notes">Check-in notes (optional)</Label>
            <Textarea
              id="check_in_notes"
              value={checkInNotes}
              onChange={(e) => setCheckInNotes(e.target.value)}
              placeholder="Add any notes about check-in..."
              rows={2}
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="check_out_notes">Check-out notes (optional)</Label>
            <Textarea
              id="check_out_notes"
              value={checkOutNotes}
              onChange={(e) => setCheckOutNotes(e.target.value)}
              placeholder="Add any notes about check-out..."
              rows={2}
              className="rounded-2xl"
            />
          </div>

          {showViewApplicationLink && onViewApplication && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onViewApplication}
                className="rounded-md gap-2"
              >
                View full application
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-md"
            disabled={updateCheckInOut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                await updateCheckInOut.mutateAsync({
                  applicationId,
                  checkInDate: checkInDate || null,
                  checkOutDate: checkOutDate || null,
                  checkInNotes: checkInNotes.trim() || null,
                  checkOutNotes: checkOutNotes.trim() || null,
                });
                toast({
                  title: "Check-in/Check-out updated",
                  description: "The dates have been updated successfully.",
                });
                onOpenChange(false);
              } catch (error: unknown) {
                toast({
                  variant: "destructive",
                  title: "Error",
                  description:
                    error instanceof Error
                      ? error.message
                      : "Failed to update dates. Please try again.",
                });
              }
            }}
            disabled={updateCheckInOut.isPending}
            className="rounded-md uppercase tracking-wide gap-2"
          >
            {updateCheckInOut.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
