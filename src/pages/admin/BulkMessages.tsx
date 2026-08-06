import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useBulkMessages, useSendBulkMessage, useBulkDeleteBulkMessages } from "@/hooks/useBulkMessages";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useSendTestEmail } from "@/hooks/useSendTestEmail";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Send, Mail, Users, Eye, Bell, Trash2 } from "lucide-react";
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
const BulkMessages = () => {
  const { toast } = useToast();
  const { data: messages, isLoading } = useBulkMessages();
  const { data: templates } = useEmailTemplates();
  const sendMessage = useSendBulkMessage();
  const sendTestEmail = useSendTestEmail();
  const bulkDeleteMessages = useBulkDeleteBulkMessages();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
  const [testEmails, setTestEmails] = useState("");
  const [formData, setFormData] = useState({
    email_template_id: "",
    title: "",
    message: "",
    notification_type: "info" as "info" | "success" | "warning" | "error",
  });

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

  const selectedTemplate = useMemo(() => {
    if (!formData.email_template_id || !templates) return null;
    return templates.find((t) => t.id === formData.email_template_id && t.is_active);
  }, [formData.email_template_id, templates]);

  const handleTemplateChange = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (template) {
      // Auto-populate title and message from template
      // Extract plain text from HTML for notification message - better extraction
      let plainText = "";
      const humanizeTemplatePlaceholders = (text: string) =>
        text.replace(/\{([^}]+)\}/g, (_match, varName: string) =>
          varName === "student_name" ? "Student" : varName.replace(/_/g, " "),
        );

      if (template.body_text) {
        // Use body_text if available (cleaner)
        plainText = humanizeTemplatePlaceholders(template.body_text).substring(0, 200);
      } else if (template.body_html) {
        // Extract from HTML - remove all HTML tags and clean up
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = template.body_html;
        plainText = tempDiv.textContent || tempDiv.innerText || "";
        // Replace variables with readable placeholders
        plainText = humanizeTemplatePlaceholders(plainText);
        // Clean up whitespace
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

    try {
      await sendMessage.mutateAsync({
        title: formData.title,
        message: formData.message,
        notification_type: formData.notification_type,
        email_template_id: formData.email_template_id,
      });

      toast({
        title: "Message sent",
        description: "Bulk message has been queued for sending.",
      });

      setDialogOpen(false);
      setFormData({
        email_template_id: "",
        title: "",
        message: "",
        notification_type: "info",
      });
    } catch (error) {
      console.error("Failed to send bulk message:", error);
      toast({
        title: "Error",
        description: "Failed to send bulk message. Please try again.",
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

  if (isLoading && !messages) {
    return (
      <AdminLayout pageTitle="Bulk Messages" subtitle="Send messages to multiple students">
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
      pageTitle="Bulk Messages" 
      subtitle="Send messages to multiple students"
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
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all messages"
                      />
                    </TableHead>
                    <TableHead className="uppercase tracking-wide text-xs">Title</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs">Status</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs text-right">Recipients</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs text-right">Notifications</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs text-right">Emails</TableHead>
                    <TableHead className="uppercase tracking-wide text-xs">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messageList.map((message) => (
                    <TableRow
                      key={message.id}
                      data-state={selectedIds.includes(message.id) ? "selected" : undefined}
                    >
                      <TableCell>
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
                            <p className="font-display uppercase tracking-wide truncate">
                              {message.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {message.message}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(message.status)}</TableCell>
                      <TableCell className="text-right tabular-nums">{message.total_recipients}</TableCell>
                      <TableCell className="text-right tabular-nums">{message.notifications_sent}</TableCell>
                      <TableCell className="text-right tabular-nums">{message.emails_sent}</TableCell>
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
                <Card key={message.id} className="rounded-3xl">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                      <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2 flex-1">
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Recipients</p>
                        <p className="font-medium flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {message.total_recipients}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Notifications</p>
                        <p className="font-medium">{message.notifications_sent}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Emails</p>
                        <p className="font-medium">{message.emails_sent}</p>
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
              Send your first bulk message to get started.
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
              Send Bulk Message
            </SheetTitle>
            <SheetDescription>
              Select an email template to send notifications and emails to all confirmed students.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="email_template">Email Template *</Label>
                <InfoTooltip content="The email + notification content sent to every confirmed student. Only active templates appear here." label="About email template" />
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
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Template: {selectedTemplate.name} • Subject: {selectedTemplate.subject}
                </p>
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
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                  className="rounded-md uppercase tracking-wide gap-2 w-full"
                >
                  <Eye className="h-4 w-4" />
                  Preview Email
                </Button>
                <div className="rounded-2xl border p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="bulk_test_emails" className="uppercase tracking-wide text-xs text-muted-foreground">
                      Send Test to Staff / Admin
                    </Label>
                    <InfoTooltip content="Sends a [TEST] copy of this template to the addresses below (max 10) with sample data filled in. Does not affect students." label="About test email" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Check how it renders in a real inbox before sending to students. Separate multiple addresses with commas.
                  </p>
                  <Textarea
                    id="bulk_test_emails"
                    value={testEmails}
                    onChange={(e) => setTestEmails(e.target.value)}
                    rows={2}
                    placeholder="admin@company.com, staff@company.com"
                    className="text-sm rounded-md"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendTest}
                    disabled={sendTestEmail.isPending}
                    className="rounded-md uppercase tracking-wide gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {sendTestEmail.isPending ? "Sending..." : "Send Test"}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-md uppercase tracking-wide">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={sendMessage.isPending || !formData.email_template_id}
              className="rounded-md uppercase tracking-wide gap-2"
            >
              <Send className="h-4 w-4" />
              {sendMessage.isPending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Sheet */}
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
            <Tabs defaultValue="email" className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-2 rounded-md">
                <TabsTrigger value="email" className="rounded-md uppercase tracking-wide">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="notification" className="rounded-md uppercase tracking-wide">
                  <Bell className="h-4 w-4 mr-2" />
                  Notification
                </TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="mt-4">
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Email Subject</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {selectedTemplate.subject.replace(/{([^}]+)}/g, (_match, varName) => `[${varName}]`)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] w-full rounded-lg border overflow-hidden bg-white">
                      <iframe
                        title="Email preview"
                        sandbox=""
                        srcDoc={
                          selectedTemplate.body_html ||
                          `<pre style="font-family:sans-serif;white-space:pre-wrap;padding:16px">${selectedTemplate.body_text || ""}</pre>`
                        }
                        className="w-full h-full bg-white"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      This is how the email renders to students. Variables like {"{student_name}"} appear as-is here and are replaced with real data when sent.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="notification" className="mt-4">
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Notification Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Title</Label>
                      <p className="font-medium">{formData.title || "No title"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Message</Label>
                      <p className="text-sm whitespace-pre-wrap">{formData.message || "No message"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Badge className="uppercase rounded-md px-2.5 py-0.5 text-xs font-medium mt-1">
                        {formData.notification_type}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-md uppercase tracking-wide">
              Close
            </Button>
          </div>
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

export default BulkMessages;

