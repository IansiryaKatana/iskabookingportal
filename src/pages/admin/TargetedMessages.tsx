import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { TitleWithTooltip } from "@/components/ui/title-with-tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTargetedMessages, useSendTargetedMessage, type TargetedMessageFilters } from "@/hooks/useTargetedMessages";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useStudents } from "@/hooks/useStudents";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { Plus, Send, Mail, Users, Eye, X, Search, Filter } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const TargetedMessages = () => {
  const { toast } = useToast();
  const { data: messages, isLoading } = useTargetedMessages();
  const { data: templates } = useEmailTemplates();
  const sendMessage = useSendTargetedMessage();
  const { data: students } = useStudents();
  const { data: studioGradesData } = useAdminStudioGrades();
  const { data: academicYears } = useAdminAcademicYears();
  const studioGrades = studioGradesData?.grades ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  const selectedTemplate = useMemo(() => {
    if (!formData.email_template_id || !templates) return null;
    return templates.find((t) => t.id === formData.email_template_id && t.is_active);
  }, [formData.email_template_id, templates]);

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

  const handleTemplateChange = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (template) {
      let plainText = "";
      if (template.body_text) {
        plainText = template.body_text.replace(/{[^}]+}/g, (match) => {
          const varName = match.replace(/[{}]/g);
          return varName === "student_name" ? "Student" : varName.replace(/_/g, " ");
        }).substring(0, 200);
      } else if (template.body_html) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = template.body_html;
        plainText = tempDiv.textContent || tempDiv.innerText || "";
        plainText = plainText.replace(/{[^}]+}/g, (match) => {
          const varName = match.replace(/[{}]/g);
          return varName === "student_name" ? "Student" : varName.replace(/_/g, " ");
        });
        plainText = plainText.replace(/\s+/g, " ").trim().substring(0, 200);
      }
      
      setFormData({
        ...formData,
        email_template_id: templateId,
        title: formData.title || template.subject.replace(/{[^}]+}/g, (match) => {
          const varName = match.replace(/[{}]/g);
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
        (filters.academic_year_id && filters.academic_year_id.length > 0);
      
      if (!hasFilters) {
        toast({
          title: "Validation Error",
          description: "Please apply at least one filter.",
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
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <TitleWithTooltip
              tooltip="Send personalized messages to specific students or groups"
              tooltipLabel="About Targeted Messages"
              titleClassName="text-2xl font-display font-bold uppercase tracking-wide"
            >
              Targeted Messages
            </TitleWithTooltip>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="rounded-md uppercase tracking-wide gap-2"
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
                Send your first targeted message to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setDialogOpen(true)}
                className="rounded-md uppercase tracking-wide gap-2"
              >
                <Plus className="h-4 w-4" />
                Send Message
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[800px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Send Targeted Message
            </DialogTitle>
            <DialogDescription>
              Select specific students or apply filters to send personalized messages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "select" | "filter")}>
              <TabsList className="grid w-full grid-cols-2 rounded-md">
                <TabsTrigger value="select" className="rounded-md uppercase tracking-wide">
                  <Users className="h-4 w-4 mr-2" />
                  Select Students
                </TabsTrigger>
                <TabsTrigger value="filter" className="rounded-md uppercase tracking-wide">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter by Category
                </TabsTrigger>
              </TabsList>

              <TabsContent value="select" className="space-y-4 mt-4">
                <div>
                  <Label>Search and Select Students</Label>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Application Status</Label>
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
                    <Label>Studio Grade</Label>
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
                    <Label>Academic Year</Label>
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
                <Label htmlFor="email_template">Email Template *</Label>
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
                <Label htmlFor="title">Notification Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-2 rounded-md"
                  placeholder="e.g., Important Update"
                />
              </div>

              <div>
                <Label htmlFor="message">Notification Message *</Label>
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
                <Label htmlFor="notification_type">Notification Type</Label>
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
            </div>
          </div>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default TargetedMessages;

