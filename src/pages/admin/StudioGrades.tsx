import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminStudioGrades,
  useUpdateStudioGrade,
  useUpdateStudioGradePrice,
} from "@/hooks/useAdminStudioGrades";
import {
  useAdminStudioGradeDetail,
  useCreateStudioGradeBanner,
  useDeleteStudioGradeBanner,
  useDeleteStudioMedia,
  useSetHeroStudioMedia,
  useUploadStudioGradeMedia,
  useUpdateStudioGradeBanner,
} from "@/hooks/useAdminStudioGradeDetail";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Star, Trash2, Eye, Upload, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";

const schema = z.object({
  short_description: z.string().min(10, "Add a short description"),
  long_description: z.string().min(20, "Long description should add more detail"),
  weekly_price: z.coerce.number().min(1, "Weekly price required"),
  deposit_amount_override: z.coerce.number().min(0).nullable().optional(),
  promo_video_url: z
    .union([z.string().url("Enter a valid URL"), z.literal(""), z.null()])
    .optional(),
});

const StudioGrades = () => {
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const { data, isLoading } = useAdminStudioGrades(selectedAcademicYearId);
  const updateGrade = useUpdateStudioGrade();
  const updatePrice = useUpdateStudioGradePrice();
  const uploadMedia = useUploadStudioGradeMedia();
  const setHeroMedia = useSetHeroStudioMedia();
  const deleteMedia = useDeleteStudioMedia();
  const createBanner = useCreateStudioGradeBanner();
  const updateBanner = useUpdateStudioGradeBanner();
  const deleteBanner = useDeleteStudioGradeBanner();

  const [open, setOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [newBannerText, setNewBannerText] = useState("");
  const [bannerDrafts, setBannerDrafts] = useState<
    Record<string, { text: string; display_order: number }>
  >({});

  const activeAcademicYear = data?.academicYear;
  const grades = useMemo(() => data?.grades ?? [], [data]);

  const gradeDetailQuery = useAdminStudioGradeDetail(editingGradeId);
  const gradeDetail = gradeDetailQuery.data ?? null;

  useEffect(() => {
    if (!gradeDetail) return;
    const drafts: Record<string, { text: string; display_order: number }> = {};
    (gradeDetail.studio_grade_banners ?? []).forEach((banner) => {
      drafts[banner.id] = {
        text: banner.text ?? "",
        display_order: banner.display_order ?? 0,
      };
    });
    setBannerDrafts(drafts);
  }, [gradeDetail]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      short_description: "",
      long_description: "",
      weekly_price: 0,
      deposit_amount_override: 99,
      promo_video_url: "",
    },
  });

  const handleEdit = (slug: string) => {
    const grade = grades.find((item) => item.slug === slug);
    if (!grade) return;
    form.reset({
      short_description: grade.short_description ?? "",
      long_description: grade.long_description ?? "",
      weekly_price: grade.price?.weekly_price ?? 0,
      deposit_amount_override: grade.price?.deposit_amount_override ?? 99,
      promo_video_url: grade.promo_video_url ?? "",
    });
    setEditingSlug(slug);
    setEditingGradeId(grade.id);
    setActiveTab("overview");
    setOpen(true);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!editingSlug) return;
    const grade = grades.find((item) => item.slug === editingSlug);
    if (!grade) return;

    try {
      await updateGrade.mutateAsync({
        id: grade.id,
        short_description: values.short_description,
        long_description: values.long_description,
        promo_video_url:
          values.promo_video_url && values.promo_video_url.length
            ? values.promo_video_url
            : null,
      });

      if (activeAcademicYear) {
        await updatePrice.mutateAsync({
          id: grade.price?.id,
          academic_year_id: activeAcademicYear.id,
          studio_grade_id: grade.id,
          weekly_price: values.weekly_price,
          deposit_amount_override: values.deposit_amount_override ?? null,
        });
      }
      toast({ title: "Studio grade updated" });
      setOpen(false);
      setEditingSlug(null);
      setEditingGradeId(null);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to update studio grade",
        description: "Please check values and try again.",
      });
    }
  });

  return (
    <AdminLayout
      pageTitle="Studio Grades"
      subtitle="Manage grade descriptions, media, and pricing for the selected academic year."
    >
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Select academic year to view and edit pricing
          </p>
        </div>
        <AcademicYearSelector
          value={selectedAcademicYearId}
          onValueChange={setSelectedAcademicYearId}
          className="w-full sm:w-64"
        />
      </div>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Grade catalogue
          </CardTitle>
          <CardDescription>
            Edit copy and weekly price for each grade. Pricing changes apply to the active academic year ({activeAcademicYear?.name ?? "n/a"}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            grades.map((grade) => (
              <div
                key={grade.id}
                className="rounded-2xl border border-border/60 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Display order {grade.display_order ?? "—"}
                  </p>
                  <h3 className="text-xl font-display font-bold uppercase tracking-wide">
                    {grade.name}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-2xl">
                    {grade.short_description}
                  </p>
                  <p className="text-sm font-semibold text-primary">
                    £{grade.price?.weekly_price?.toLocaleString("en-GB") ?? "—"} PP/PW
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-md uppercase tracking-wide gap-2"
                    onClick={() => handleEdit(grade.slug)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditingSlug(null);
            setEditingGradeId(null);
            setActiveTab("overview");
            setBannerDrafts({});
            setNewBannerText("");
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              Update studio grade
            </DialogTitle>
          </DialogHeader>

          {gradeDetailQuery.isLoading && !gradeDetail ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <TabsList className="grid grid-cols-3 rounded-md bg-muted">
                <TabsTrigger value="overview" className="rounded-md uppercase text-xs tracking-[0.3em]">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="media" className="rounded-md uppercase text-xs tracking-[0.3em]">
                  Media
                </TabsTrigger>
                <TabsTrigger value="banner" className="rounded-md uppercase text-xs tracking-[0.3em]">
                  Payment Banner
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                <Form {...form}>
                  <form className="space-y-4" onSubmit={handleSubmit}>
                    <FormField
                      control={form.control}
                      name="short_description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Short description</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="A concise highlight for the listing card"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="long_description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Long description</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={5}
                              placeholder="Expanded copy used for the studio overview section."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="promo_video_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Promo video URL</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://youtube.com/..."
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="weekly_price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weekly price (£)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="deposit_amount_override"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Deposit override (£)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
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
                        disabled={updateGrade.isLoading || updatePrice.isLoading}
                      >
                        {(updateGrade.isLoading || updatePrice.isLoading) ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="media" className="mt-6 space-y-6">
                {/* Minimum 6 images warning */}
                {gradeDetail && gradeDetail.studio_grade_media.length < 6 && (
                  <Alert className="border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-700 text-sm">
                      Minimum 6 images required. Currently have {gradeDetail.studio_grade_media.length} image{gradeDetail.studio_grade_media.length !== 1 ? 's' : ''}.
                    </AlertDescription>
                  </Alert>
                )}

                <TooltipProvider>
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                    {(gradeDetail?.studio_grade_media ?? []).map((media) => (
                      <div
                        key={media.id}
                        className="rounded-2xl border border-border/60 overflow-hidden bg-muted/40 group relative"
                      >
                        <div className="aspect-video bg-muted overflow-hidden relative">
                          <img
                            src={media.url}
                            alt={media.title ?? "Studio media"}
                            className="h-full w-full object-cover"
                          />
                          {/* Hover overlay with action buttons */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            {media.is_hero ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-primary text-primary-foreground text-xs pointer-events-none">
                                    <Star className="h-3 w-3 mr-1" />
                                    Hero
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>This is the hero image</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="rounded-md h-8 w-8 p-0"
                                    disabled={setHeroMedia.isLoading}
                                    onClick={() => {
                                      if (!gradeDetail) return;
                                      setHeroMedia.mutate({
                                        mediaId: media.id,
                                        gradeId: gradeDetail.id,
                                      });
                                    }}
                                  >
                                    <Star className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Set as hero image</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="rounded-md h-8 w-8 p-0"
                                  disabled={deleteMedia.isLoading}
                                  onClick={() => {
                                    if (!gradeDetail) return;
                                    deleteMedia.mutate({
                                      mediaId: media.id,
                                      gradeId: gradeDetail.id,
                                      url: media.url,
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete image</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TooltipProvider>

                <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Upload gallery imagery (JPG or PNG, max 5MB per file). Minimum 6 images required. The first image
                    becomes your hero unless you set another.
                  </p>
                  <div className="flex justify-center">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (event) => {
                          const files = Array.from(event.target.files || []);
                          if (!files.length || !gradeDetail || !editingSlug) return;
                          
                          // Upload files sequentially to avoid position conflicts
                          for (const file of files) {
                            try {
                              await uploadMedia.mutateAsync({
                                gradeId: gradeDetail.id,
                                gradeSlug: editingSlug,
                                file,
                              });
                            } catch (error) {
                              console.error("Failed to upload file:", file.name, error);
                              toast({
                                variant: "destructive",
                                title: "Upload failed",
                                description: `Failed to upload ${file.name}. Please try again.`,
                              });
                            }
                          }
                          
                          event.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-md uppercase tracking-wide gap-2"
                        asChild
                      >
                        <span>
                          <Upload className="h-4 w-4" />
                          Select Images
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="banner" className="mt-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <Input
                    placeholder="Add payment banner text"
                    value={newBannerText}
                    onChange={(event) => setNewBannerText(event.target.value)}
                  />
                  <Button
                    className="rounded-md uppercase tracking-wide"
                    disabled={!newBannerText.trim() || !gradeDetail || createBanner.isLoading}
                    onClick={() => {
                      if (!gradeDetail || !newBannerText.trim()) return;
                      createBanner.mutate(
                        { gradeId: gradeDetail.id, text: newBannerText.trim() },
                        {
                          onSuccess: () => {
                            setNewBannerText("");
                            toast({ title: "Banner added" });
                          },
                          onError: (error) => {
                            console.error(error);
                            toast({
                              variant: "destructive",
                              title: "Unable to add banner message",
                            });
                          },
                        },
                      );
                    }}
                  >
                    Add message
                  </Button>
                </div>

                <div className="space-y-4">
                  {(gradeDetail?.studio_grade_banners ?? []).map((banner) => {
                    const draft = bannerDrafts[banner.id] ?? {
                      text: banner.text ?? "",
                      display_order: banner.display_order ?? 0,
                    };
                    return (
                      <div
                        key={banner.id}
                        className="rounded-2xl border border-border/60 p-4 space-y-4"
                      >
                        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                          <Input
                            value={draft.text}
                            onChange={(event) =>
                              setBannerDrafts((prev) => ({
                                ...prev,
                                [banner.id]: {
                                  ...prev[banner.id],
                                  text: event.target.value,
                                  display_order: draft.display_order,
                                },
                              }))
                            }
                            placeholder="Banner text"
                          />
                          <Input
                            type="number"
                            className="w-24"
                            value={draft.display_order}
                            onChange={(event) =>
                              setBannerDrafts((prev) => ({
                                ...prev,
                                [banner.id]: {
                                  ...prev[banner.id],
                                  text: draft.text,
                                  display_order: Number(event.target.value),
                                },
                              }))
                            }
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-md uppercase tracking-wide"
                              disabled={updateBanner.isLoading}
                              onClick={() => {
                                if (!gradeDetail) return;
                                updateBanner.mutate(
                                  {
                                    id: banner.id,
                                    gradeId: gradeDetail.id,
                                    text: draft.text.trim(),
                                    display_order: draft.display_order,
                                  },
                                  {
                                    onSuccess: () => toast({ title: "Banner updated" }),
                                    onError: (error) => {
                                      console.error(error);
                                      toast({
                                        variant: "destructive",
                                        title: "Unable to update banner",
                                      });
                                    },
                                  },
                                );
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-md uppercase tracking-wide text-destructive"
                              disabled={deleteBanner.isLoading}
                              onClick={() => {
                                if (!gradeDetail) return;
                                deleteBanner.mutate(
                                  { id: banner.id, gradeId: gradeDetail.id },
                                  {
                                    onSuccess: () => toast({ title: "Banner removed" }),
                                    onError: (error) => {
                                      console.error(error);
                                      toast({
                                        variant: "destructive",
                                        title: "Unable to remove banner",
                                      });
                                    },
                                  },
                                );
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!gradeDetail?.studio_grade_banners?.length && (
                    <p className="text-sm text-muted-foreground">
                      No banner messages yet. Add one above to start the payment ticker.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default StudioGrades;

