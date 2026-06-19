import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  Lock,
  Eye,
  EyeOff,
  Plus,
  Save,
  Trash2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/auditLog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

type Credential = {
  id: string;
  credential_key: string;
  credential_value: string;
  credential_type: string;
  category: string;
  description: string | null;
  is_encrypted: boolean;
  requires_encryption: boolean;
  sync_to_edge_function: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type CredentialFormData = {
  credential_key: string;
  credential_value: string;
  credential_type: string;
  category: string;
  description: string;
  requires_encryption: boolean;
  sync_to_edge_function: boolean;
};

const ITEMS_PER_PAGE = 5;

const Secrets = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<Credential | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState<CredentialFormData>({
    credential_key: "",
    credential_value: "",
    credential_type: "api_key",
    category: "integration",
    description: "",
    requires_encryption: false,
    sync_to_edge_function: true,
  });

  // Fetch credentials
  const { data: credentials, isLoading, refetch } = useQuery({
    queryKey: ["credentials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credentials")
        .select("*")
        .order("credential_key", { ascending: true });

      if (error) throw error;
      return (data || []) as Credential[];
    },
  });

  // Filter credentials
  const filteredCredentials = credentials?.filter((cred) => {
    const matchesSearch =
      cred.credential_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cred.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Pagination logic
  const totalPages = filteredCredentials ? Math.ceil(filteredCredentials.length / ITEMS_PER_PAGE) : 0;
  const paginatedCredentials = useMemo(() => {
    if (!filteredCredentials) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredCredentials.slice(startIndex, endIndex);
  }, [filteredCredentials, currentPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Get decrypted value for display
  const getDisplayValue = async (credential: Credential): Promise<string> => {
    if (credential.is_encrypted && credential.credential_value === "[ENCRYPTED]") {
      try {
        const { data, error } = await supabase.rpc("get_credential_value", {
          p_credential_key: credential.credential_key,
        });
        if (error) throw error;
        return data || "[ENCRYPTED]";
      } catch (error) {
        console.error("Failed to decrypt:", error);
        return "[ENCRYPTED - Decryption Failed]";
      }
    }
    return credential.credential_value;
  };

  // Create credential mutation
  const createCredential = useMutation({
    mutationFn: async (data: CredentialFormData) => {
      const { error } = await supabase.from("credentials").insert({
        credential_key: data.credential_key,
        credential_value: data.credential_value,
        credential_type: data.credential_type,
        category: data.category,
        description: data.description || null,
        requires_encryption: data.requires_encryption,
        sync_to_edge_function: data.sync_to_edge_function,
      });

      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      await logActivity({
        action: "create",
        entityType: "credentials",
        payload: { credential_key: variables.credential_key },
      });
      
      toast({
        title: "Secret saved",
        description: "Secret saved to database. Edge Functions will use this value immediately (database-first with env var fallback).",
        duration: 5000,
      });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create secret",
        variant: "destructive",
      });
    },
  });

  // Update credential mutation
  const updateCredential = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CredentialFormData> }) => {
      const updatePayload: any = {};
      // Only update credential_value if a new value is provided (not empty)
      if (data.credential_value !== undefined && data.credential_value.trim() !== "") {
        updatePayload.credential_value = data.credential_value;
      }
      if (data.credential_type !== undefined) updatePayload.credential_type = data.credential_type;
      if (data.category !== undefined) updatePayload.category = data.category;
      if (data.description !== undefined) updatePayload.description = data.description || null;
      if (data.requires_encryption !== undefined) updatePayload.requires_encryption = data.requires_encryption;
      if (data.sync_to_edge_function !== undefined) updatePayload.sync_to_edge_function = data.sync_to_edge_function;

      const { error } = await supabase
        .from("credentials")
        .update(updatePayload)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      await logActivity({
        action: "update",
        entityType: "credentials",
        payload: { credential_key: editingCredential?.credential_key },
      });
      toast({
        title: "Success",
        description: "Secret updated successfully.",
      });
      setIsEditDialogOpen(false);
      setEditingCredential(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update secret",
        variant: "destructive",
      });
    },
  });

  // Delete credential mutation
  const deleteCredential = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credentials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      await logActivity({
        action: "delete",
        entityType: "credentials",
        payload: { credential_key: credentialToDelete?.credential_key },
      });
      toast({
        title: "Success",
        description: "Secret deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setCredentialToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete secret",
        variant: "destructive",
      });
    },
  });

  // Migrate secrets from Edge Function env vars to database
  const migrateSecrets = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("migrate-secrets-to-database", {
        body: { dry_run: false },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      toast({
        title: "Migration Complete",
        description: data.message || `Successfully migrated ${data.migrated?.length || 0} secret(s) to database. Changes take effect immediately.`,
        duration: 8000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Migration Failed",
        description: error.message || "Failed to migrate secrets",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      credential_key: "",
      credential_value: "",
      credential_type: "api_key",
      category: "integration",
      description: "",
      requires_encryption: false,
      sync_to_edge_function: true,
    });
  };

  const handleAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEdit = (credential: Credential) => {
    setFormData({
      credential_key: credential.credential_key,
      credential_value: credential.credential_value === "[ENCRYPTED]" ? "" : credential.credential_value,
      credential_type: credential.credential_type,
      category: credential.category,
      description: credential.description || "",
      requires_encryption: credential.requires_encryption,
      sync_to_edge_function: credential.sync_to_edge_function,
    });
    setEditingCredential(credential);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (credential: Credential) => {
    setCredentialToDelete(credential);
    setDeleteDialogOpen(true);
  };

  const toggleShowValue = (key: string) => {
    setShowValues((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const maskValue = (value: string): string => {
    if (!value || value === "[ENCRYPTED]") return "••••••••••••";
    if (value.length <= 8) return "••••";
    return value.substring(0, 4) + "••••" + value.substring(value.length - 4);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "Value copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const categories = ["all", "integration", "api_key", "webhook", "url", "email", "system", "other"];

  return (
    <AdminLayout
      pageTitle="Secrets Management"
      subtitle="Manage API keys, credentials, and secrets securely. All changes are encrypted and logged."
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center justify-between">
          <div className="w-full flex flex-row gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search secrets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rounded-md text-sm sm:text-base placeholder:text-xs sm:placeholder:text-sm"
              />
            </div>

            {/* Action Buttons - Icon only on mobile, full on desktop */}
            <div className="flex gap-2 items-center">
              <Button
                onClick={() => migrateSecrets.mutate()}
                disabled={migrateSecrets.isPending || isMigrating}
                variant="outline"
                size="icon"
                className="rounded-md h-10 w-10 sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:rounded-md sm:uppercase sm:tracking-wide sm:gap-2"
                title="Migrate from Env Vars"
              >
                {migrateSecrets.isPending || isMigrating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="hidden sm:inline ml-2">Migrate from Env Vars</span>
              </Button>
              <Button 
                onClick={handleAdd} 
                size="icon"
                className="rounded-md h-10 w-10 sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:rounded-md sm:uppercase sm:tracking-wide sm:gap-2"
                title="Add Secret"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Add Secret</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Secrets List */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Secrets ({filteredCredentials?.length || 0})
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Manage all your API keys and credentials. Secrets are stored in the database and used by Edge Functions immediately. 
              Edge Functions read from database first, with automatic fallback to environment variables for safety.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : filteredCredentials && filteredCredentials.length > 0 ? (
              <>
                <div className="space-y-4">
                  {paginatedCredentials.map((credential) => {
                  const isShowing = showValues[credential.id];
                  const displayValue = isShowing
                    ? credential.credential_value === "[ENCRYPTED]"
                      ? "[ENCRYPTED]"
                      : credential.credential_value
                    : maskValue(credential.credential_value);

                  return (
                    <div
                      key={credential.id}
                      className="border rounded-2xl p-4 space-y-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Label className="font-semibold text-base">{credential.credential_key}</Label>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                credential.category === "api_key" 
                                  ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700"
                                  : credential.category === "webhook"
                                  ? "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700"
                                  : credential.category === "integration"
                                  ? "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700"
                                  : credential.category === "email"
                                  ? "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700"
                                  : credential.category === "url"
                                  ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                                  : credential.category === "system"
                                  ? "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700"
                                  : "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700"
                              }`}
                            >
                              {credential.category}
                            </Badge>
                            {credential.is_encrypted && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Lock className="h-3 w-3" />
                                Encrypted
                              </Badge>
                            )}
                            {credential.sync_to_edge_function && (
                              <Badge className="text-xs gap-1 bg-green-600 text-white border-green-600 hover:bg-green-600 dark:bg-green-600 dark:text-white">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </Badge>
                            )}
                          </div>
                          {credential.description && (
                            <p className="text-sm text-muted-foreground">{credential.description}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 relative">
                              <Input
                                type={isShowing ? "text" : "password"}
                                value={displayValue}
                                readOnly
                                className="font-mono text-sm pr-20"
                              />
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => toggleShowValue(credential.id)}
                                >
                                  {isShowing ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => {
                                    if (isShowing) {
                                      copyToClipboard(credential.credential_value);
                                    }
                                  }}
                                  disabled={!isShowing || credential.credential_value === "[ENCRYPTED]"}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          {credential.updated_at && (
                            <p className="text-xs text-muted-foreground">
                              Last updated: {new Date(credential.updated_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-row md:flex-col lg:flex-row gap-2 md:items-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(credential)}
                            className="rounded-md w-full md:w-auto"
                          >
                            Edit
                          </Button>
                          <AlertDialog open={deleteDialogOpen && credentialToDelete?.id === credential.id}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(credential)}
                                className="rounded-md w-full md:w-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
                {/* Pagination */}
                {filteredCredentials && filteredCredentials.length > ITEMS_PER_PAGE && (
                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                      {Math.min(currentPage * ITEMS_PER_PAGE, filteredCredentials.length)} of {filteredCredentials.length} secret{filteredCredentials.length !== 1 ? "s" : ""}
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              if (currentPage > 1) setCurrentPage(currentPage - 1);
                            }}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          if (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          ) {
                            return (
                              <PaginationItem key={page}>
                                <PaginationLink
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(page);
                                  }}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          } else if (page === currentPage - 2 || page === currentPage + 2) {
                            return (
                              <PaginationItem key={page}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            );
                          }
                          return null;
                        })}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                            }}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No secrets found</p>
                <Button onClick={handleAdd} className="mt-4 rounded-md uppercase tracking-wide gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Secret
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader className="flex flex-row items-start justify-between gap-2">
              <div className="space-y-1">
                <DialogTitle>Add New Secret</DialogTitle>
                <DialogDescription>Add a new API key or credential. Sensitive values can be encrypted.</DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setIsAddDialogOpen(false)}
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-green-900 dark:text-green-100 mb-1">Database-First Approach</p>
                    <p className="text-green-800 dark:text-green-200 text-xs">
                      Secrets are stored in the database and used by Edge Functions immediately. Changes take effect right away - no sync needed!
                      Edge Functions automatically read from database first, with safe fallback to environment variables if database is unavailable.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="credential_key">Key Name *</Label>
                <Input
                  id="credential_key"
                  placeholder="e.g., STRIPE_SECRET_KEY"
                  value={formData.credential_key}
                  onChange={(e) => setFormData({ ...formData, credential_key: e.target.value.toUpperCase() })}
                  className="rounded-md"
                />
                <p className="text-xs text-muted-foreground">Use uppercase with underscores (e.g., API_KEY_NAME)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="credential_value">Value *</Label>
                <Textarea
                  id="credential_value"
                  placeholder="Enter the secret value..."
                  value={formData.credential_value}
                  onChange={(e) => setFormData({ ...formData, credential_value: e.target.value })}
                  className="min-h-[100px] rounded-2xl"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter((c) => c !== "all").map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credential_type">Type</Label>
                  <Select
                    value={formData.credential_type}
                    onValueChange={(value) => setFormData({ ...formData, credential_type: value })}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="token">Token</SelectItem>
                      <SelectItem value="password">Password</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="What is this secret used for?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="rounded-md"
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="requires_encryption">Require Encryption</Label>
                    <p className="text-xs text-muted-foreground">Encrypt this value in the database</p>
                  </div>
                  <Switch
                    id="requires_encryption"
                    checked={formData.requires_encryption}
                    onCheckedChange={(checked) => setFormData({ ...formData, requires_encryption: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="sync_to_edge_function">Use in Edge Functions</Label>
                    <p className="text-xs text-muted-foreground">Edge Functions will read this secret from database (enabled by default)</p>
                  </div>
                  <Switch
                    id="sync_to_edge_function"
                    checked={formData.sync_to_edge_function}
                    onCheckedChange={(checked) => setFormData({ ...formData, sync_to_edge_function: checked })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="rounded-md w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={() => createCredential.mutate(formData)}
                disabled={!formData.credential_key || !formData.credential_value || createCredential.isPending}
                className="rounded-md uppercase tracking-wide gap-2 w-full sm:w-auto"
              >
                {createCredential.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Create Secret
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader className="flex flex-row items-start justify-between gap-2">
              <div className="space-y-1">
                <DialogTitle>Edit Secret</DialogTitle>
                <DialogDescription>Update the secret value or settings. Key name cannot be changed.</DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setIsEditDialogOpen(false)}
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input value={formData.credential_key} disabled className="rounded-md bg-muted" />
                <p className="text-xs text-muted-foreground">Key name cannot be changed</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_credential_value">Value *</Label>
                <Textarea
                  id="edit_credential_value"
                  placeholder="Enter new value (leave empty to keep current encrypted value)..."
                  value={formData.credential_value}
                  onChange={(e) => setFormData({ ...formData, credential_value: e.target.value })}
                  className="min-h-[100px] rounded-2xl"
                />
                {editingCredential?.is_encrypted && (
                  <p className="text-xs text-muted-foreground">
                    Current value is encrypted. Enter a new value to update it.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_category">Category</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter((c) => c !== "all").map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_credential_type">Type</Label>
                  <Select
                    value={formData.credential_type}
                    onValueChange={(value) => setFormData({ ...formData, credential_type: value })}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="token">Token</SelectItem>
                      <SelectItem value="password">Password</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_description">Description</Label>
                <Input
                  id="edit_description"
                  placeholder="What is this secret used for?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="rounded-md"
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="edit_requires_encryption">Require Encryption</Label>
                    <p className="text-xs text-muted-foreground">Encrypt this value in the database</p>
                  </div>
                  <Switch
                    id="edit_requires_encryption"
                    checked={formData.requires_encryption}
                    onCheckedChange={(checked) => setFormData({ ...formData, requires_encryption: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="edit_sync_to_edge_function">Use in Edge Functions</Label>
                    <p className="text-xs text-muted-foreground">Edge Functions will read this secret from database (enabled by default)</p>
                  </div>
                  <Switch
                    id="edit_sync_to_edge_function"
                    checked={formData.sync_to_edge_function}
                    onCheckedChange={(checked) => setFormData({ ...formData, sync_to_edge_function: checked })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="rounded-md w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingCredential) {
                    updateCredential.mutate({ id: editingCredential.id, data: formData });
                  }
                }}
                disabled={updateCredential.isPending}
                className="rounded-md uppercase tracking-wide gap-2 w-full sm:w-auto"
              >
                {updateCredential.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Update Secret
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="rounded-t-3xl sm:rounded-3xl">
            <AlertDialogHeader className="flex flex-row items-start justify-between gap-2">
              <div className="space-y-1">
                <AlertDialogTitle className="text-destructive">Delete Secret?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      Are you sure you want to delete <strong>{credentialToDelete?.credential_key}</strong>?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This action cannot be undone. The secret will be permanently removed from the database.
                    </p>
                  </div>
                </AlertDialogDescription>
              </div>
              <AlertDialogCancel asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md"
                  aria-label="Close"
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </AlertDialogCancel>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="rounded-md w-full sm:w-auto" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (credentialToDelete) {
                    deleteCredential.mutate(credentialToDelete.id);
                  }
                }}
                disabled={deleteCredential.isPending}
                className="rounded-md bg-destructive hover:bg-destructive/90 w-full sm:w-auto"
              >
                {deleteCredential.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default Secrets;

