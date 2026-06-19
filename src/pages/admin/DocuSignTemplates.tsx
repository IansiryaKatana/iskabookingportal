import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useDocuSignTemplates,
  useCreateDocuSignTemplate,
  useUpdateDocuSignTemplate,
  useDeleteDocuSignTemplate,
} from "@/hooks/useDocuSignTemplates";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
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

const templateSchema = z.object({
  academic_year_id: z.string().min(1, "Academic year required"),
  template_type: z.enum(["tenancy", "guarantor"], {
    required_error: "Template type required",
  }),
  template_id: z.string().min(1, "Template ID required").regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid template ID format (must be GUID)"),
  student_role: z.string().optional(),
  witness_role: z.string().optional(),
  guarantor_role: z.string().optional(),
  is_active: z.boolean().optional(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

const DocuSignTemplates = () => {
  const { data: academicYears, isLoading: yearsLoading } = useAdminAcademicYears();
  const { data: templates, isLoading: templatesLoading } = useDocuSignTemplates();
  const createTemplate = useCreateDocuSignTemplate();
  const updateTemplate = useUpdateDocuSignTemplate();
  const deleteTemplate = useDeleteDocuSignTemplate();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      academic_year_id: "",
      template_type: "tenancy",
      template_id: "",
      student_role: "",
      witness_role: "",
      guarantor_role: "",
      is_active: true,
    },
  });

  const templateType = form.watch("template_type");

  // Group templates by academic year
  const templatesByYear = useMemo(() => {
    if (!templates || !academicYears) return new Map();
    
    const map = new Map();
    academicYears.forEach((year) => {
      const yearTemplates = templates.filter((t) => t.academic_year_id === year.id);
      map.set(year.id, {
        year,
        templates: yearTemplates,
        hasTenancy: yearTemplates.some((t) => t.template_type === "tenancy" && t.is_active),
        hasGuarantor: yearTemplates.some((t) => t.template_type === "guarantor" && t.is_active),
      });
    });
    return map;
  }, [templates, academicYears]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const roleNames: Record<string, string> = {};
      if (values.student_role) roleNames.student = values.student_role;
      if (values.witness_role) roleNames.witness = values.witness_role;
      if (values.guarantor_role) roleNames.guarantor = values.guarantor_role;

      const payload = {
        academic_year_id: values.academic_year_id,
        template_type: values.template_type,
        template_id: values.template_id,
        role_names: Object.keys(roleNames).length > 0 ? roleNames : undefined,
        is_active: values.is_active ?? true,
      };

      if (editingId) {
        await updateTemplate.mutateAsync({ id: editingId, ...payload });
        toast({ title: "Template updated" });
      } else {
        await createTemplate.mutateAsync(payload);
        toast({ title: "Template created" });
      }
      setOpen(false);
      setEditingId(null);
      form.reset({
        academic_year_id: "",
        template_type: "tenancy",
        template_id: "",
        student_role: "",
        witness_role: "",
        guarantor_role: "",
        is_active: true,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to save template",
        description: error.message || "Please check the template ID and try again.",
      });
    }
  });

  const handleEdit = (id: string) => {
    const template = templates?.find((t) => t.id === id);
    if (!template) return;

    const roleNames = (template.role_names as Record<string, string>) || {};
    form.reset({
      academic_year_id: template.academic_year_id,
      template_type: template.template_type as "tenancy" | "guarantor",
      template_id: template.template_id,
      student_role: roleNames.student || "",
      witness_role: roleNames.witness || "",
      guarantor_role: roleNames.guarantor || "",
      is_active: template.is_active,
    });
    setEditingId(id);
    setOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTemplate.mutateAsync(deletingId);
      toast({ title: "Template deleted" });
      setDeletingId(null);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to delete template",
      });
    }
  };

  if (yearsLoading || templatesLoading) {
    return (
      <AdminLayout pageTitle="DocuSign Templates" subtitle="Manage DocuSign templates per academic year">
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      pageTitle="DocuSign Templates"
      subtitle="Configure DocuSign template IDs for tenancy and guarantor agreements per academic year."
      mobileActionButton={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="rounded-md uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
              onClick={() => {
                setEditingId(null);
                form.reset({
                  academic_year_id: "",
                  template_type: "tenancy",
                  template_id: "",
                  student_role: "",
                  witness_role: "",
                  guarantor_role: "",
                  is_active: true,
                });
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </Dialog>
      }
    >
      <div className="hidden lg:flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-black uppercase tracking-wide">
            DocuSign Templates
          </h2>
          <p className="text-muted-foreground text-sm">
            Configure template IDs for each academic year. Templates are required before students can sign agreements.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              className="rounded-md uppercase tracking-wide"
              onClick={() => {
                setEditingId(null);
                form.reset({
                  academic_year_id: "",
                  template_type: "tenancy",
                  template_id: "",
                  student_role: "",
                  witness_role: "",
                  guarantor_role: "",
                  is_active: true,
                });
              }}
            >
              Add template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                {editingId ? "Edit template" : "Add template"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <FormField
                  control={form.control}
                  name="academic_year_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic Year</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!!editingId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select academic year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {academicYears?.map((year) => (
                            <SelectItem key={year.id} value={year.id}>
                              {year.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="template_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!!editingId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="tenancy">Tenancy Agreement</SelectItem>
                          <SelectItem value="guarantor">Guarantor Agreement</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="template_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DocuSign Template ID</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="12345678-1234-1234-1234-123456789abc"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Find this in DocuSign Dashboard → Templates → Your Template → Template ID
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {templateType === "tenancy" && (
                  <>
                    <FormField
                      control={form.control}
                      name="student_role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Student Role Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Tenant" {...field} />
                          </FormControl>
                          <FormDescription>
                            Role name in DocuSign template (default: "Tenant")
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="witness_role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Witness Role Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Witness" {...field} />
                          </FormControl>
                          <FormDescription>
                            Role name in DocuSign template (default: "Witness")
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="guarantor_role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Guarantor Role Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Guarantor" {...field} />
                          </FormControl>
                          <FormDescription>
                            Role name in DocuSign template when guarantor signs tenancy (default: "Guarantor")
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                {templateType === "guarantor" && (
                  <FormField
                    control={form.control}
                    name="guarantor_role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Guarantor Role Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Guarantor" {...field} />
                        </FormControl>
                        <FormDescription>
                          Role name in DocuSign template (default: "Guarantor")
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-2xl border px-4 py-3">
                      <div>
                        <FormLabel className="text-base">Active</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Only active templates will be used for new agreements.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md uppercase tracking-wide"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-md uppercase tracking-wide"
                    disabled={createTemplate.isLoading || updateTemplate.isLoading}
                  >
                    {(createTemplate.isLoading || updateTemplate.isLoading) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
            Templates by Academic Year
          </CardTitle>
          <CardDescription>
            Each academic year requires both tenancy and guarantor templates to be configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {academicYears?.map((year) => {
              const yearData = templatesByYear.get(year.id);
              const yearTemplates = yearData?.templates || [];
              const hasTenancy = yearData?.hasTenancy || false;
              const hasGuarantor = yearData?.hasGuarantor || false;
              const isComplete = hasTenancy && hasGuarantor;

              return (
                <div
                  key={year.id}
                  className={`rounded-2xl border px-4 py-4 space-y-4 ${
                    isComplete
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-border/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base md:text-xl font-display font-bold uppercase tracking-wide">
                          {year.name}
                        </h3>
                        {isComplete ? (
                          <Badge className="bg-green-500 hover:bg-green-600 text-white">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Complete
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Incomplete
                          </Badge>
                        )}
                      </div>
                      {year.is_active && (
                        <Badge variant="outline" className="text-xs">
                          Active Year
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={`rounded-xl border p-3 ${hasTenancy ? "border-green-500/30 bg-green-500/5" : "border-border/60"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold">Tenancy Agreement</span>
                        {hasTenancy ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      {yearTemplates
                        .filter((t) => t.template_type === "tenancy")
                        .map((template) => (
                          <div key={template.id} className="flex items-center justify-between text-xs text-muted-foreground">
                            <code className="text-[10px]">{template.template_id}</code>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleEdit(template.id)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive"
                                onClick={() => setDeletingId(template.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      {!hasTenancy && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 text-xs"
                          onClick={() => {
                            form.reset({
                              academic_year_id: year.id,
                              template_type: "tenancy",
                              template_id: "",
                              student_role: "",
                              witness_role: "",
                              guarantor_role: "",
                              is_active: true,
                            });
                            setEditingId(null);
                            setOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Tenancy Template
                        </Button>
                      )}
                    </div>

                    <div className={`rounded-xl border p-3 ${hasGuarantor ? "border-green-500/30 bg-green-500/5" : "border-border/60"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold">Guarantor Agreement</span>
                        {hasGuarantor ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      {yearTemplates
                        .filter((t) => t.template_type === "guarantor")
                        .map((template) => (
                          <div key={template.id} className="flex items-center justify-between text-xs text-muted-foreground">
                            <code className="text-[10px]">{template.template_id}</code>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleEdit(template.id)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive"
                                onClick={() => setDeletingId(template.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      {!hasGuarantor && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 text-xs"
                          onClick={() => {
                            form.reset({
                              academic_year_id: year.id,
                              template_type: "guarantor",
                              template_id: "",
                              student_role: "",
                              witness_role: "",
                              guarantor_role: "",
                              is_active: true,
                            });
                            setEditingId(null);
                            setOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Guarantor Template
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {!academicYears?.length && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No academic years found. Create an academic year first.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
              Students will not be able to sign agreements for this academic year if templates are missing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default DocuSignTemplates;

