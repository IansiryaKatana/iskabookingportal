import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminAcademicYears,
  useCreateAcademicYear,
  useSetActiveAcademicYear,
  useUpdateAcademicYear,
} from "@/hooks/useAdminAcademicYears";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Star, Plus } from "lucide-react";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

const schema = z
  .object({
    name: z.string().min(4, "Enter academic year name e.g. 2026/2027"),
    start_date: z.string().min(1, "Start date required").regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    end_date: z.string().min(1, "End date required").regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (!data.start_date || !data.end_date) return true;
      return new Date(data.start_date) < new Date(data.end_date);
    },
    {
      message: "End date must be after start date",
      path: ["end_date"],
    }
  );

const AcademicYears = () => {
  const { data, isLoading } = useAdminAcademicYears();
  const createYear = useCreateAcademicYear();
  const updateYear = useUpdateAcademicYear();
  const setActiveYear = useSetActiveAcademicYear();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      start_date: "",
      end_date: "",
      is_active: false,
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await updateYear.mutateAsync({ id: editingId, ...values });
        toast({ title: "Academic year updated" });
      } else {
        await createYear.mutateAsync({
          ...values,
          is_active: values.is_active ?? false,
        });
        toast({ title: "Academic year created" });
      }
      setOpen(false);
      setEditingId(null);
      form.reset({
        name: "",
        start_date: "",
        end_date: "",
        is_active: false,
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to save academic year",
        description: "Ensure dates are valid and try again.",
      });
    }
  });

  const handleEdit = (id: string) => {
    const year = data?.find((item) => item.id === id);
    if (!year) return;
    form.reset({
      name: year.name,
      start_date: year.start_date,
      end_date: year.end_date,
      is_active: year.is_active,
    });
    setEditingId(id);
    setOpen(true);
  };

  const handleSetActive = async (id: string) => {
    try {
      await setActiveYear.mutateAsync(id);
      toast({ title: "Academic year activated" });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to set active year",
      });
    }
  };

  return (
    <AdminLayout
      pageTitle="Academic Years"
      subtitle="Manage academic year boundaries and activate the current cycle."
      mobileActionButton={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
              onClick={() => {
                setEditingId(null);
                form.reset({
                  name: "",
                  start_date: "",
                  end_date: "",
                  is_active: false,
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
            Academic Years
          </h2>
          <p className="text-muted-foreground text-sm">
            Create and activate academic years to align pricing, contracts, and student journeys.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              className="rounded-full uppercase tracking-wide"
              onClick={() => {
                setEditingId(null);
                form.reset({
                  name: "",
                  start_date: "",
                  end_date: "",
                  is_active: false,
                });
              }}
            >
              Add academic year
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-display uppercase tracking-wide">
                {editingId ? "Edit academic year" : "Create academic year"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Academic year</FormLabel>
                      <FormControl>
                        <Input placeholder="2026/2027" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-2xl border px-4 py-3">
                      <div>
                        <FormLabel className="text-base">Set active</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Only one academic year can be active.
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
                    className="rounded-full uppercase tracking-wide"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-full uppercase tracking-wide"
                    disabled={createYear.isLoading || updateYear.isLoading}
                  >
                    {(createYear.isLoading || updateYear.isLoading) ? (
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
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Academic year timeline
          </CardTitle>
          <CardDescription>
            The active year drives pricing, contracts, and student portal defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {data?.map((year) => {
                const isActive = year.is_active;
                return (
                  <div
                    key={year.id}
                    className={`rounded-2xl border px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border/60"
                    }`}
                  >
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                        {isActive ? "Active" : "Archived"}
                      </p>
                      <h3 className="text-xl font-display font-bold uppercase tracking-wide">
                        {year.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(year.start_date), "d MMM yyyy")} –{" "}
                        {format(new Date(year.end_date), "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full uppercase tracking-wide gap-2"
                          onClick={() => handleSetActive(year.id)}
                          disabled={setActiveYear.isLoading}
                        >
                          <Star className="h-4 w-4" />
                          Set active
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => handleEdit(year.id)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!data?.length && (
                <p className="text-sm text-muted-foreground">
                  No academic years yet. Add your first year to begin configuring contracts and pricing.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AcademicYears;

