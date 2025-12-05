import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  FileCheck,
  ArrowRight,
  Info,
  FileX,
  Sparkles,
  Database,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  getTemplateGenerator,
  downloadCSV,
  type CSVTemplateOptions,
} from "@/utils/csvTemplateGenerator";

const IMPORT_TYPES = [
  {
    value: "academic_years",
    label: "Academic Years",
    description: "Import academic year definitions",
    dependencies: [],
    icon: "📅",
  },
  {
    value: "studio_grades",
    label: "Studio Grades",
    description: "Import studio grade types (Silver, Gold, etc.)",
    dependencies: [],
    icon: "⭐",
  },
  {
    value: "studios",
    label: "Studios",
    description: "Import individual studio units (one-time upload)",
    dependencies: ["studio_grades"],
    icon: "🏠",
  },
  {
    value: "studio_grade_prices",
    label: "Studio Grade Prices",
    description: "Import pricing per academic year + grade",
    dependencies: ["academic_years", "studio_grades"],
    icon: "💰",
  },
  {
    value: "payment_plans",
    label: "Payment Plans",
    description: "Import payment plan definitions",
    dependencies: ["academic_years"],
    icon: "💳",
  },
  {
    value: "payment_plan_installments",
    label: "Payment Plan Installments",
    description: "Import installment schedules",
    dependencies: ["payment_plans"],
    icon: "📊",
  },
  {
    value: "contracts",
    label: "Contracts",
    description: "Import contract templates",
    dependencies: ["academic_years", "studio_grades", "payment_plans"],
    icon: "📄",
  },
  {
    value: "partners",
    label: "Partners",
    description: "Import partner referral organizations",
    dependencies: [],
    icon: "🤝",
  },
  {
    value: "cashback_campaigns",
    label: "Cashback Campaigns",
    description: "Import cashback campaign definitions",
    dependencies: [],
    icon: "🎁",
  },
  {
    value: "applications",
    label: "Applications",
    description: "Import historical student applications (requires contracts, studios). Academic year is determined by the contract.",
    dependencies: ["contracts", "studios"],
    icon: "📋",
  },
];

type ImportStatus = "idle" | "uploading" | "processing" | "completed" | "error";

const DataImport = () => {
  const [importType, setImportType] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>("");
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [importResults, setImportResults] = useState<any>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);

  const { toast } = useToast();

  const selectedImportType = IMPORT_TYPES.find((t) => t.value === importType);

  const handleTemplateDownload = async () => {
    if (!importType) {
      toast({
        variant: "destructive",
        title: "Select import type",
        description: "Please select an import type first",
      });
      return;
    }

    setLoadingTemplate(true);
    try {
      const generator = getTemplateGenerator(importType);
      if (!generator) {
        throw new Error("Template generator not found");
      }

      const csv = await generator({ includeHeaders: true, includeExampleData: true });
      const filename = `${importType}_template.csv`;
      downloadCSV(csv, filename);

      toast({
        title: "Template downloaded",
        description: `Downloaded ${filename} with all current data`,
      });
    } catch (error: any) {
      console.error("Error generating template:", error);
      toast({
        variant: "destructive",
        title: "Failed to generate template",
        description: error.message || "An error occurred",
      });
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please select a CSV file",
      });
      return;
    }

    setSelectedFile(file);
    setCsvContent("");
    setImportResults(null);

    try {
      const text = await file.text();
      setCsvContent(text);
      setStatus("idle");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error reading file",
        description: error.message,
      });
    }
  };

  const handleImport = async () => {
    if (!importType || !csvContent) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please select import type and upload CSV file",
      });
      return;
    }

    setImporting(true);
    setStatus("processing");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("bulk-import-data", {
        body: {
          import_type: importType,
          csv_data: csvContent,
          file_name: selectedFile?.name || "import.csv",
          options: {
            validate_only: false,
            skip_duplicates: false,
            dry_run: false,
          },
        },
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;
      setImportResults(result);
      setStatus(result.success ? "completed" : "error");

      if (result.success) {
        toast({
          title: "Import completed",
          description: `${result.succeeded} succeeded, ${result.failed} failed`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Import failed",
          description: result.error || "An error occurred during import",
        });
      }
    } catch (error: any) {
      console.error("Import error:", error);
      setStatus("error");
      toast({
        variant: "destructive",
        title: "Import failed",
        description: error.message || "An error occurred during import",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setImportType("");
    setSelectedFile(null);
    setCsvContent("");
    setStatus("idle");
    setImportResults(null);
    // Reset file input
    const fileInput = document.getElementById("csv-file") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const rowCount = csvContent ? csvContent.split("\n").filter((line) => line.trim()).length - 1 : 0;

  return (
    <AdminLayout pageTitle="Bulk Data Import">
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header Card */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Database className="h-6 w-6 text-primary" />
                  Bulk Data Import
                </CardTitle>
                <CardDescription className="text-base">
                  Import large datasets from CSV files. Templates include all current system data as examples.
                </CardDescription>
              </div>
              <Badge variant="outline" className="hidden sm:flex">
                <Sparkles className="h-3 w-3 mr-1" />
                Production Ready
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Main Import Card */}
        <Card>
          <CardHeader>
            <CardTitle>Import Configuration</CardTitle>
            <CardDescription>
              Select the data type you want to import and upload your CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Import Type Selection */}
            <div className="space-y-3">
              <Label htmlFor="import-type" className="text-base font-semibold">
                Import Type <span className="text-destructive">*</span>
              </Label>
              <Select value={importType} onValueChange={setImportType}>
                <SelectTrigger id="import-type" className="h-12">
                  <SelectValue placeholder="Select the type of data to import" />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col py-1">
                        <span className="font-medium flex items-center gap-2">
                          <span>{type.icon}</span>
                          {type.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {type.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedImportType && selectedImportType.dependencies.length > 0 && (
                <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-900 dark:text-amber-100">
                    Dependencies Required
                  </AlertTitle>
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    Ensure these are imported first:{" "}
                    <strong>{selectedImportType.dependencies.join(", ")}</strong>
                  </AlertDescription>
                </Alert>
              )}
              {importType === "applications" && (
                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-900 dark:text-blue-100">
                    Academic Year Assignment
                  </AlertTitle>
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <strong>Academic year is automatically determined by the contract.</strong> When you specify a{" "}
                    <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs">contract_slug</code> in your CSV,
                    the system will look up the contract and assign the application to that contract's academic year. The{" "}
                    <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs">academic_year_name</code> column
                    in the template is informational only - it shows which academic year each contract belongs to.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Separator />

            {/* Template Download Section */}
            {importType && (
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border-2 border-dashed">
                <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      CSV Template
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Download a template with <strong>all current system data</strong> as examples. 
                      Use this as a reference for the CSV format and required fields.
                      {importType === "applications" && (
                        <span className="block mt-2 text-xs">
                          <strong>Note:</strong> The <code className="px-1 py-0.5 bg-muted rounded">academic_year_name</code> column shows which academic year each contract belongs to. Academic year is automatically assigned based on the contract.
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTemplateDownload}
                    disabled={loadingTemplate}
                    className="shrink-0"
                  >
                    {loadingTemplate ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Template
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* File Upload Section */}
            <div className="space-y-3">
              <Label htmlFor="csv-file" className="text-base font-semibold">
                CSV File <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-col gap-3">
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={!importType || importing}
                  className="h-12 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer disabled:cursor-not-allowed"
                />
                {selectedFile && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {(selectedFile.size / 1024).toFixed(2)} KB
                        </Badge>
                        {rowCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {rowCount} {rowCount === 1 ? "row" : "rows"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preview Section */}
            {csvContent && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    CSV Preview
                  </Label>
                  <div className="rounded-md border-2 p-4 bg-muted/30 max-h-64 overflow-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-foreground">
                      {csvContent.split("\n").slice(0, 15).join("\n")}
                      {csvContent.split("\n").length > 15 && (
                        <span className="text-muted-foreground">\n... (truncated)</span>
                      )}
                    </pre>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Showing first 15 lines. Total: {csvContent.split("\n").length} lines,{" "}
                    {rowCount} data {rowCount === 1 ? "row" : "rows"}
                  </p>
                </div>
              </>
            )}

            <Separator />

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              {(csvContent || importResults) && (
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={importing}
                  className="sm:order-first"
                >
                  <FileX className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              )}
              <Button
                onClick={handleImport}
                disabled={!importType || !csvContent || importing}
                size="lg"
                className="min-w-[140px]"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Data
                  </>
                )}
              </Button>
            </div>

            {/* Progress Section */}
            {status === "processing" && (
              <div className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Processing import...</span>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
                <Progress value={undefined} className="w-full h-2" />
                <p className="text-xs text-muted-foreground">
                  Please wait while we process your data. This may take a moment for large files.
                </p>
              </div>
            )}

            {/* Results Section */}
            {importResults && (
              <Card className="border-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {importResults.success && importResults.failed === 0 ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          Import Successful
                        </>
                      ) : (
                        <>
                          <XCircle className="h-5 w-5 text-red-600" />
                          Import Results
                        </>
                      )}
                    </CardTitle>
                    <Badge
                      variant={importResults.success && importResults.failed === 0 ? "default" : "destructive"}
                      className="text-sm"
                    >
                      {importResults.success && importResults.failed === 0
                        ? "Complete"
                        : `${importResults.failed} Error${importResults.failed !== 1 ? "s" : ""}`}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="text-center p-5 rounded-lg border-2 bg-muted/30">
                      <div className="text-3xl font-bold mb-1">{importResults.total_rows || 0}</div>
                      <div className="text-sm text-muted-foreground font-medium">Total Rows</div>
                    </div>
                    <div className="text-center p-5 rounded-lg border-2 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                        {importResults.succeeded || 0}
                      </div>
                      <div className="text-sm text-muted-foreground font-medium">Succeeded</div>
                    </div>
                    <div className="text-center p-5 rounded-lg border-2 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">
                        {importResults.failed || 0}
                      </div>
                      <div className="text-sm text-muted-foreground font-medium">Failed</div>
                    </div>
                  </div>

                  {/* Success Message */}
                  {importResults.success && importResults.failed === 0 && (
                    <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-900 dark:text-green-100">
                        All rows imported successfully
                      </AlertTitle>
                      <AlertDescription className="text-green-800 dark:text-green-200">
                        All {importResults.succeeded} rows have been imported successfully. Your data is now available in the system.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Errors List */}
                  {importResults.errors && importResults.errors.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        Error Details
                      </Label>
                      <div className="max-h-96 overflow-auto space-y-2 border rounded-lg p-4 bg-muted/30">
                        {importResults.errors.slice(0, 20).map((error: any, idx: number) => (
                          <Alert key={idx} variant="destructive" className="py-3">
                            <XCircle className="h-4 w-4" />
                            <AlertTitle className="text-sm">
                              Row {error.row_number || idx + 1}
                            </AlertTitle>
                            <AlertDescription className="text-xs mt-1">
                              {error.error || error.error_message || "Unknown error"}
                            </AlertDescription>
                          </Alert>
                        ))}
                        {importResults.errors.length > 20 && (
                          <p className="text-sm text-muted-foreground text-center pt-2 border-t">
                            ...and {importResults.errors.length - 20} more error
                            {importResults.errors.length - 20 !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Import Order Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Recommended Import Order
            </CardTitle>
            <CardDescription>
              Follow this order to ensure all dependencies are met before importing related data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  step: 1,
                  items: ["Academic Years", "Studio Grades"],
                  note: "Foundation data types",
                },
                {
                  step: 2,
                  items: ["Studios"],
                  note: "One-time upload - studios don't change yearly",
                },
                {
                  step: 3,
                  items: [
                    "Studio Grade Prices",
                    "Payment Plans",
                    "Payment Plan Installments",
                  ],
                  note: "Academic year-specific pricing and payment options",
                },
                {
                  step: 4,
                  items: ["Contracts"],
                  note: "Requires academic years, studio grades, and payment plans",
                },
                {
                  step: 5,
                  items: ["Partners", "Cashback Campaigns"],
                  note: "Optional - for referral and promotion programs",
                },
                {
                  step: 6,
                  items: ["Applications"],
                  note: "Historical student applications (requires contracts and studios). Users are auto-created if needed.",
                },
              ].map(({ step, items, note }) => (
                <div
                  key={step}
                  className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg border bg-muted/30"
                >
                  <Badge variant="outline" className="w-fit h-fit shrink-0">
                    Step {step}
                  </Badge>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {items.map((item, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          <span className="font-medium">{item}</span>
                          {idx < items.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default DataImport;
