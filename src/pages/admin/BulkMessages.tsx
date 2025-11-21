import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBulkMessages, useSendBulkMessage } from "@/hooks/useBulkMessages";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { Plus, Send, Mail, Users, Eye, FileText, Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

const BulkMessages = () => {
  const { toast } = useToast();
  const { data: messages, isLoading } = useBulkMessages();
  const { data: templates } = useEmailTemplates();
  const sendMessage = useSendBulkMessage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [formData, setFormData] = useState({
    email_template_id: "",
    title: "",
    message: "",
    notification_type: "info" as "info" | "success" | "warning" | "error",
  });

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
      if (template.body_text) {
        // Use body_text if available (cleaner)
        plainText = template.body_text.replace(/{[^}]+}/g, (match) => {
          const varName = match.replace(/[{}]/g, "");
          return varName === "student_name" ? "Student" : varName.replace(/_/g, " ");
        }).substring(0, 200);
      } else if (template.body_html) {
        // Extract from HTML - remove all HTML tags and clean up
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = template.body_html;
        plainText = tempDiv.textContent || tempDiv.innerText || "";
        // Replace variables with readable placeholders
        plainText = plainText.replace(/{[^}]+}/g, (match) => {
          const varName = match.replace(/[{}]/g, "");
          return varName === "student_name" ? "Student" : varName.replace(/_/g, " ");
        });
        // Clean up whitespace
        plainText = plainText.replace(/\s+/g, " ").trim().substring(0, 200);
      }
      
      setFormData({
        ...formData,
        email_template_id: templateId,
        title: formData.title || template.subject.replace(/{[^}]+}/g, (match) => {
          const varName = match.replace(/[{}]/g, "");
          return varName === "student_name" ? "Student" : varName.replace(/_/g, " ");
        }),
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
      <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
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
          className="rounded-full h-9 w-9 p-0 bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide">
              Bulk Messages
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Send notifications and emails to multiple students at once
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <Plus className="h-4 w-4" />
            New Message
          </Button>
        </div>

        {messages && messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((message) => (
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
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Messages Sent
              </CardTitle>
              <CardDescription>
                Send your first bulk message to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setDialogOpen(true)}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <Plus className="h-4 w-4" />
                Send Message
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Send Bulk Message
            </DialogTitle>
            <DialogDescription>
              Select an email template to send notifications and emails to all confirmed students.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email_template">Email Template *</Label>
              {templates && templates.filter((t) => t.is_active).length > 0 ? (
                <Select
                  value={formData.email_template_id || undefined}
                  onValueChange={handleTemplateChange}
                >
                  <SelectTrigger id="email_template" className="mt-2">
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
              <Label htmlFor="title">Notification Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-2"
                placeholder="e.g., Important Update"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will appear as the notification title in the student portal.
              </p>
            </div>
            <div>
              <Label htmlFor="message">Notification Message *</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="mt-2"
                rows={4}
                placeholder="Enter your message here..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will appear as the notification message in the student portal.
              </p>
            </div>
            <div>
              <Label htmlFor="notification_type">Notification Type</Label>
              <Select
                value={formData.notification_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, notification_type: value as typeof formData.notification_type })
                }
              >
                <SelectTrigger id="notification_type" className="mt-2">
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
              <div className="pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                  className="rounded-full uppercase tracking-wide gap-2 w-full"
                >
                  <Eye className="h-4 w-4" />
                  Preview Email
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-full uppercase tracking-wide">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={sendMessage.isPending || !formData.email_template_id}
              className="rounded-full uppercase tracking-wide gap-2"
            >
              <Send className="h-4 w-4" />
              {sendMessage.isPending ? "Sending..." : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[800px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Email Preview
            </DialogTitle>
            <DialogDescription>
              Preview how the email will look to students (variables will be replaced with actual data).
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-full">
                <TabsTrigger value="email" className="rounded-full uppercase tracking-wide">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="notification" className="rounded-full uppercase tracking-wide">
                  <Bell className="h-4 w-4 mr-2" />
                  Notification
                </TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="mt-4">
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Email Subject</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {selectedTemplate.subject.replace(/{[^}]+}/g, (match) => {
                        const varName = match.replace(/[{}]/g, "");
                        return `[${varName}]`;
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full rounded-lg border p-4">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: selectedTemplate.body_html
                            ? selectedTemplate.body_html.replace(/{[^}]+}/g, (match) => {
                                const varName = match.replace(/[{}]/g, "");
                                return `<span class="bg-yellow-100 px-1 rounded font-mono text-xs">[${varName}]</span>`;
                              })
                            : selectedTemplate.body_text || "",
                        }}
                      />
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground mt-2">
                      Variables in yellow will be replaced with actual student data when sent.
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
                      <Badge className="uppercase rounded-full px-2.5 py-0.5 text-xs font-medium mt-1">
                        {formData.notification_type}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-full uppercase tracking-wide">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default BulkMessages;

