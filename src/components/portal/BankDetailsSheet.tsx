import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

const BANK_FIELDS = [
  { id: "bank-name", label: "Bank Name", value: "Barclays Bank" },
  { id: "account-name", label: "Bank Account Name", value: "EDEN ASSET MANAGEMENT LTD" },
  { id: "sort-code", label: "Sort Code", value: "20-51-08" },
  { id: "account-no", label: "Account No", value: "43993167" },
  { id: "swiftbic", label: "SWIFTBIC", value: "BUKBGB22" },
  { id: "iban", label: "IBAN", value: "GB98 BUKB 2051 0843 9931 67" },
  { id: "branch", label: "Branch", value: "Draper House, Saffron Road, Leicester, LE87 2BB" },
] as const;

const BENEFICIARY_ADDRESS = [
  "EDEN ASSET MANAGEMENT LTD",
  "78 York Street",
  "London",
  "W1H 1DP",
  "England",
  "United Kingdom",
].join("\n");

type BankDetailsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CopyRowProps = {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
};

function CopyRow({ id, label, value, multiline = false, copiedId, onCopy }: CopyRowProps) {
  const isCopied = copiedId === id;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/30 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={multiline ? "mt-1 whitespace-pre-line text-sm font-medium" : "mt-0.5 break-words text-sm font-medium"}>
          {value}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-md"
        aria-label={isCopied ? `${label} copied` : `Copy ${label}`}
        onClick={() => onCopy(id, value)}
      >
        {isCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function BankDetailsSheet({ open, onOpenChange }: BankDetailsSheetProps) {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      setCopiedId(id);
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedId(null);
        copiedTimeoutRef.current = null;
      }, 1500);
      toast({
        title: "Copied",
        description: "Value copied to clipboard",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-4 py-4 pr-12 text-left">
          <SheetTitle className="font-display text-sm font-semibold uppercase tracking-wide">
            Bank Details
          </SheetTitle>
          <SheetDescription className="text-xs">
            Use these details for bank transfers. Copy each field as needed.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="space-y-2 p-4">
            {BANK_FIELDS.map((field) => (
              <CopyRow
                key={field.id}
                id={field.id}
                label={field.label}
                value={field.value}
                copiedId={copiedId}
                onCopy={handleCopy}
              />
            ))}
            <Separator className="my-4" />
            <p className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
              Beneficiary Address
            </p>
            <p className="px-1 pb-1 text-xs text-muted-foreground">
              In case required
            </p>
            <CopyRow
              id="beneficiary-address"
              label="Beneficiary Address"
              value={BENEFICIARY_ADDRESS}
              multiline
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
