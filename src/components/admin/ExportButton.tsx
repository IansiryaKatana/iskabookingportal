import { Download, FileText, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useExporting } from "@/hooks/useExporting";

type ExportButtonProps = Omit<ButtonProps, "onClick"> & {
  onExport: () => void | Promise<void>;
  label?: string;
  icon?: "download" | "file";
  iconOnly?: boolean;
  isExporting?: boolean;
  runExport?: (fn: () => void | Promise<void>) => Promise<void>;
};

export function ExportButton({
  onExport,
  label = "Export CSV",
  icon = "download",
  iconOnly = false,
  isExporting: isExportingProp,
  runExport: runExportProp,
  disabled,
  className,
  children,
  ...buttonProps
}: ExportButtonProps) {
  const internal = useExporting();
  const isExporting = isExportingProp ?? internal.isExporting;
  const runExport = runExportProp ?? internal.runExport;

  const Icon = icon === "file" ? FileText : Download;

  return (
    <Button
      type="button"
      {...buttonProps}
      disabled={disabled || isExporting}
      aria-label={isExporting ? "Exporting" : iconOnly ? label : undefined}
      className={className}
      onClick={() => {
        void runExport(onExport);
      }}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {!iconOnly && (isExporting ? "Exporting..." : children ?? label)}
    </Button>
  );
}
