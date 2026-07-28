import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Eye, Mail, Pencil, Plus, Send, Trash2, Upload, Users } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
  useCreateAndSendMarketingCampaign,
  useBulkSaveMarketingContacts,
  useCreateMarketingTemplate,
  useDeleteMarketingCampaign,
  useDeleteMarketingTemplate,
  useDeleteMarketingContact,
  useBulkDeleteMarketingCampaigns,
  useBulkDeleteMarketingContacts,
  useBulkDeleteMarketingTemplates,
  useBulkUpdateMarketingContactsSubscription,
  useBulkUpdateMarketingTemplatesActive,
  useMarketingCampaigns,
  useMarketingContacts,
  useMarketingTemplates,
  useSendTestMarketingEmail,
  useUpdateMarketingTemplate,
  useUpdateMarketingContact,
} from "@/hooks/useMarketingCampaigns";

const splitEmails = (input: string) =>
  input
    .split(/[\n,;\t ]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const extractEmailsFromFileContent = (content: string) => {
  const candidates = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return Array.from(new Set(candidates.map((email) => email.trim().toLowerCase())));
};

const splitCsvLine = (line: string) =>
  line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/g)
    .map((part) => part.trim().replace(/^"|"$/g));

const parseTagsValue = (value: string) =>
  value
    .split(/[|,;]/g)
    .map((tag) => tag.trim())
    .filter(Boolean);

const normalizeSource = (value?: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, "_");
const hasEmbeddedDataImages = (html: string) => /<img[^>]+src=["']data:image\//i.test(html);
const CONTACTS_PAGE_SIZE = 15;
const isTemplateInUseDeleteError = (error: any) =>
  error?.code === "23503" &&
  typeof error?.details === "string" &&
  error.details.toLowerCase().includes("marketing_campaigns");

const parseContactsFromText = (content: string, defaultSource: string) => {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLineCols = splitCsvLine(lines[0]).map((col) => col.toLowerCase());
  const hasHeader = firstLineCols.includes("email");
  const startIndex = hasHeader ? 1 : 0;

  const getColumnIndex = (name: string) => firstLineCols.indexOf(name);

  return lines
    .slice(startIndex)
    .map((line) => {
      const cols = splitCsvLine(line);
      const email = (hasHeader ? cols[getColumnIndex("email")] : cols[0])?.toLowerCase().trim() || "";
      const full_name = (hasHeader ? cols[getColumnIndex("full_name")] : cols[1])?.trim() || null;
      const rowSource = (hasHeader ? cols[getColumnIndex("source")] : "")?.trim();
      const tagsRaw = (hasHeader ? cols[getColumnIndex("tags")] : cols[2]) || "";
      const isSubscribedRaw = (hasHeader ? cols[getColumnIndex("is_subscribed")] : cols[3]) || "";
      const tags = parseTagsValue(tagsRaw);
      const is_subscribed = !["false", "0", "no"].includes(isSubscribedRaw.toLowerCase().trim());

      return {
        email,
        full_name,
        source: normalizeSource(rowSource || defaultSource),
        tags,
        is_subscribed,
      };
    })
    .filter((contact) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email));
};

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    [{ align: [] }],
    ["link", "image"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "list",
  "bullet",
  "indent",
  "align",
  "link",
  "image",
];

const MarketingCampaigns = () => {
  const { toast } = useToast();
  const { data: templates = [] } = useMarketingTemplates();
  const { data: campaigns = [], isLoading } = useMarketingCampaigns();
  const { data: contacts = [], isLoading: isContactsLoading } = useMarketingContacts();
  const createTemplate = useCreateMarketingTemplate();
  const updateTemplate = useUpdateMarketingTemplate();
  const deleteTemplate = useDeleteMarketingTemplate();
  const deleteCampaign = useDeleteMarketingCampaign();
  const deleteContact = useDeleteMarketingContact();
  const bulkDeleteCampaigns = useBulkDeleteMarketingCampaigns();
  const bulkDeleteContacts = useBulkDeleteMarketingContacts();
  const bulkDeleteTemplates = useBulkDeleteMarketingTemplates();
  const bulkUpdateContactsSubscription = useBulkUpdateMarketingContactsSubscription();
  const bulkUpdateTemplatesActive = useBulkUpdateMarketingTemplatesActive();
  const createCampaign = useCreateAndSendMarketingCampaign();
  const bulkSaveContacts = useBulkSaveMarketingContacts();
  const updateContact = useUpdateMarketingContact();
  const sendTestEmail = useSendTestMarketingEmail();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [contactsDialogOpen, setContactsDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [testEmails, setTestEmails] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    body_html: "<p>Hello {full_name},</p><p>{company_name} has an update for you.</p>",
    body_text: "Hello {full_name},\n\n{company_name} has an update for you.",
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    template_id: "",
    audienceType: "source" as "source" | "tag" | "test" | "custom",
    source: "",
    tag: "",
    emails: "",
  });
  const [contactsUploadForm, setContactsUploadForm] = useState({
    source: "manual_upload",
    content: "",
    testEmails: "",
  });
  const [singleContactForm, setSingleContactForm] = useState({
    id: "",
    email: "",
    full_name: "",
    source: "manual_upload",
    is_subscribed: true,
  });
  const [uploadingTemplateImage, setUploadingTemplateImage] = useState(false);
  const templateImageInputRef = useRef<HTMLInputElement | null>(null);
  const quillRef = useRef<ReactQuill | null>(null);
  const [lastUploadedTemplateImageUrl, setLastUploadedTemplateImageUrl] = useState("");
  const [clickableImageForm, setClickableImageForm] = useState({
    imageUrl: "",
    targetUrl: "",
    altText: "Marketing image",
  });
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [contactsPage, setContactsPage] = useState(1);

  const parsedEmails = useMemo(() => splitEmails(campaignForm.emails), [campaignForm.emails]);
  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          contacts
            .map((contact) => normalizeSource(contact.source))
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [contacts],
  );
  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set(
          contacts.flatMap((contact) => (Array.isArray(contact.tags) ? contact.tags : [])).filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [contacts],
  );
  const audienceEmails = useMemo(() => {
    const subscribedContacts = contacts.filter((contact) => contact.is_subscribed);
    if (campaignForm.audienceType === "source") {
      if (!campaignForm.source) return [];
      return subscribedContacts
        .filter((contact) => normalizeSource(contact.source) === normalizeSource(campaignForm.source))
        .map((contact) => contact.email.toLowerCase());
    }
    if (campaignForm.audienceType === "tag") {
      if (!campaignForm.tag) return [];
      return subscribedContacts
        .filter((contact) => (contact.tags ?? []).includes(campaignForm.tag))
        .map((contact) => contact.email.toLowerCase());
    }
    if (campaignForm.audienceType === "test") {
      return subscribedContacts
        .filter((contact) => {
          const source = normalizeSource(contact.source);
          return source === "test_email" || source === "test";
        })
        .map((contact) => contact.email.toLowerCase());
    }
    return parsedEmails;
  }, [campaignForm.audienceType, campaignForm.source, campaignForm.tag, contacts, parsedEmails]);
  const validEmailCount = useMemo(
    () => audienceEmails.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).length,
    [audienceEmails],
  );
  const totalContactsPages = useMemo(
    () => Math.max(1, Math.ceil(contacts.length / CONTACTS_PAGE_SIZE)),
    [contacts.length],
  );
  const paginatedContacts = useMemo(() => {
    const start = (contactsPage - 1) * CONTACTS_PAGE_SIZE;
    return contacts.slice(start, start + CONTACTS_PAGE_SIZE);
  }, [contacts, contactsPage]);
  const currentPageContactIds = useMemo(
    () => paginatedContacts.map((contact) => contact.id),
    [paginatedContacts],
  );
  const areAllCurrentPageContactsSelected = useMemo(
    () =>
      currentPageContactIds.length > 0 &&
      currentPageContactIds.every((id) => selectedContactIds.includes(id)),
    [currentPageContactIds, selectedContactIds],
  );
  const areAllContactsSelected = useMemo(
    () => contacts.length > 0 && contacts.every((contact) => selectedContactIds.includes(contact.id)),
    [contacts, selectedContactIds],
  );
  const previewTemplate = useMemo(
    () => templates.find((template) => template.id === previewTemplateId) || null,
    [templates, previewTemplateId],
  );

  useEffect(() => {
    if (contactsPage > totalContactsPages) {
      setContactsPage(totalContactsPages);
    }
  }, [contactsPage, totalContactsPages]);

  // Prefill the test-send box with the logged-in staff/admin's own email
  useEffect(() => {
    if (!previewTemplateId) return;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (email) setTestEmails((current) => current || email);
    });
  }, [previewTemplateId]);

  const handleSendTestEmail = async () => {
    if (!previewTemplate) return;
    const recipients = splitEmails(testEmails);
    if (recipients.length === 0) {
      toast({
        title: "No recipients",
        description: "Enter at least one valid email address to send a test.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await sendTestEmail.mutateAsync({
        template_id: previewTemplate.id,
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

  const openCreateTemplateDialog = () => {
    setEditingTemplateId(null);
    setTemplateForm({
      name: "",
      subject: "",
      body_html: "<p>Hello {full_name},</p><p>{company_name} has an update for you.</p>",
      body_text: "Hello {full_name},\n\n{company_name} has an update for you.",
    });
    setTemplateDialogOpen(true);
  };

  const openEditTemplateDialog = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(templateId);
    setTemplateForm({
      name: template.name,
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text || "",
    });
    setTemplateDialogOpen(true);
  };

  const handleTemplateSubmit = async () => {
    if (!templateForm.name || !templateForm.subject || !templateForm.body_html) {
      toast({ title: "Missing fields", description: "Template name, subject and HTML body are required.", variant: "destructive" });
      return;
    }

    if (hasEmbeddedDataImages(templateForm.body_html)) {
      toast({
        title: "Embedded image detected",
        description: "Email clients often block data URI images. Use publicly hosted image URLs instead.",
        variant: "destructive",
      });
      return;
    }

    if (editingTemplateId) {
      await updateTemplate.mutateAsync({ id: editingTemplateId, ...templateForm });
      toast({ title: "Template updated", description: "Marketing template updated successfully." });
    } else {
      await createTemplate.mutateAsync(templateForm);
      toast({ title: "Template created", description: "Marketing template is ready for campaigns." });
    }
    setTemplateDialogOpen(false);
    setEditingTemplateId(null);
    setTemplateForm({
      name: "",
      subject: "",
      body_html: "<p>Hello {full_name},</p><p>{company_name} has an update for you.</p>",
      body_text: "Hello {full_name},\n\n{company_name} has an update for you.",
    });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Delete this marketing template?")) return;
    try {
      await deleteTemplate.mutateAsync(templateId);
      toast({ title: "Template deleted", description: "Marketing template has been removed." });
    } catch (error: any) {
      if (isTemplateInUseDeleteError(error)) {
        toast({
          title: "Template in use",
          description: "This template is linked to existing campaigns and cannot be deleted. Deactivate it instead.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Delete failed",
        description: error?.message || "Could not delete template.",
        variant: "destructive",
      });
    }
  };

  const getCampaignStatusBadgeClass = (status: string) => {
    if (status === "completed") return "bg-green-600 text-white border-green-600";
    if (status === "failed") return "bg-red-600 text-white border-red-600";
    if (status === "sending") return "bg-blue-600 text-white border-blue-600";
    return "text-foreground";
  };

  const toggleSelection = (
    id: string,
    selected: string[],
    setSelected: (value: string[]) => void,
  ) => {
    setSelected(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );
  };

  const handleTemplateImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    setUploadingTemplateImage(true);
    try {
      const extension = file.name.split(".").pop() || "png";
      const fileName = `marketing/templates/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("branding").getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;
      setLastUploadedTemplateImageUrl(publicUrl);
      setClickableImageForm((prev) => ({ ...prev, imageUrl: publicUrl }));

      const quillEditor = quillRef.current?.getEditor();
      if (quillEditor) {
        const range = quillEditor.getSelection(true);
        const index = range?.index ?? quillEditor.getLength();
        quillEditor.insertEmbed(index, "image", publicUrl, "user");
        quillEditor.setSelection(index + 1);
      } else {
        setTemplateForm((prev) => ({
          ...prev,
          body_html: `${prev.body_html}<p><img src="${publicUrl}" alt="Marketing image" /></p>`,
        }));
      }

      toast({
        title: "Image uploaded",
        description: "Image uploaded to storage and inserted into template. You can now make it clickable.",
      });
    } catch (error: any) {
      toast({
        title: "Image upload failed",
        description: error?.message || "Could not upload image. Ensure branding bucket is writable and public.",
        variant: "destructive",
      });
    } finally {
      setUploadingTemplateImage(false);
      if (templateImageInputRef.current) templateImageInputRef.current.value = "";
    }
  };

  const insertClickableImage = () => {
    const imageUrl = clickableImageForm.imageUrl.trim();
    const targetUrl = clickableImageForm.targetUrl.trim();
    const altText = clickableImageForm.altText.trim() || "Marketing image";

    if (!/^https?:\/\//i.test(imageUrl)) {
      toast({
        title: "Invalid image URL",
        description: "Please provide a valid absolute image URL starting with http:// or https://.",
        variant: "destructive",
      });
      return;
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      toast({
        title: "Invalid destination URL",
        description: "Please provide a valid absolute destination URL starting with http:// or https://.",
        variant: "destructive",
      });
      return;
    }

    const quillEditor = quillRef.current?.getEditor();
    if (quillEditor) {
      const range = quillEditor.getSelection(true);
      const index = range?.index ?? quillEditor.getLength();
      // Use Quill-native ops so link metadata is preserved reliably in output HTML.
      quillEditor.insertEmbed(index, "image", imageUrl, "user");
      quillEditor.formatText(index, 1, "link", targetUrl, "user");
      quillEditor.setSelection(index + 1, 0, "silent");
    } else {
      const clickableHtml = `<a href="${targetUrl}" target="_blank" rel="noopener noreferrer"><img src="${imageUrl}" alt="${altText.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border:0;" /></a>`;
      setTemplateForm((prev) => ({
        ...prev,
        body_html: `${prev.body_html}<p>${clickableHtml}</p>`,
      }));
    }

    toast({
      title: "Clickable image inserted",
      description: "The image now links to your destination URL.",
    });
  };

  const handleFileUpload = async (file: File) => {
    const content = await file.text();
    const extractedEmails = extractEmailsFromFileContent(content);
    if (extractedEmails.length === 0) {
      toast({
        title: "No emails detected",
        description: "No valid emails were found in the selected file.",
        variant: "destructive",
      });
      return;
    }

    setCampaignForm((prev) => ({
      ...prev,
      emails: [prev.emails, ...extractedEmails].filter(Boolean).join("\n"),
      audienceType: "custom",
    }));
    toast({
      title: "File imported",
      description: `${extractedEmails.length} emails added from ${file.name}.`,
    });
  };

  const downloadCsvTemplate = () => {
    const csv = [
      "email,full_name,source,tags",
      "lead1@example.com,John Doe,marketing_department,\"new_lead|spring_campaign\"",
      "lead2@example.com,Jane Smith,trade_fair,\"priority|london\"",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "marketing-contacts-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCampaignSubmit = async () => {
    if (!campaignForm.name || !campaignForm.template_id) {
      toast({ title: "Missing fields", description: "Campaign name and template are required.", variant: "destructive" });
      return;
    }
    if (validEmailCount === 0) {
      toast({ title: "No emails found", description: "Upload or paste at least one valid email.", variant: "destructive" });
      return;
    }

    await createCampaign.mutateAsync({
      name: campaignForm.name,
      template_id: campaignForm.template_id,
      emails: audienceEmails,
    });

    toast({
      title: "Campaign sent",
      description: "Marketing campaign has been queued and processed with Resend.",
    });
    setCampaignDialogOpen(false);
    setCampaignForm({
      name: "",
      template_id: "",
      audienceType: "source",
      source: "",
      tag: "",
      emails: "",
    });
  };

  const handleContactsFileUpload = async (file: File) => {
    const content = await file.text();
    setContactsUploadForm((prev) => ({ ...prev, content: [prev.content, content].filter(Boolean).join("\n") }));
  };

  const handleSaveUploadedContacts = async () => {
    const parsed = parseContactsFromText(contactsUploadForm.content, contactsUploadForm.source);
    if (parsed.length === 0) {
      toast({ title: "No contacts found", description: "Add at least one valid email to save contacts.", variant: "destructive" });
      return;
    }
    const result = await bulkSaveContacts.mutateAsync(parsed);
    toast({ title: "Contacts saved", description: `${result.inserted} inserted, ${result.updated} updated.` });
    setContactsUploadForm((prev) => ({ ...prev, content: "" }));
  };

  const handleSaveTestEmails = async () => {
    const parsed = extractEmailsFromFileContent(contactsUploadForm.testEmails).map((email) => ({
      email,
      source: "test_email",
      tags: ["test"],
      is_subscribed: true,
    }));
    if (parsed.length === 0) {
      toast({ title: "No test emails found", description: "Add valid test emails first.", variant: "destructive" });
      return;
    }
    const result = await bulkSaveContacts.mutateAsync(parsed);
    toast({ title: "Test emails saved", description: `${result.inserted} inserted, ${result.updated} updated.` });
  };

  const openEditContact = (contact: (typeof contacts)[number]) => {
    setSingleContactForm({
      id: contact.id,
      email: contact.email,
      full_name: contact.full_name || "",
      source: contact.source,
      is_subscribed: contact.is_subscribed,
    });
    setContactsDialogOpen(true);
  };

  const handleSaveSingleContact = async () => {
    if (!singleContactForm.email) {
      toast({ title: "Email required", description: "Provide an email address.", variant: "destructive" });
      return;
    }

    if (singleContactForm.id) {
      await updateContact.mutateAsync({
        id: singleContactForm.id,
        email: singleContactForm.email,
        full_name: singleContactForm.full_name || null,
        source: singleContactForm.source,
        is_subscribed: singleContactForm.is_subscribed,
      });
      toast({ title: "Contact updated", description: "Contact details were saved." });
      return;
    }

    const result = await bulkSaveContacts.mutateAsync([{
      email: singleContactForm.email,
      full_name: singleContactForm.full_name || null,
      source: singleContactForm.source,
      is_subscribed: singleContactForm.is_subscribed,
    }]);
    toast({ title: "Contact saved", description: `${result.inserted} inserted, ${result.updated} updated.` });
    setSingleContactForm({
      id: "",
      email: "",
      full_name: "",
      source: "manual_upload",
      is_subscribed: true,
    });
  };

  return (
    <AdminLayout
      pageTitle="Marketing Campaigns"
      subtitle="Upload lead lists and send template-based campaigns"
      mobileActionButton={
        <Button onClick={() => setCampaignDialogOpen(true)} size="sm" className="rounded-md h-9 w-9 p-0">
          <Plus className="h-4 w-4" />
        </Button>
      }
      pageToolbar={
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-md h-10 w-10 p-0" onClick={downloadCsvTemplate} aria-label="Download CSV template">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="rounded-md uppercase tracking-wide gap-2" onClick={openCreateTemplateDialog}>
            <Mail className="h-4 w-4" />
            New Template
          </Button>
          <Button className="rounded-md uppercase tracking-wide gap-2" onClick={() => setCampaignDialogOpen(true)}>
            <Send className="h-4 w-4" />
            New Campaign
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-lg font-display uppercase tracking-wide">Total Campaigns</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{campaigns.length}</CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-lg font-display uppercase tracking-wide">Active Templates</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{templates.filter((t) => t.is_active).length}</CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-lg font-display uppercase tracking-wide">Emails Sent</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{campaigns.reduce((sum, campaign) => sum + campaign.emails_sent, 0)}</CardContent>
          </Card>
        </div>

        <div>
          <div>
            <Tabs defaultValue="campaigns" className="w-full">
              <TabsList className="grid w-full grid-cols-3 rounded-md">
                <TabsTrigger
                  value="campaigns"
                  className="rounded-md uppercase tracking-wide data-[state=active]:text-primary"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Recent Campaigns
                </TabsTrigger>
                <TabsTrigger
                  value="contacts"
                  className="rounded-md uppercase tracking-wide data-[state=active]:text-primary"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Uploaded Contacts
                </TabsTrigger>
                <TabsTrigger
                  value="templates"
                  className="rounded-md uppercase tracking-wide data-[state=active]:text-primary"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Templates
                </TabsTrigger>
              </TabsList>
              <TabsContent value="campaigns" className="mt-4">
                {selectedCampaignIds.length > 0 && (
                  <div className="rounded-xl border p-3 mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedCampaignIds.length} selected</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={async () => {
                        await bulkDeleteCampaigns.mutateAsync(selectedCampaignIds);
                        setSelectedCampaignIds([]);
                        toast({ title: "Campaigns deleted", description: "Selected campaigns were removed." });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Bulk Delete
                    </Button>
                  </div>
                )}
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading campaigns...</p>
                ) : campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaigns yet. Create your first campaign.</p>
                ) : (
                  <div className="space-y-3">
                    {campaigns.map((campaign) => (
                      <div key={campaign.id} className="rounded-2xl border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedCampaignIds.includes(campaign.id)}
                            onCheckedChange={() => toggleSelection(campaign.id, selectedCampaignIds, setSelectedCampaignIds)}
                          />
                          <div>
                            <p className="font-semibold">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Template: {campaign.marketing_email_templates?.name || "Unknown"} | Created:{" "}
                              {format(new Date(campaign.created_at), "d MMM yyyy HH:mm")}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Badge variant="outline" className={`uppercase ${getCampaignStatusBadgeClass(campaign.status)}`}>{campaign.status}</Badge>
                          <Badge variant="secondary">Recipients: {campaign.total_recipients}</Badge>
                          <Badge variant="secondary">Sent: {campaign.emails_sent}</Badge>
                          <Badge variant="secondary">Failed: {campaign.failed_count}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-md text-destructive"
                            onClick={async () => {
                              await deleteCampaign.mutateAsync(campaign.id);
                              toast({ title: "Campaign deleted", description: "Campaign has been removed." });
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="contacts" className="mt-4">
                <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        if (areAllCurrentPageContactsSelected) {
                          setSelectedContactIds((prev) =>
                            prev.filter((id) => !currentPageContactIds.includes(id)),
                          );
                        } else {
                          setSelectedContactIds((prev) =>
                            Array.from(new Set([...prev, ...currentPageContactIds])),
                          );
                        }
                      }}
                    >
                      {areAllCurrentPageContactsSelected ? "Unselect Page" : "Select Page"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        if (areAllContactsSelected) {
                          setSelectedContactIds([]);
                        } else {
                          setSelectedContactIds(contacts.map((contact) => contact.id));
                        }
                      }}
                    >
                      {areAllContactsSelected ? "Clear All" : "Select All"}
                    </Button>
                  </div>
                  <Button size="sm" className="rounded-md h-9 w-9 p-0" onClick={() => setContactsDialogOpen(true)} aria-label="Manage uploaded contacts">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {selectedContactIds.length > 0 && (
                  <div className="rounded-xl border p-3 mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedContactIds.length} selected</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={async () => {
                        await bulkUpdateContactsSubscription.mutateAsync({
                          contactIds: selectedContactIds,
                          is_subscribed: true,
                        });
                        toast({ title: "Contacts updated", description: "Selected contacts subscribed." });
                      }}
                    >
                      Subscribe
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={async () => {
                        await bulkUpdateContactsSubscription.mutateAsync({
                          contactIds: selectedContactIds,
                          is_subscribed: false,
                        });
                        toast({ title: "Contacts updated", description: "Selected contacts unsubscribed." });
                      }}
                    >
                      Unsubscribe
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md text-destructive"
                      onClick={async () => {
                        await bulkDeleteContacts.mutateAsync(selectedContactIds);
                        setSelectedContactIds([]);
                        toast({ title: "Contacts deleted", description: "Selected contacts removed." });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Bulk Delete
                    </Button>
                  </div>
                )}
                {isContactsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading contacts...</p>
                ) : contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No uploaded contacts yet.</p>
                ) : (
                  <div className="space-y-2">
                    {paginatedContacts.map((contact) => (
                      <div key={contact.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedContactIds.includes(contact.id)}
                            onCheckedChange={() => toggleSelection(contact.id, selectedContactIds, setSelectedContactIds)}
                          />
                          <div>
                            <p className="font-medium">{contact.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {contact.full_name || "No name"} | Source: {contact.source} | Added:{" "}
                              {format(new Date(contact.created_at), "d MMM yyyy HH:mm")}
                            </p>
                            {Array.isArray(contact.tags) && contact.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {contact.tags.slice(0, 5).map((tag) => (
                                  <Badge key={`${contact.id}-${tag}`} variant="outline" className="text-[10px]">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={contact.is_subscribed ? "secondary" : "outline"}>
                            {contact.is_subscribed ? "Subscribed" : "Unsubscribed"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-md uppercase tracking-wide"
                            onClick={() => openEditContact(contact)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-md text-destructive"
                            onClick={async () => {
                              await deleteContact.mutateAsync(contact.id);
                              toast({ title: "Contact deleted", description: "Contact removed." });
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {contacts.length > CONTACTS_PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Page {contactsPage} of {totalContactsPages} ({contacts.length} contacts)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        disabled={contactsPage <= 1}
                        onClick={() => setContactsPage((prev) => Math.max(1, prev - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        disabled={contactsPage >= totalContactsPages}
                        onClick={() => setContactsPage((prev) => Math.min(totalContactsPages, prev + 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="templates" className="mt-4">
                <div className="flex justify-end mb-3">
                  <Button size="sm" className="rounded-md h-9 w-9 p-0" onClick={openCreateTemplateDialog} aria-label="Create marketing template">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {selectedTemplateIds.length > 0 && (
                  <div className="rounded-xl border p-3 mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{selectedTemplateIds.length} selected</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={async () => {
                        await bulkUpdateTemplatesActive.mutateAsync({
                          templateIds: selectedTemplateIds,
                          is_active: true,
                        });
                        toast({ title: "Templates updated", description: "Selected templates activated." });
                      }}
                    >
                      Activate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={async () => {
                        await bulkUpdateTemplatesActive.mutateAsync({
                          templateIds: selectedTemplateIds,
                          is_active: false,
                        });
                        toast({ title: "Templates updated", description: "Selected templates deactivated." });
                      }}
                    >
                      Deactivate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md text-destructive"
                      onClick={async () => {
                        try {
                          await bulkDeleteTemplates.mutateAsync(selectedTemplateIds);
                          setSelectedTemplateIds([]);
                          toast({ title: "Templates deleted", description: "Selected templates removed." });
                        } catch (error: any) {
                          if (isTemplateInUseDeleteError(error)) {
                            toast({
                              title: "Some templates are in use",
                              description: "One or more selected templates are linked to campaigns. Deactivate them instead.",
                              variant: "destructive",
                            });
                            return;
                          }
                          toast({
                            title: "Bulk delete failed",
                            description: error?.message || "Could not delete selected templates.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Bulk Delete
                    </Button>
                  </div>
                )}
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No templates yet.</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div key={template.id} className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedTemplateIds.includes(template.id)}
                            onCheckedChange={() => toggleSelection(template.id, selectedTemplateIds, setSelectedTemplateIds)}
                          />
                          <div>
                            <p className="font-medium">{template.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Subject: {template.subject} | Created: {format(new Date(template.created_at), "d MMM yyyy HH:mm")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={template.is_active ? "secondary" : "outline"}>
                            {template.is_active ? "Active" : "Inactive"}
                          </Badge>
                          <Button variant="outline" size="sm" className="rounded-md" onClick={() => setPreviewTemplateId(template.id)}>
                            <Eye className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-md" onClick={() => openEditTemplateDialog(template.id)}>
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-md text-destructive" onClick={() => void handleDeleteTemplate(template.id)}>
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Sheet open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto scrollbar-hide">
          <SheetHeader>
            <SheetTitle className="font-display uppercase tracking-wide">
              {editingTemplateId ? "Edit Marketing Template" : "Create Marketing Template"}
            </SheetTitle>
            <SheetDescription>Use variables like {"{full_name}"}, {"{email}"}, {"{company_name}"} and {"{campaign_name}"}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Template Name</Label>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={templateForm.subject} onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))} />
            </div>
            <div>
              <Label>Body HTML</Label>
              <div className="flex items-center justify-end mt-2 mb-2">
                <input
                  ref={templateImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleTemplateImageUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-md uppercase tracking-wide"
                  onClick={() => templateImageInputRef.current?.click()}
                  disabled={uploadingTemplateImage}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {uploadingTemplateImage ? "Uploading..." : "Upload Image"}
                </Button>
              </div>
              <div className="rounded-2xl border p-3 mb-2 bg-muted/30">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Clickable Image Helper</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder="Image URL (https://...)"
                    value={clickableImageForm.imageUrl}
                    onChange={(e) => setClickableImageForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  />
                  <Input
                    placeholder="Destination URL (https://...)"
                    value={clickableImageForm.targetUrl}
                    onChange={(e) => setClickableImageForm((prev) => ({ ...prev, targetUrl: e.target.value }))}
                  />
                  <Input
                    placeholder="Alt text"
                    value={clickableImageForm.altText}
                    onChange={(e) => setClickableImageForm((prev) => ({ ...prev, altText: e.target.value }))}
                    className="md:col-span-2"
                  />
                </div>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <p className="text-[11px] text-muted-foreground truncate">
                    {lastUploadedTemplateImageUrl ? `Last uploaded image: ${lastUploadedTemplateImageUrl}` : "Upload an image or paste an image URL."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md uppercase tracking-wide"
                    onClick={insertClickableImage}
                  >
                    Insert Clickable Image
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border bg-background mt-2">
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={templateForm.body_html}
                  onChange={(value) => setTemplateForm((prev) => ({ ...prev, body_html: value }))}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Write your marketing email body. You can format text and insert images."
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rich formatting and image embedding are supported.
              </p>
            </div>
            <div>
              <Label>Body Text (optional)</Label>
              <Textarea rows={4} value={templateForm.body_text} onChange={(e) => setTemplateForm((prev) => ({ ...prev, body_text: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)} className="rounded-md uppercase tracking-wide">Cancel</Button>
            <Button onClick={handleTemplateSubmit} disabled={createTemplate.isPending || updateTemplate.isPending} className="rounded-md uppercase tracking-wide">
              {createTemplate.isPending || updateTemplate.isPending ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplateId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display uppercase tracking-wide">{previewTemplate?.name || "Template Preview"}</SheetTitle>
            <SheetDescription>{previewTemplate?.subject || ""}</SheetDescription>
          </SheetHeader>
          {previewTemplate && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">HTML Preview</p>
                <div className="h-[500px] w-full rounded-lg border overflow-hidden bg-white">
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={previewTemplate.body_html}
                    className="w-full h-full bg-white"
                  />
                </div>
              </div>
              {previewTemplate.body_text && (
                <div className="rounded-xl border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Plain Text</p>
                  <pre className="text-xs whitespace-pre-wrap">{previewTemplate.body_text}</pre>
                </div>
              )}
              <div className="rounded-xl border p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Send Test Email</p>
                <p className="text-xs text-muted-foreground">
                  Send a <span className="font-mono">[TEST]</span> copy to staff/admin to check how it renders in a real
                  inbox. Variables are filled with sample data. Separate multiple addresses with commas.
                </p>
                <Textarea
                  value={testEmails}
                  onChange={(e) => setTestEmails(e.target.value)}
                  rows={2}
                  placeholder="admin@company.com, staff@company.com"
                  className="text-sm"
                />
                <Button
                  onClick={handleSendTestEmail}
                  disabled={sendTestEmail.isPending}
                  className="rounded-md uppercase tracking-wide gap-2"
                >
                  <Send className="h-4 w-4" />
                  {sendTestEmail.isPending ? "Sending..." : "Send Test"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}>
        <DialogContent className="sm:max-w-[720px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">Create Marketing Campaign</DialogTitle>
            <DialogDescription>Upload a lead list or paste emails, pick a template, then send with Resend.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Campaign Name</Label>
              <Input value={campaignForm.name} onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <Label>Template</Label>
              <Select value={campaignForm.template_id} onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, template_id: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.filter((template) => template.is_active).map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience Type</Label>
              <Select
                value={campaignForm.audienceType}
                onValueChange={(value) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    audienceType: value as typeof campaignForm.audienceType,
                  }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">Source</SelectItem>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="test">Test Emails</SelectItem>
                  <SelectItem value="custom">Custom Paste List</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {campaignForm.audienceType === "source" && (
              <div>
                <Label>Source</Label>
                <Select
                  value={campaignForm.source}
                  onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, source: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {campaignForm.audienceType === "tag" && (
              <div>
                <Label>Tag</Label>
                <Select
                  value={campaignForm.tag}
                  onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, tag: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {tagOptions.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {campaignForm.audienceType === "custom" && (
              <>
                <div>
                  <Label>Email List</Label>
                  <Textarea
                    rows={8}
                    value={campaignForm.emails}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, emails: e.target.value }))}
                    placeholder="Paste emails separated by commas or new lines"
                  />
                </div>
                <div>
                  <Label htmlFor="campaign-csv">Upload CSV/TXT</Label>
                  <Input
                    id="campaign-csv"
                    type="file"
                    accept=".csv,.txt"
                    className="mt-2"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file);
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    CSV/TXT parser extracts all valid emails from the file.
                  </p>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground mt-1">Detected {validEmailCount} valid email(s).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignDialogOpen(false)} className="rounded-md uppercase tracking-wide">Cancel</Button>
            <Button onClick={handleCampaignSubmit} disabled={createCampaign.isPending} className="rounded-md uppercase tracking-wide">
              <Send className="h-4 w-4 mr-2" />
              {createCampaign.isPending ? "Sending..." : "Send Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contactsDialogOpen} onOpenChange={setContactsDialogOpen}>
        <DialogContent className="sm:max-w-[820px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">Manage Uploaded Contacts</DialogTitle>
            <DialogDescription>Add contacts directly, bulk upload lists, or maintain test email contacts.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-md">
              <TabsTrigger value="upload" className="rounded-md uppercase tracking-wide">Bulk Upload</TabsTrigger>
              <TabsTrigger value="single" className="rounded-md uppercase tracking-wide">Add / Edit</TabsTrigger>
              <TabsTrigger value="test" className="rounded-md uppercase tracking-wide">Test Emails</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div>
                <Label>Default Source</Label>
                <Input
                  value={contactsUploadForm.source}
                  onChange={(e) => setContactsUploadForm((prev) => ({ ...prev, source: e.target.value }))}
                  placeholder="marketing_department"
                />
              </div>
              <div>
                <Label>Contacts CSV/Text</Label>
                <Textarea
                  rows={8}
                  value={contactsUploadForm.content}
                  onChange={(e) => setContactsUploadForm((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="email,full_name,source,tags,is_subscribed&#10;john@example.com,John Doe,marketing_department,&quot;new|hot&quot;,true"
                />
              </div>
              <div>
                <Label>Upload CSV/TXT File</Label>
                <Input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleContactsFileUpload(file);
                  }}
                />
              </div>
              <Button className="rounded-md uppercase tracking-wide" onClick={handleSaveUploadedContacts} disabled={bulkSaveContacts.isPending}>
                {bulkSaveContacts.isPending ? "Saving..." : "Save Contacts"}
              </Button>
            </TabsContent>

            <TabsContent value="single" className="space-y-4 mt-4">
              <div>
                <Label>Email</Label>
                <Input
                  value={singleContactForm.email}
                  onChange={(e) => setSingleContactForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="lead@example.com"
                />
              </div>
              <div>
                <Label>Full Name</Label>
                <Input
                  value={singleContactForm.full_name}
                  onChange={(e) => setSingleContactForm((prev) => ({ ...prev, full_name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Source</Label>
                <Input
                  value={singleContactForm.source}
                  onChange={(e) => setSingleContactForm((prev) => ({ ...prev, source: e.target.value }))}
                />
              </div>
              <div>
                <Label>Subscription</Label>
                <Select
                  value={singleContactForm.is_subscribed ? "subscribed" : "unsubscribed"}
                  onValueChange={(value) => setSingleContactForm((prev) => ({ ...prev, is_subscribed: value === "subscribed" }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscribed">Subscribed</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="rounded-md uppercase tracking-wide" onClick={handleSaveSingleContact} disabled={updateContact.isPending || bulkSaveContacts.isPending}>
                {singleContactForm.id ? "Update Contact" : "Add Contact"}
              </Button>
            </TabsContent>

            <TabsContent value="test" className="space-y-4 mt-4">
              <div>
                <Label>Test Emails</Label>
                <Textarea
                  rows={6}
                  value={contactsUploadForm.testEmails}
                  onChange={(e) => setContactsUploadForm((prev) => ({ ...prev, testEmails: e.target.value }))}
                  placeholder="test1@example.com&#10;test2@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">These are saved in contacts with source `test_email`.</p>
              </div>
              <Button className="rounded-md uppercase tracking-wide" onClick={handleSaveTestEmails} disabled={bulkSaveContacts.isPending}>
                Save Test Emails
              </Button>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactsDialogOpen(false)} className="rounded-md uppercase tracking-wide">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default MarketingCampaigns;
