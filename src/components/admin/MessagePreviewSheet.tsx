import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, FileText, Send } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  type ApplicationOutboundMessage,
  type OutboundMessageType,
  OUTBOUND_MESSAGE_LABELS,
  createSignedInvoiceUrl,
  useActiveEmailTemplateByType,
  usePreviewInstallmentInvoice,
  useSendApplicationTransactionalEmail,
  useSendInstallmentInvoice,
  useInvalidateOutboundMessages,
} from "@/hooks/useApplicationOutboundMessages";
import {
  buildApplicationEmailVariables,
  replaceEmailVariables,
  type ApplicationEmailContext,
} from "@/utils/buildApplicationEmailVariables";
import { useToast } from "@/hooks/use-toast";

export type MessagePreviewKind = OutboundMessageType;

type UnpaidInstallment = {
  installment_id: string;
  sequence: number;
  label: string | null;
  due_date: string;
  amount_due: number;
  remaining_amount: number;
  payment_status: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "compose" | "history";
  kind: MessagePreviewKind | null;
  applicationId: string;
  studentId: string;
  recipientEmail?: string | null;
  emailContext: ApplicationEmailContext;
  unpaidInstallments?: UnpaidInstallment[];
  historyMessage?: ApplicationOutboundMessage | null;
};

function openPdfFromBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function MessagePreviewSheet({
  open,
  onOpenChange,
  mode,
  kind,
  applicationId,
  studentId,
  recipientEmail,
  emailContext,
  unpaidInstallments = [],
  historyMessage = null,
}: Props) {
  const { toast } = useToast();
  const invalidate = useInvalidateOutboundMessages();
  const templateType = mode === "compose" ? kind : null;
  const { data: template, isLoading: templateLoading } =
    useActiveEmailTemplateByType(templateType);

  const [installmentId, setInstallmentId] = useState<string>("");
  const [invoicePreview, setInvoicePreview] = useState<{
    subject: string;
    html: string;
    text: string;
    recipientEmail: string;
    pdfBase64: string;
    filename: string;
    invoiceNumber: string;
  } | null>(null);

  const previewInvoice = usePreviewInstallmentInvoice();
  const sendInvoice = useSendInstallmentInvoice();
  const sendTransactional = useSendApplicationTransactionalEmail();

  const variables = useMemo(
    () => buildApplicationEmailVariables(emailContext),
    [emailContext],
  );

  useEffect(() => {
    if (!open) {
      setInvoicePreview(null);
      return;
    }
    if (kind === "installment_invoice" && unpaidInstallments.length > 0) {
      setInstallmentId((prev) => prev || unpaidInstallments[0].installment_id);
    }
  }, [open, kind, unpaidInstallments]);

  const isInvoice = kind === "installment_invoice";
  const isHistory = mode === "history";

  const composedSubject = useMemo(() => {
    if (isHistory && historyMessage) return historyMessage.subject;
    if (isInvoice && invoicePreview) return invoicePreview.subject;
    if (!template) return "";
    return replaceEmailVariables(template.subject, variables);
  }, [isHistory, historyMessage, isInvoice, invoicePreview, template, variables]);

  const composedHtml = useMemo(() => {
    if (isHistory && historyMessage) return historyMessage.body_html || "";
    if (isInvoice && invoicePreview) return invoicePreview.html;
    if (!template) return "";
    const raw = template.body_html || template.body_text || "";
    return replaceEmailVariables(raw, variables);
  }, [isHistory, historyMessage, isInvoice, invoicePreview, template, variables]);

  const toEmail =
    (isHistory ? historyMessage?.recipient_email : null) ||
    invoicePreview?.recipientEmail ||
    recipientEmail ||
    emailContext.studentEmail ||
    "—";

  const title =
    isHistory && historyMessage
      ? OUTBOUND_MESSAGE_LABELS[historyMessage.message_type]
      : kind
        ? OUTBOUND_MESSAGE_LABELS[kind]
        : "Message preview";

  const handleGenerateInvoicePreview = async () => {
    if (!installmentId) return;
    try {
      const data = await previewInvoice.mutateAsync({
        applicationId,
        installmentId,
      });
      setInvoicePreview({
        subject: data.subject,
        html: data.html,
        text: data.text,
        recipientEmail: data.recipientEmail,
        pdfBase64: data.pdfBase64,
        filename: data.filename,
        invoiceNumber: data.invoiceNumber,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Preview failed",
        description:
          error instanceof Error ? error.message : "Could not generate invoice preview.",
      });
    }
  };

  const handleSend = async () => {
    if (!kind) return;
    try {
      if (kind === "installment_invoice") {
        if (!installmentId) {
          toast({
            variant: "destructive",
            title: "Select an installment",
            description: "Choose which installment to invoice before sending.",
          });
          return;
        }
        // Ensure preview exists so staff confirmed content
        if (!invoicePreview) {
          await handleGenerateInvoicePreview();
        }
        await sendInvoice.mutateAsync({ applicationId, installmentId });
        toast({
          title: "Installment invoice sent",
          description: "The student has been emailed the invoice.",
        });
      } else {
        if (!template) {
          toast({
            variant: "destructive",
            title: "Template missing",
            description: `No active ${kind} email template found.`,
          });
          return;
        }
        await sendTransactional.mutateAsync({
          user_id: studentId,
          email_type: kind,
          message_type: kind,
          application_id: applicationId,
          template_id: template.id,
          variables,
        });
        toast({
          title: "Email sent",
          description: `${OUTBOUND_MESSAGE_LABELS[kind]} sent to the student.`,
        });
      }
      invalidate(applicationId);
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Send failed",
        description:
          error instanceof Error ? error.message : "Failed to send email.",
      });
    }
  };

  const handleOpenHistoryPdf = async () => {
    const path = historyMessage?.attachment_path;
    if (!path) return;
    try {
      const url = await createSignedInvoiceUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "PDF unavailable",
        description:
          error instanceof Error ? error.message : "Could not open invoice PDF.",
      });
    }
  };

  const sending =
    sendInvoice.isPending || sendTransactional.isPending || previewInvoice.isPending;
  const canSend =
    !isHistory &&
    Boolean(kind) &&
    (isInvoice
      ? Boolean(installmentId) && (Boolean(invoicePreview) || !previewInvoice.isError)
      : Boolean(template) && Boolean(composedHtml));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-display uppercase tracking-wide text-lg">
            {isHistory ? "Sent message" : "Preview & send"}
          </SheetTitle>
          <SheetDescription>
            {isHistory
              ? "Read-only copy of what was sent."
              : "Review the email below, then confirm to send."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="uppercase text-xs">
              {title}
            </Badge>
            {isHistory && historyMessage && (
              <Badge
                variant={historyMessage.status === "sent" ? "default" : "destructive"}
                className="uppercase text-xs"
              >
                {historyMessage.status}
              </Badge>
            )}
            {isHistory && historyMessage && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(historyMessage.created_at), "dd MMM yyyy HH:mm")}
              </span>
            )}
          </div>

          {!isHistory && isInvoice && (
            <div className="space-y-2">
              <Label>Installment</Label>
              <Select value={installmentId} onValueChange={(v) => {
                setInstallmentId(v);
                setInvoicePreview(null);
              }}>
                <SelectTrigger className="rounded-md">
                  <SelectValue placeholder="Select installment" />
                </SelectTrigger>
                <SelectContent>
                  {unpaidInstallments.map((inst) => (
                    <SelectItem key={inst.installment_id} value={inst.installment_id}>
                      {inst.label || `Instalment ${inst.sequence}`} — £
                      {Number(inst.remaining_amount || inst.amount_due).toFixed(2)} due{" "}
                      {format(new Date(inst.due_date), "dd MMM yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md uppercase tracking-wide"
                disabled={!installmentId || previewInvoice.isPending}
                onClick={() => void handleGenerateInvoicePreview()}
              >
                {previewInvoice.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate preview"
                )}
              </Button>
            </div>
          )}

          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">To:</span>{" "}
              <span className="font-medium break-all">{toEmail}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Subject:</span>{" "}
              <span className="font-medium">{composedSubject || "—"}</span>
            </p>
          </div>

          {(templateLoading && !isInvoice && !isHistory) ||
          (isInvoice && !isHistory && previewInvoice.isPending && !invoicePreview) ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading preview…
            </div>
          ) : composedHtml ? (
            <div className="rounded-lg border border-border overflow-hidden bg-white">
              <iframe
                title="Email preview"
                className="w-full h-[420px] bg-white"
                sandbox=""
                srcDoc={composedHtml}
              />
            </div>
          ) : isInvoice && !isHistory ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Select an installment and generate a preview to continue.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No template content available.
            </p>
          )}

          {(invoicePreview?.pdfBase64 ||
            (isHistory && historyMessage?.attachment_path)) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md gap-2"
              onClick={() => {
                if (invoicePreview?.pdfBase64) {
                  openPdfFromBase64(invoicePreview.pdfBase64, invoicePreview.filename);
                } else {
                  void handleOpenHistoryPdf();
                }
              }}
            >
              <FileText className="h-4 w-4" />
              Open PDF invoice
            </Button>
          )}
        </div>

        <SheetFooter className="mt-6 flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-md uppercase tracking-wide w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            {isHistory ? "Close" : "Cancel"}
          </Button>
          {!isHistory && (
            <Button
              type="button"
              className="rounded-md uppercase tracking-wide w-full sm:w-auto gap-2"
              disabled={!canSend || sending || (isInvoice && !invoicePreview)}
              onClick={() => void handleSend()}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Confirm send
                </>
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
