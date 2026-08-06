import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useTargetedMessages,
  useSendTargetedMessage,
  useBulkDeleteTargetedMessages,
  usePaymentReminderRecipientsPreview,
  useRetryTargetedMessage,
  canRetryTargetedMessage,
  type TargetedMessageFilters,
} from "@/hooks/useTargetedMessages";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useSendTestEmail } from "@/hooks/useSendTestEmail";
import { useStudents } from "@/hooks/useStudents";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatGbpAmount, formatDueDateForEmail, type PaymentDueWithinDays } from "@/utils/paymentDueWindow";
import { Plus, Send, Mail, Users, Eye, X, Search, Filter, Trash2, RefreshCw } from "lucide-react";

type BulkMessage = Database["public"]["Tables"]["bulk_messages"]["Row"];
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const TargetedMessages = () => {
  const { toast } = useToast();
  const { data: messages, isLoading } = useTargetedMessages();
  const { data: templates } = useEmailTemplates();
  const sendMessage = useSendTargetedMessage();
  const retryMessage = useRetryTargetedMessage();
  const bulkDeleteMessages = useBulkDeleteTargetedMessages();
  const sendTestEmail = useSendTestEmail();
  const { data: students } = useStudents();
  const { data: studioGradesData } = useAdminStudioGrades();
  const { data: academicYears } = useAdminAcademicYears();
  const studioGrades = studioGradesData?.grades ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMessage, setHistoryMessage] = useState<BulkMessage | null>(null);
  const [testEmails, setTestEmails] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"select" | "filter">("select");
  
  const [formData, setFormData] = useState({
    email_template_id: "",
    title: "",
    message: "",
    notification_type: "info" as "info" | "success" | "warning" | "error",
  });

  const [filters, setFilters] = useState<TargetedMessageFilters>({
    application_status: [],
    studio_grade_id: [],
    contract_id: [],
    academic_year_id: [],
    filter_logic: "AND",
  });

  const paymentPreviewEnabled =
    dialogOpen && activeTab === "filter" && !!filters.payment_status;

  const {
    data: paymentRecipients,
    isLoading: paymentRecipientsLoading,
    isFetching: paymentRecipientsFetching,
  } = usePaymentReminderRecipientsPreview(filters, paymentPreviewEnabled);

  const selectedTemplate = useMemo(() => {
    if (!formData.email_template_id || !templates) return null;
    return templates.find((t) => t.id === formData.email_template_id && t.is_active);
  }, [formData.email_template_id, templates]);

  const historyEmailTemplate = useMemo(() => {
    if (!historyMessage?.email_template_id || !templates) return null;
    return templates.find((t) => t.id === historyMessage.email_template_id) ?? null;
  }, [historyMessage, templates]);

  useEffect(() => {
    if (!dialogOpen) return;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (email) setTestEmails((current) => current || email);
    });
  }, [dialogOpen]);

  const handleSendTest = async () => {
    if (!selectedTemplate) {
      toast({
        title: "Select a template",
        description: "Choose an email template before sending a test.",
        variant: "destructive",
      });
      return;
    }
    const recipients = testEmails
      .split(/[\n,;\s]+/g)
      .map((email) => email.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      toast({
        title: "No recipients",
        description: "Enter at least one staff/admin email to send a test.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await sendTestEmail.mutateAsync({
        subject: selectedTemplate.subject,
        body_html: selectedTemplate.body_html,
        body_text: selectedTemplate.body_text || undefined,
        to: recipients,
      });
      toast({
        title: "Test email sent",
        description: `Sent ${result.sent} test email${result.sent === 1 ? "" : "s"}${
          result.failed ? `, ${result.failed} failed` : ""
        }. Check the inbox (and spam) for the [TEST] message.`,
        variant: result.failed && !result.sent ? "destructive" : undefined,
      });
    } catch (error) {
      toast({
        title: "Failed to send test",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  // Filter students for search
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    const searchLower = studentSearch.toLowerCase();
    return students.filter((student) => {
      const name = `${student.profile?.first_name || ""} ${student.profile?.last_name || ""}`.toLowerCase();
      const email = student.profile?.email?.toLowerCase() || "";
      return name.includes(searchLower) || email.includes(searchLower);
    });
  }, [students, studentSearch]);

  const selectedStudents = useMemo(() => {
    if (!students) return [];
    return students.filter((s) => selectedStudentIds.includes(s.student_id));
  }, [students, selectedStudentIds]);

  const humanizeTemplatePlaceholders = (text: string) =>
    text.replace(/\{([^}]+)\}/g, (_match, varName: string) =>
      varName === "student_name" ? "Student" : varName.replace(/_/g, " "),
    );

  const handleTemplateChange = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (template) {
      let plainText = "";
      if (template.body_text) {
        plainText = humanizeTemplatePlaceholders(template.body_text).substring(0, 200);
      } else if (template.body_html) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = template.body_html;
        plainText = tempDiv.textContent || tempDiv.innerText || "";
        plainText = humanizeTemplatePlaceholders(plainText);
        plainText = plainText.replace(/\s+/g, " ").trim().substring(0, 200);
      }
      
      setFormData({
        ...formData,
        email_template_id: templateId,
        title: formData.title || humanizeTemplatePlaceholders(template.subject),
        message: formData.message || plainText,
      });
    } else {
      setFormData({
        ...formData,
        email_template_id: templateId,
      });
    }
  };

  // Soft-suggest payment reminder / overdue template when payment filters are set
  useEffect(() => {
    if (!filters.payment_status || !templates || formData.email_template_id) return;
    const preferredType =
      filters.payment_status === "overdue" ? "overdue_payment" : "payment_reminder";
    const preferred =
      templates.find((t) => t.is_active && t.template_type === preferredType) ||
      templates.find((t) => t.is_active && t.template_type === "payment_reminder");
    if (preferred) {
      handleTemplateChange(preferred.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when payment_status flips on
  }, [filters.payment_status]);

  const handleSubmit = async () => {
    if (!formData.email_template_id) {
      toast({
        title: "Validation Error",
        description: "Please select an email template.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.title || !formData.message) {
      toast({
        title: "Validation Error",
        description: "Please fill in title and message.",
        variant: "destructive",
      });
      return;
    }

    // Validate that we have either selected students or filters
    if (activeTab === "select" && selectedStudentIds.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one student.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "filter") {
      const hasFilters =
        (filters.application_status && filters.application_status.length > 0) ||
        (filters.studio_grade_id && filters.studio_grade_id.length > 0) ||
        (filters.contract_id && filters.contract_id.length > 0) ||
        (filters.academic_year_id && filters.academic_year_id.length > 0) ||
        !!filters.payment_status;

      if (!hasFilters) {
        toast({
          title: "Validation Error",
          description: "Please apply at least one filter.",
          variant: "destructive",
        });
        return;
      }

      if (filters.payment_status === "upcoming" && !filters.payment_due_within_days) {
        toast({
          title: "Validation Error",
          description: "Select a due window (Next 7 / 14 / 30 days) for upcoming payments.",
          variant: "destructive",
        });
        return;
      }

      if (
        filters.payment_status &&
        paymentRecipients &&
        paymentRecipients.length === 0 &&
        !paymentRecipientsLoading
      ) {
        toast({
          title: "No recipients",
          description: "No students match the payment filters. Adjust the filters and try again.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const messageFilters: TargetedMessageFilters = {
        ...filters,
      };

      if (activeTab === "select" && selectedStudentIds.length > 0) {
        messageFilters.student_ids = selectedStudentIds;
      }

      await sendMessage.mutateAsync({
        title: formData.title,
        message: formData.message,
        notification_type: formData.notification_type,
        email_template_id: formData.email_template_id,
        filters: messageFilters,
      });

      toast({
        title: "Message sent",
        description: "Targeted message has been queued for sending.",
      });

      setDialogOpen(false);
      setFormData({
        email_template_id: "",
        title: "",
        message: "",
        notification_type: "info",
      });
      setSelectedStudentIds([]);
      setFilters({
        application_status: [],
        studio_grade_id: [],
        contract_id: [],
        academic_year_id: [],
        payment_status: undefined,
        payment_due_within_days: undefined,
        filter_logic: "AND",
      });
    } catch (error) {
      console.error("Failed to send targeted message:", error);
      toast({
        title: "Error",
        description: "Failed to send targeted message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string }> = {
      pending: {
        className: "bg-gray-500 hover:bg-gray-600 text-white",
        label: "Pending",
      },
      sending: {
        className: "bg-blue-500 hover:bg-blue-600 text-white",
        label: "Sending",
      },
      completed: {
        className: "bg-green-500 hover:bg-green-600 text-white",
        label: "Completed",
      },
      failed: {
        className: "bg-red-500 hover:bg-red-600 text-white",
        label: "Failed",
      },
    };

    const config = statusConfig[status] || {
      className: "bg-gray-500 hover:bg-gray-600 text-white",
      label: status,
    };

    return (
      <Badge className={`uppercase ${config.className} rounded-md px-2.5 py-0.5 text-xs font-medium`}>
        {config.label}
      </Badge>
    );
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const removeStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
  };

  const messageList = messages ?? [];
  const allSelected = messageList.length > 0 && selectedIds.length === messageList.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : messageList.map((m) => m.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteMessages.mutateAsync(selectedIds);
      toast({
        title: "Messages deleted",
        description: `${selectedIds.length} message(s) removed.`,
      });
      setSelectedIds([]);
      setBulkDeleteOpen(false);
    } catch (error) {
      console.error("Bulk delete failed:", error);
      toast({
        title: "Error",
        description: "Failed to delete selected messages. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openHistoryPreview = (message: BulkMessage) => {
    setHistoryMessage(message);
    setHistoryOpen(true);
  };

  const handleRetry = async (message: BulkMessage) => {
    try {
      const result = await retryMessage.mutateAsync(message);
      toast({
        title: "Retry complete",
        description: result.skipNotifications
          ? "Emails re-sent. Refresh if the recipient count looks stale."
          : "Notifications and emails re-sent.",
      });
      setHistoryMessage(null);
      setHistoryOpen(false);
    } catch (error) {
      console.error("Retry failed:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast({
        title: "Retry failed",
        description: msg.includes("504") || msg.includes("non-2xx")
          ? "The send timed out. Hard-refresh and try Retry emails again — batching is now enabled."
          : "Could not re-send this campaign. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading && !messages) {
    return (
      <AdminLayout pageTitle="Targeted Messages" subtitle="Send messages to specific students">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-3xl">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      pageTitle="Targeted Messages" 
      subtitle="Send messages to specific students or filtered groups"
      mobileActionButton={
        <Button
          onClick={() => setDialogOpen(true)}
          size="sm"
          className="rounded-md h-9 w-9 p-0 bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
      pageToolbar={
        <Button
          onClick={() => setDialogOpen(true)}
          className="rounded-md uppercase tracking-wide gap-2"
        >
          <Plus className="h-4 w-4" />
          New Message
        </Button>
      }
    >
      <div className="space-y-6">
        {messageList.length > 0 ? (
          <>
            {/* Desktop: table row layout */}
            <div className="hidden lg:block">
              {selectedIds.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3">
                  <Badge variant="secondary" className="uppercase tracking-wide">
                    {selectedIds.length} selected
                  </Badge>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md uppercase tracking-wide gap-2 text-destructive hover:text-destructive"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow className="hover:bg-muted border-b-border/80">
                    <TableHead className="w-12 bg-muted">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all messages"
                      />
                    </TableHead>
                    <TableHead className="uppercase tracking-wide text-xs bg-muted">Title</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs bg-muted">Status</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs text-right bg-muted">
                      Recipients
                    </TableHead>
                    <TableHead className="uppercase tracking-wide text-xs text-right bg-muted">
                      Notifications
                    </TableHead>
                    <TableHead className="uppercase tracking-wide text-xs bg-muted">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messageList.map((message) => (
                    <TableRow
                      key={message.id}
                      data-state={selectedIds.includes(message.id) ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => openHistoryPreview(message)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(message.id)}
                          onCheckedChange={() => toggleSelection(message.id)}
                          aria-label={`Select ${message.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-sm">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-sans font-medium truncate">
                              {message.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {message.message}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(message.status)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {message.emails_sent ?? 0}/{message.total_recipients ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{message.notifications_sent}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {message.created_at
                          ? format(new Date(message.created_at), "d MMM yyyy HH:mm")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile & tablet: card layout */}
            <div className="space-y-4 lg:hidden">
              {messageList.map((message) => (
                <Card
                  key={message.id}
                  className="rounded-3xl cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => openHistoryPreview(message)}
                >
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                      <CardTitle className="text-lg font-sans font-medium flex items-center gap-2 flex-1">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="break-words">{message.title}</span>
                      </CardTitle>
                      <div className="flex-shrink-0">
                        {getStatusBadge(message.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-4 break-words">{message.message}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Recipients</p>
                        <p className="font-medium flex items-center gap-1 tabular-nums">
                          <Users className="h-4 w-4" />
                          {message.emails_sent ?? 0}/{message.total_recipients ?? 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Notifications</p>
                        <p className="font-medium">{message.notifications_sent}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Sent</p>
                        <p className="font-medium">
                          {message.created_at
                            ? format(new Date(message.created_at), "d MMM yyyy HH:mm")
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <h3 className="text-xl font-display uppercase tracking-wide">
              No Messages Sent
            </h3>
            <p className="text-sm text-muted-foreground">
              Send your first targeted message to get started.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="rounded-md uppercase tracking-wide gap-2"
            >
              <Plus className="h-4 w-4" />
              Send Message
            </Button>
          </div>
        )}
      </div>

      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display uppercase tracking-wide">
              Send Targeted Message
            </SheetTitle>
            <SheetDescription>
              Select specific students or apply filters to send personalized messages.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 mt-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "select" | "filter")}>
              <TabsList className="grid w-full grid-cols-2 rounded-md">
                <TabsTrigger value="select" className="rounded-md text-sm font-medium">
                  <Users className="h-4 w-4 mr-2" />
                  Select Students
                </TabsTrigger>
                <TabsTrigger value="filter" className="rounded-md text-sm font-medium">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter by Category
                </TabsTrigger>
              </TabsList>

              <TabsContent value="select" className="space-y-4 mt-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Label>Search and Select Students</Label>
                    <InfoTooltip content="Pick individual students by name or email. The message is sent only to those you select here." label="About selecting students" />
                  </div>
                  <Popover open={studentSearchOpen} onOpenChange={setStudentSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full mt-2 justify-between rounded-md"
                      >
                        <span className="truncate">
                          {selectedStudentIds.length > 0
                            ? `${selectedStudentIds.length} student${selectedStudentIds.length > 1 ? "s" : ""} selected`
                            : "Search students..."}
                        </span>
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search by name or email..."
                          value={studentSearch}
                          onValueChange={setStudentSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No students found.</CommandEmpty>
                          <CommandGroup>
                            {filteredStudents.map((student) => {
                              const isSelected = selectedStudentIds.includes(student.student_id);
                              return (
                                <CommandItem
                                  key={student.student_id}
                                  value={`${student.profile?.first_name} ${student.profile?.last_name} ${student.profile?.email}`}
                                  onSelect={() => toggleStudentSelection(student.student_id)}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1">
                                    <p className="font-medium">
                                      {student.profile?.first_name} {student.profile?.last_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {student.profile?.email}
                                    </p>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {selectedStudents.length > 0 && (
                  <div>
                    <Label>Selected Students ({selectedStudents.length})</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedStudents.map((student) => (
                        <Badge
                          key={student.student_id}
                          variant="secondary"
                          className="rounded-md px-3 py-1 flex items-center gap-2"
                        >
                          {student.profile?.first_name} {student.profile?.last_name}
                          <button
                            onClick={() => removeStudent(student.student_id)}
                            className="ml-1 hover:bg-destructive/20 rounded-md p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="filter" className="space-y-4 mt-4">
                <div className="rounded-2xl border p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide">Payment due</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Same cohort as Accounting Reports → Upcoming. One reminder per student (soonest matching installment).
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Label>Payment status</Label>
                        <InfoTooltip
                          content="Upcoming = unpaid installments due today or later. Overdue = unpaid installments past due."
                          label="About payment status"
                        />
                      </div>
                      <Select
                        value={filters.payment_status || "none"}
                        onValueChange={(value) => {
                          if (value === "none") {
                            setFilters({
                              ...filters,
                              payment_status: undefined,
                              payment_due_within_days: undefined,
                            });
                            return;
                          }
                          setFilters({
                            ...filters,
                            payment_status: value as "upcoming" | "overdue",
                            payment_due_within_days:
                              value === "upcoming"
                                ? filters.payment_due_within_days ?? 14
                                : undefined,
                          });
                        }}
                      >
                        <SelectTrigger className="mt-2 rounded-md">
                          <SelectValue placeholder="Off" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Off</SelectItem>
                          <SelectItem value="upcoming">Upcoming</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {filters.payment_status === "upcoming" && (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Label>Due within</Label>
                          <InfoTooltip
                            content="Matches Accounting Reports: due date from today through today + N days."
                            label="About due within"
                          />
                        </div>
                        <Select
                          value={String(filters.payment_due_within_days ?? 14)}
                          onValueChange={(value) => {
                            setFilters({
                              ...filters,
                              payment_due_within_days: Number(value) as PaymentDueWithinDays,
                            });
                          }}
                        >
                          <SelectTrigger className="mt-2 rounded-md">
                            <SelectValue placeholder="Next 14 days" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">Next 7 days</SelectItem>
                            <SelectItem value="14">Next 14 days</SelectItem>
                            <SelectItem value="30">Next 30 days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {filters.payment_status && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                          Preview recipients
                        </Label>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {paymentRecipientsLoading || paymentRecipientsFetching
                            ? "Loading…"
                            : `${paymentRecipients?.length ?? 0} student${
                                (paymentRecipients?.length ?? 0) === 1 ? "" : "s"
                              }`}
                        </span>
                      </div>
                      {(paymentRecipientsLoading || paymentRecipientsFetching) && !paymentRecipients ? (
                        <Skeleton className="h-24 w-full rounded-md" />
                      ) : paymentRecipients && paymentRecipients.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="text-xs uppercase">Student</TableHead>
                                <TableHead className="text-xs uppercase">Due</TableHead>
                                <TableHead className="text-xs uppercase text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paymentRecipients.slice(0, 50).map((row) => (
                                <TableRow key={row.student_id}>
                                  <TableCell className="text-sm py-2">{row.student_name}</TableCell>
                                  <TableCell className="text-sm py-2 whitespace-nowrap">
                                    {formatDueDateForEmail(row.due_date)}
                                  </TableCell>
                                  <TableCell className="text-sm py-2 text-right tabular-nums">
                                    {formatGbpAmount(row.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {paymentRecipients.length > 50 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                              Showing first 50 of {paymentRecipients.length}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No students match these payment filters.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label>Application Status</Label>
                      <InfoTooltip content="Target students whose application is in the chosen status." label="About application status filter" />
                    </div>
                    <Select
                      value={filters.application_status?.[0] || "all"}
                      onValueChange={(value) => {
                        setFilters({
                          ...filters,
                          application_status: value === "all" ? [] : [value],
                        });
                      }}
                    >
                      <SelectTrigger className="mt-2 rounded-md">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="awaiting_deposit">Awaiting Deposit</SelectItem>
                        <SelectItem value="awaiting_signature">Awaiting Signature</SelectItem>
                        <SelectItem value="awaiting_verification">Awaiting Verification</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label>Studio Grade</Label>
                      <InfoTooltip content="Target students assigned to studios of the chosen grade." label="About studio grade filter" />
                    </div>
                    <Select
                      value={filters.studio_grade_id?.[0] || "all"}
                      onValueChange={(value) => {
                        setFilters({
                          ...filters,
                          studio_grade_id: value === "all" ? [] : [value],
                        });
                      }}
                    >
                      <SelectTrigger className="mt-2 rounded-md">
                        <SelectValue placeholder="All grades" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Grades</SelectItem>
                        {studioGrades.map((grade) => (
                          <SelectItem key={grade.id} value={grade.id}>
                            {grade.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label>Academic Year</Label>
                      <InfoTooltip content="Target students whose contract falls in the chosen academic year." label="About academic year filter" />
                    </div>
                    <Select
                      value={filters.academic_year_id?.[0] || "all"}
                      onValueChange={(value) => {
                        setFilters({
                          ...filters,
                          academic_year_id: value === "all" ? [] : [value],
                        });
                      }}
                    >
                      <SelectTrigger className="mt-2 rounded-md">
                        <SelectValue placeholder="All years" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {academicYears?.map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="pt-4 border-t space-y-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="email_template">Email Template *</Label>
                  <InfoTooltip content="The email + notification content sent to the selected/filtered students. Only active templates appear here." label="About email template" />
                </div>
                {templates && templates.filter((t) => t.is_active).length > 0 ? (
                  <Select
                    value={formData.email_template_id || undefined}
                    onValueChange={handleTemplateChange}
                  >
                    <SelectTrigger id="email_template" className="mt-2 rounded-md">
                      <SelectValue placeholder="Select an email template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates
                        .filter((t) => t.is_active)
                        .map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.template_type.replace("_", " ")})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="mt-2">
                    <Input
                      id="email_template"
                      value="No active templates available"
                      disabled
                      className="rounded-md"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Create an email template first in the Email Templates section.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="title">Notification Title *</Label>
                  <InfoTooltip content="Appears as the notification title in the student portal." label="About notification title" />
                </div>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-2 rounded-md"
                  placeholder="e.g., Important Update"
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="message">Notification Message *</Label>
                  <InfoTooltip content="Appears as the notification message in the student portal." label="About notification message" />
                </div>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="mt-2 rounded-2xl"
                  rows={4}
                  placeholder="Enter your message here..."
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="notification_type">Notification Type</Label>
                  <InfoTooltip content="Controls the colour/severity styling of the in-portal notification." label="About notification type" />
                </div>
                <Select
                  value={formData.notification_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, notification_type: value as typeof formData.notification_type })
                  }
                >
                  <SelectTrigger id="notification_type" className="mt-2 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="pt-2 border-t space-y-4">
                  <Button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="rounded-md text-sm font-medium gap-2 w-full bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <Eye className="h-4 w-4" />
                    Preview Email
                  </Button>
                  <div className="rounded-2xl border p-4 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="targeted_test_emails" className="uppercase tracking-wide text-xs text-muted-foreground">
                        Send Test to Staff / Admin
                      </Label>
                      <InfoTooltip content="Sends a [TEST] copy of this template to the addresses below (max 10) with sample data filled in. Does not affect students." label="About test email" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Check how it renders in a real inbox before sending. Separate multiple addresses with commas.
                    </p>
                    <Textarea
                      id="targeted_test_emails"
                      value={testEmails}
                      onChange={(e) => setTestEmails(e.target.value)}
                      rows={2}
                      placeholder="admin@company.com, staff@company.com"
                      className="text-sm rounded-md"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleSendTest}
                      disabled={sendTestEmail.isPending}
                      className="rounded-md text-sm font-medium gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {sendTestEmail.isPending ? "Sending..." : "Send Test"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-md text-sm font-medium">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={sendMessage.isPending || !formData.email_template_id}
              className="rounded-md text-sm font-medium gap-2"
            >
              <Send className="h-4 w-4" />
              {sendMessage.isPending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display uppercase tracking-wide flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Email Preview
            </SheetTitle>
            <SheetDescription>
              Preview how the email will look to students (variables will be replaced with actual data).
            </SheetDescription>
          </SheetHeader>
          {selectedTemplate && (
            <div className="mt-4 space-y-2">
              <div className="rounded-lg border overflow-hidden bg-white">
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={
                    selectedTemplate.body_html ||
                    `<pre style="font-family:sans-serif;white-space:pre-wrap;padding:16px">${selectedTemplate.body_text || ""}</pre>`
                  }
                  className="w-full h-[520px] bg-white"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This is how the email renders to students. Variables like {"{student_name}"} appear as-is here and are replaced with real data when sent.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-md uppercase tracking-wide">
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistoryMessage(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-sans font-medium flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Sent message
            </SheetTitle>
            <SheetDescription>
              Campaign details and the email template that was used.
            </SheetDescription>
          </SheetHeader>

          {historyMessage && (
            <div className="mt-4 space-y-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(historyMessage.status)}
                  {canRetryTargetedMessage(historyMessage) && (
                    <Badge className="rounded-md bg-amber-500 hover:bg-amber-600 text-white uppercase text-xs">
                      Incomplete emails
                    </Badge>
                  )}
                </div>
                <p className="font-sans font-medium text-base">{historyMessage.title}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {historyMessage.message}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Recipients</p>
                  <p className="font-medium tabular-nums mt-1">
                    {historyMessage.emails_sent ?? 0}/{historyMessage.total_recipients ?? 0}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Notifications</p>
                  <p className="font-medium tabular-nums mt-1">{historyMessage.notifications_sent}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Sent</p>
                  <p className="font-medium mt-1">
                    {historyMessage.created_at
                      ? format(new Date(historyMessage.created_at), "d MMM yyyy HH:mm")
                      : "—"}
                  </p>
                </div>
              </div>

              {(() => {
                const f = (historyMessage.filters || {}) as Record<string, unknown>;
                const bits: string[] = [];
                if (f.payment_status === "upcoming") {
                  bits.push(
                    `Upcoming · next ${f.payment_due_within_days ?? "—"} days`,
                  );
                } else if (f.payment_status === "overdue") {
                  bits.push("Overdue payments");
                }
                if (Array.isArray(f.application_status) && f.application_status.length) {
                  bits.push(`Status: ${(f.application_status as string[]).join(", ")}`);
                }
                if (!bits.length) return null;
                return (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      Filters
                    </p>
                    <p className="font-medium">{bits.join(" · ")}</p>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Email template
                </p>
                {historyEmailTemplate ? (
                  <>
                    <p className="text-sm font-medium">{historyEmailTemplate.subject}</p>
                    <div className="rounded-lg border overflow-hidden bg-white">
                      <iframe
                        title="Sent template preview"
                        sandbox=""
                        srcDoc={
                          historyEmailTemplate.body_html ||
                          `<pre style="font-family:sans-serif;white-space:pre-wrap;padding:16px">${
                            historyEmailTemplate.body_text || ""
                          }</pre>`
                        }
                        className="w-full h-[420px] bg-white"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Preview shows the template; student variables were filled per recipient when sent.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {historyMessage.email_template_id
                      ? "Template no longer available."
                      : "No email template was attached to this campaign."}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-md text-sm font-medium"
                >
                  Close
                </Button>
                {canRetryTargetedMessage(historyMessage) && (
                  <Button
                    onClick={() => handleRetry(historyMessage)}
                    disabled={retryMessage.isPending}
                    className="rounded-md text-sm font-medium gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", retryMessage.isPending && "animate-spin")} />
                    {retryMessage.isPending
                      ? "Retrying…"
                      : (historyMessage.notifications_sent ?? 0) > 0
                        ? "Retry emails"
                        : "Retry send"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Delete Messages
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} selected message
              {selectedIds.length === 1 ? "" : "s"}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md uppercase tracking-wide">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMessages.isPending}
              className="rounded-md uppercase tracking-wide bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default TargetedMessages;

