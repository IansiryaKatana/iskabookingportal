import { useState, useMemo, useEffect } from "react";
import PortalLayout from "@/components/portal/PortalLayout";
import { 
  useNotifications, 
  useUnreadNotifications, 
  useMarkNotificationRead, 
  useMarkAllNotificationsRead,
  useToggleStarNotification,
  useBulkMarkRead,
  useBulkStar
} from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { useEmailTemplate } from "@/hooks/useEmailTemplates";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button, constrainedFlexButtonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck, Check, Star, Mail, Search, X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ITEMS_PER_PAGE = 12;

// Notification Detail View Component
const NotificationDetailView = ({
  notification,
  isOpen,
  onOpenChange,
  onMarkRead,
  onToggleStar,
  markReadPending,
  getTypeLabel,
  navigate,
}: {
  notification: Notification | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkRead: () => Promise<void>;
  onToggleStar: () => Promise<void>;
  markReadPending: boolean;
  getTypeLabel: (type: string | null) => string;
  navigate: (path: string) => void;
}) => {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState<{
    name: string;
    studioNumber: string;
    contractStart: string;
    contractEnd: string;
    applicationId: string;
  } | null>(null);
  const [isLoadingStudentData, setIsLoadingStudentData] = useState(false);

  const emailTemplateId = useMemo(() => {
    if (!notification?.metadata) return null;
    const metadata = notification.metadata as any;
    return metadata?.email_template_id || null;
  }, [notification]);

  const { data: emailTemplate, isLoading: templateLoading, error: templateError } = useEmailTemplate(emailTemplateId || "disabled");

  // Fetch student data for preview
  useEffect(() => {
    if (!user?.id || !isOpen) {
      setStudentData(null);
      setIsLoadingStudentData(false);
      return;
    }
    
    const fetchStudentData = async () => {
      setIsLoadingStudentData(true);
      try {
        // Fetch profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        // Fetch application data - use maybeSingle to handle missing applications
        let application = null;
        let appError = null;
        try {
          const result = await supabase
            .from("student_applications")
            .select("id, assigned_studio_id, contract_id")
            .eq("student_id", user.id)
            .eq("status", "confirmed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          application = result.data;
          appError = result.error;
        } catch (err) {
          console.error("Error fetching application:", err);
          appError = err as any;
        }

        // Fetch studio data separately if application exists
        let studioNumber = "TBA";
        if (application?.assigned_studio_id && !appError) {
          const { data: studio } = await supabase
            .from("studios")
            .select("studio_number")
            .eq("id", application.assigned_studio_id)
            .maybeSingle();
          studioNumber = studio?.studio_number || "TBA";
        }

        // Fetch contract data separately if application exists
        let contractStart = "TBA";
        let contractEnd = "TBA";
        if (application?.contract_id && !appError) {
          const { data: contract } = await supabase
            .from("contracts")
            .select("start_date, end_date")
            .eq("id", application.contract_id)
            .maybeSingle();
          contractStart = contract?.start_date
            ? new Date(contract.start_date).toLocaleDateString()
            : "TBA";
          contractEnd = contract?.end_date
            ? new Date(contract.end_date).toLocaleDateString()
            : "TBA";
        }

        // Try to get name from multiple sources
        let studentName = "Student";
        
        // Priority 1: profiles table
        if (profile?.first_name && profile?.last_name) {
          studentName = `${profile.first_name} ${profile.last_name}`;
        } 
        // Priority 2: user.app_metadata
        else if (user?.app_metadata?.first_name && user?.app_metadata?.last_name) {
          studentName = `${user.app_metadata.first_name} ${user.app_metadata.last_name}`;
        }
        // Priority 3: application step 1
        if (application?.id && studentName === "Student") {
          const { data: step1 } = await supabase
            .from("student_application_steps")
            .select("payload")
            .eq("application_id", application.id)
            .eq("step_number", 1)
            .maybeSingle();
          
          if (step1?.payload) {
            const payload = step1.payload as any;
            if (payload?.first_name && payload?.last_name) {
              studentName = `${payload.first_name} ${payload.last_name}`;
            }
          }
        }

        setStudentData({
          name: studentName,
          studioNumber,
          contractStart,
          contractEnd,
          applicationId: application?.id || "",
        });
      } catch (error) {
        console.error("Error fetching student data:", error);
        // Set default student data even on error
        setStudentData({
          name: "Student",
          studioNumber: "TBA",
          contractStart: "TBA",
          contractEnd: "TBA",
          applicationId: "",
        });
      } finally {
        setIsLoadingStudentData(false);
      }
    };

    fetchStudentData();
  }, [user?.id, isOpen]);

  // Replace variables with student data for preview
  const previewHtml = useMemo(() => {
    if (!emailTemplate?.body_html) return null;
    
    // Use studentData if available, otherwise use defaults
    const studentName = studentData?.name || "Student";
    const studioNumber = studentData?.studioNumber || "TBA";
    const contractStart = studentData?.contractStart || "TBA";
    const contractEnd = studentData?.contractEnd || "TBA";
    const applicationId = studentData?.applicationId || "";
    
    const portalUrl = window.location.origin + "/portal";
    const logoUrl = window.location.origin + "/favicon.png";
    
    return emailTemplate.body_html
      .replace(/{student_name}/g, studentName)
      .replace(/{portal_url}/g, portalUrl)
      .replace(/{logo_url}/g, logoUrl)
      .replace(/{title}/g, notification?.title || "")
      .replace(/{message}/g, notification?.message || "")
      .replace(/{date}/g, new Date().toLocaleDateString())
      .replace(/{studio_number}/g, studioNumber)
      .replace(/{contract_start}/g, contractStart)
      .replace(/{contract_end}/g, contractEnd)
      .replace(/{application_id}/g, applicationId);
  }, [emailTemplate, notification, studentData]);

  if (!notification) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto [&>button]:!bg-red-500 [&>button]:!text-white [&>button]:hover:!bg-red-600 [&>button]:!rounded-md [&>button]:!h-8 [&>button]:!w-8 [&>button]:!flex [&>button]:!items-center [&>button]:!justify-center [&>button]:!opacity-100 [&>button]:!shadow-md [&>button]:transition-colors">
        <SheetHeader>
          <div className="flex items-start justify-between pr-12">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2">
                <SheetTitle className="text-xl font-bold flex-1">
                  {notification.title}
                </SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className={clsx(
                    "h-9 w-9 rounded-md flex-shrink-0",
                    notification.is_starred && "text-yellow-500"
                  )}
                  onClick={onToggleStar}
                >
                  <Star
                    className={clsx(
                      "h-5 w-5",
                      notification.is_starred && "fill-current"
                    )}
                  />
                </Button>
              </div>
              <SheetDescription className="text-sm text-muted-foreground">
                {format(new Date(notification.created_at), "EEEE, MMMM d, yyyy 'at' HH:mm")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="mt-6">
          {emailTemplateId ? (
            <div className="space-y-4">
              {templateLoading || isLoadingStudentData ? (
                <Skeleton className="h-[600px] w-full rounded-2xl" />
              ) : emailTemplate && previewHtml ? (
                <div className="border rounded-2xl overflow-hidden bg-white shadow-sm">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full border-0"
                    style={{ 
                      minHeight: "600px", 
                      height: "auto",
                      display: "block",
                      overflow: "hidden"
                    }}
                    title="Email Content"
                    sandbox="allow-same-origin allow-scripts"
                    scrolling="no"
                    onLoad={(e) => {
                      // Auto-resize iframe to content height
                      const iframe = e.target as HTMLIFrameElement;
                      try {
                        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (doc) {
                          // Hide scrollbars in iframe content
                          const style = doc.createElement('style');
                          style.textContent = `
                            body { 
                              overflow: hidden !important; 
                              margin: 0 !important;
                              padding: 0 !important;
                            }
                            ::-webkit-scrollbar {
                              display: none !important;
                            }
                            * {
                              -ms-overflow-style: none !important;
                              scrollbar-width: none !important;
                            }
                          `;
                          doc.head.appendChild(style);
                          
                          const height = Math.max(doc.body.scrollHeight, doc.body.offsetHeight, 600);
                          iframe.style.height = `${height}px`;
                        }
                      } catch (err) {
                        // Cross-origin or other error, use default height
                        iframe.style.height = "600px";
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <Badge variant="outline" className="mb-3">
                    {getTypeLabel(notification.type)}
                  </Badge>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {notification.message?.replace(/<[^>]*>/g).replace(/\s+/g, " ").trim() || ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                {notification.link && (
                  <Button
                    variant="outline"
                    className={clsx(constrainedFlexButtonClassName, "rounded-md uppercase tracking-wide")}
                    onClick={() => {
                      navigate(notification.link!);
                      onOpenChange(false);
                    }}
                  >
                    View Details
                  </Button>
                )}
                {!notification.is_read && (
                  <Button
                    variant="default"
                    className={clsx(constrainedFlexButtonClassName, "rounded-md uppercase tracking-wide gap-2")}
                    onClick={onMarkRead}
                    disabled={markReadPending}
                  >
                    <Check className="h-4 w-4" />
                    Mark as Read
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Badge variant="outline" className="mb-3">
                  {getTypeLabel(notification.type)}
                </Badge>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {notification.message?.replace(/<[^>]*>/g).replace(/\s+/g, " ").trim() || ""}
                  </p>
                </div>
              </div>
              {notification.link && (
                <Button
                  variant="outline"
                  className="w-full rounded-md uppercase tracking-wide"
                  onClick={() => {
                    navigate(notification.link!);
                    onOpenChange(false);
                  }}
                >
                  View Details
                </Button>
              )}
              {!notification.is_read && (
                <Button
                  variant="default"
                  className="w-full rounded-md uppercase tracking-wide gap-2"
                  onClick={onMarkRead}
                  disabled={markReadPending}
                >
                  <Check className="h-4 w-4" />
                  Mark as Read
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread" | "read" | "starred">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedNotification, setSelectedNotification] = useState<typeof notifications[0] | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const { data: notifications, isLoading } = useNotifications(user?.id);
  const { data: unreadCount } = useUnreadNotifications(user?.id);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const toggleStar = useToggleStarNotification();
  const bulkMarkRead = useBulkMarkRead();
  const bulkStar = useBulkStar();

  // Filter and search notifications
  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    
    let filtered = notifications;

    // Apply filter
    if (filter === "unread") {
      filtered = filtered.filter((n) => !n.is_read);
    } else if (filter === "read") {
      filtered = filtered.filter((n) => n.is_read);
    } else if (filter === "starred") {
      filtered = filtered.filter((n) => n.is_starred);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.title?.toLowerCase().includes(query) ||
          n.message?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [notifications, filter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNotifications.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredNotifications, currentPage]);

  const unreadNotifications = notifications?.filter((n) => !n.is_read) || [];
  const readNotifications = notifications?.filter((n) => n.is_read) || [];
  const starredNotifications = notifications?.filter((n) => n.is_starred) || [];

  const handleNotificationClick = async (notification: typeof notifications[0]) => {
    setSelectedNotification(notification);
    setIsDetailOpen(true);
    if (!notification.is_read) {
      await markRead.mutateAsync(notification.id);
    }
  };

  const handleMarkAllRead = async () => {
    if (user?.id && unreadNotifications.length > 0) {
      await markAllRead.mutateAsync(user.id);
    }
  };

  const handleToggleStar = async (notificationId: string, currentStarred: boolean) => {
    await toggleStar.mutateAsync({ notificationId, isStarred: !currentStarred });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedNotifications.map((n) => n.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.size > 0) {
      await bulkMarkRead.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleBulkStar = async (isStarred: boolean) => {
    if (selectedIds.size > 0) {
      await bulkStar.mutateAsync({ notificationIds: Array.from(selectedIds), isStarred });
      setSelectedIds(new Set());
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-green-600";
      case "warning":
        return "text-yellow-600";
      case "error":
        return "text-red-600";
      default:
        return "text-blue-600";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "success":
        return "Success";
      case "warning":
        return "Warning";
      case "error":
        return "Error";
      default:
        return "Info";
    }
  };

  // Reset page when filter or search changes
  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return (
      <PortalLayout pageTitle="Notifications" subtitle="View all your notifications">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout pageTitle="Notifications" subtitle="View all your notifications">
      <div className="flex flex-col h-[calc(100vh-200px)]">
        {/* Search Bar */}
        <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 rounded-md text-sm"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 rounded-md"
                onClick={() => handleSearchChange("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 sm:gap-2 border-b border-border pb-2 mb-3 sm:mb-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("all")}
            className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            All
            {(notifications?.length || 0) > 0 && (
              <Badge className="h-5 px-1.5 sm:px-2 bg-blue-500 hover:bg-blue-600 text-white text-[10px] sm:text-xs font-medium rounded-md">
                {notifications?.length || 0}
              </Badge>
            )}
          </Button>
          <Button
            variant={filter === "unread" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("unread")}
            className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            Unread
            {(unreadCount || 0) > 0 && (
              <Badge className="h-5 px-1.5 sm:px-2 bg-orange-500 hover:bg-orange-600 text-white text-[10px] sm:text-xs font-medium rounded-md">
                {unreadCount || 0}
              </Badge>
            )}
          </Button>
          <Button
            variant={filter === "read" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("read")}
            className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            Read
            {readNotifications.length > 0 && (
              <Badge className="h-5 px-1.5 sm:px-2 bg-green-500 hover:bg-green-600 text-white text-[10px] sm:text-xs font-medium rounded-md">
                {readNotifications.length}
              </Badge>
            )}
          </Button>
          <Button
            variant={filter === "starred" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("starred")}
            className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            Starred
            {starredNotifications.length > 0 && (
              <Badge className="h-5 px-1.5 sm:px-2 bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] sm:text-xs font-medium rounded-md">
                {starredNotifications.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-2 p-2 sm:p-3 bg-muted/50 rounded-2xl mb-3 sm:mb-4">
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2 sm:ml-auto w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkMarkRead}
                disabled={bulkMarkRead.isPending}
                className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-medium h-8 sm:h-9 px-2.5 sm:px-4 flex-1 sm:flex-initial whitespace-nowrap"
              >
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden min-[375px]:inline">Mark as read</span>
                <span className="min-[375px]:hidden">Read</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkStar(true)}
                disabled={bulkStar.isPending}
                className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-medium h-8 sm:h-9 px-2.5 sm:px-4 flex-1 sm:flex-initial whitespace-nowrap"
              >
                <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Star
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkStar(false)}
                disabled={bulkStar.isPending}
                className="rounded-md uppercase tracking-wide gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-medium h-8 sm:h-9 px-2.5 sm:px-4 flex-1 sm:flex-initial whitespace-nowrap"
              >
                <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-current" />
                Unstar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-md uppercase tracking-wide text-[10px] sm:text-xs font-medium h-8 sm:h-9 px-2.5 sm:px-4 flex-1 sm:flex-initial whitespace-nowrap"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Notifications List */}
        <div className="flex-1 overflow-hidden border rounded-3xl">
          {paginatedNotifications.length > 0 ? (
            <>
              <div className="border-b p-2 sm:p-3 flex items-center gap-2 sm:gap-3">
                <Checkbox
                  checked={selectedIds.size === paginatedNotifications.length && paginatedNotifications.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="h-4 w-4 sm:h-5 sm:w-5"
                />
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ScrollArea className="h-full">
                <div className="divide-y">
                  {paginatedNotifications.map((notification) => {
                    const isSelected = selectedIds.has(notification.id);
                    const isUnread = !notification.is_read;
                    
                    return (
                      <div
                        key={notification.id}
                        className={clsx(
                          "group relative flex items-center gap-2 sm:gap-4 p-3 sm:p-4 hover:bg-muted/30 transition-colors cursor-pointer",
                          isUnread && "bg-muted/20"
                        )}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectOne(notification.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0"
                        />
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                              <span
                                className={clsx(
                                  "text-xs sm:text-sm truncate",
                                  isUnread ? "font-bold" : "font-normal"
                                )}
                              >
                                {notification.title}
                              </span>
                              {isUnread && (
                                <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-md bg-primary flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                              Urban Hub Management
                            </p>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(notification.created_at), "MMM d")}
                            </span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 sm:gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 sm:h-8 sm:w-8 rounded-md"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await markRead.mutateAsync(notification.id);
                                }}
                                disabled={markRead.isPending || notification.is_read}
                              >
                                <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={clsx(
                                  "h-7 w-7 sm:h-8 sm:w-8 rounded-md",
                                  notification.is_starred && "text-yellow-500"
                                )}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleToggleStar(notification.id, notification.is_starred || false);
                                }}
                                disabled={toggleStar.isPending}
                              >
                                <Star
                                  className={clsx(
                                    "h-3.5 w-3.5 sm:h-4 sm:w-4",
                                    notification.is_starred && "fill-current"
                                  )}
                                />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="p-12 text-center">
              <Bell className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery
                  ? "No notifications found"
                  : filter === "unread"
                  ? "No unread notifications"
                  : filter === "read"
                  ? "No read notifications"
                  : filter === "starred"
                  ? "No starred notifications"
                  : "No notifications"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "You're all caught up!"}
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0 mt-3 sm:mt-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md uppercase tracking-wide gap-1 sm:gap-2 text-xs sm:text-sm"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md uppercase tracking-wide gap-1 sm:gap-2 text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Side Panel */}
      <NotificationDetailView
        notification={selectedNotification}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onMarkRead={async () => {
          if (selectedNotification && !selectedNotification.is_read) {
            await markRead.mutateAsync(selectedNotification.id);
          }
        }}
        onToggleStar={async () => {
          if (selectedNotification) {
            await handleToggleStar(selectedNotification.id, selectedNotification.is_starred || false);
          }
        }}
        markReadPending={markRead.isPending}
        getTypeLabel={getTypeLabel}
        navigate={navigate}
      />
    </PortalLayout>
  );
};

export default Notifications;
