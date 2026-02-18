import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  X,
  FileText,
  User,
  Database,
} from "lucide-react";
import { format } from "date-fns";

interface FailedRecord {
  row_number?: number;
  email?: string;
  reason: string;
  stage?: "user_creation" | "database_import";
}

interface ImportResults {
  success: boolean;
  partial?: boolean;
  total_rows: number;
  succeeded: number;
  failed: number;
  skipped?: number;
  pre_import_failed?: number;
  import_failed?: number;
  errors?: FailedRecord[];
  user_creation_errors?: Array<{ email: string; error: string }>;
  import_history_id?: string;
}

interface ImportResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: ImportResults | null;
  importType?: string;
}

const ImportResultsDialog = ({
  open,
  onOpenChange,
  results,
  importType,
}: ImportResultsDialogProps) => {
  if (!results) return null;

  const { succeeded, failed, total_rows, partial, skipped = 0, errors = [], user_creation_errors = [] } = results;
  const successRate = total_rows > 0 ? (((succeeded + skipped) / total_rows) * 100).toFixed(1) : "0";

  const handleDownloadFailed = () => {
    if (!errors || errors.length === 0) return;

    // Create CSV content
    const headers = ["Row Number", "Email", "Stage", "Error Reason"];
    const rows = errors.map((e) => [
      e.row_number?.toString() || "",
      e.email || "",
      e.stage || "",
      e.reason || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {succeeded > 0 && failed === 0 ? (
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            ) : succeeded > 0 && failed > 0 ? (
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-full">
                <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            ) : (
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-full">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            )}
            <div className="flex-1">
              <DialogTitle className="text-xl font-display uppercase tracking-wide">
                {succeeded > 0 && failed === 0
                  ? "Import Completed Successfully"
                  : succeeded > 0 && failed > 0
                  ? "Import Completed with Errors"
                  : "Import Failed"}
              </DialogTitle>
              <DialogDescription>
                {importType && (
                  <span className="capitalize">{importType.replace(/_/g, " ")}</span>
                )}{" "}
                import results
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Summary Cards */}
          <div className={`grid gap-4 ${skipped > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <div className="rounded-2xl border border-border/60 p-4 bg-muted/30">
              <div className="text-sm text-muted-foreground mb-1">Total Rows</div>
              <div className="text-2xl font-bold">{total_rows}</div>
            </div>
            <div className="rounded-2xl border border-green-500/20 p-4 bg-green-500/5">
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Succeeded
              </div>
              <div className="text-2xl font-bold text-green-600">{succeeded}</div>
              <div className="text-xs text-muted-foreground mt-1">{successRate}%</div>
            </div>
            {skipped > 0 && (
              <div className="rounded-2xl border border-amber-500/20 p-4 bg-amber-500/5">
                <div className="text-sm text-muted-foreground mb-1">Skipped</div>
                <div className="text-2xl font-bold text-amber-600">{skipped}</div>
                <div className="text-xs text-muted-foreground mt-1">Already had application</div>
              </div>
            )}
            <div className="rounded-2xl border border-red-500/20 p-4 bg-red-500/5">
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-600" />
                Failed
              </div>
              <div className="text-2xl font-bold text-red-600">{failed}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {total_rows > 0 ? ((failed / total_rows) * 100).toFixed(1) : "0"}%
              </div>
            </div>
          </div>

          {/* Breakdown */}
          {results.pre_import_failed !== undefined && results.pre_import_failed > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">User Creation:</span>
                <Badge variant="outline" className="text-red-600 border-red-600">
                  {results.pre_import_failed} failed
                </Badge>
              </div>
              {results.import_failed !== undefined && results.import_failed > 0 && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Database Import:</span>
                    <Badge variant="outline" className="text-red-600 border-red-600">
                      {results.import_failed} failed
                    </Badge>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Failed Records */}
          {failed > 0 && errors.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Failed Records ({errors.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadFailed}
                  className="rounded-full uppercase tracking-wide gap-2 text-xs"
                >
                  <Download className="h-3 w-3" />
                  Download CSV
                </Button>
              </div>
              <ScrollArea className="flex-1 border rounded-2xl p-4">
                <div className="space-y-3">
                  {errors.map((error, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {error.stage === "user_creation" ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
                              >
                                <User className="h-3 w-3 mr-1" />
                                User Creation
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700"
                              >
                                <Database className="h-3 w-3 mr-1" />
                                Import
                              </Badge>
                            )}
                            {error.row_number && (
                              <span className="text-xs text-muted-foreground">
                                Row {error.row_number}
                              </span>
                            )}
                          </div>
                          {error.email && (
                            <div className="text-sm font-medium mb-1 break-words">
                              {error.email}
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground break-words">
                            {error.reason}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Success Message */}
          {succeeded > 0 && failed === 0 && (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">All records imported successfully!</span>
              </div>
            </div>
          )}

          {/* Partial Success Message */}
          {partial && succeeded > 0 && failed > 0 && (
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">
                  {succeeded} record(s) imported successfully. {failed} record(s) failed.
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Review the failed records above. You can download them as CSV to fix and re-import.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full uppercase tracking-wide"
          >
            Close
          </Button>
          {failed > 0 && (
            <Button
              onClick={handleDownloadFailed}
              className="rounded-full uppercase tracking-wide gap-2"
            >
              <Download className="h-4 w-4" />
              Download Failed Records
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportResultsDialog;

