import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/utils/auditLog";

interface UploadDocumentParams {
  file: File;
  applicationId: string;
  documentType: string;
  uploadedBy: string; // User ID who is uploading
  notes?: string;
}

export const useDocumentUpload = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ file, applicationId, documentType, uploadedBy, notes }: UploadDocumentParams) => {
      // Get user info to determine storage path
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Get application to find student_id for storage path
      const { data: application } = await supabase
        .from("student_applications")
        .select("student_id")
        .eq("id", applicationId)
        .single();

      if (!application) throw new Error("Application not found");

      // Use student_id for storage path (even if admin is uploading)
      const userId = application.student_id;
      const path = `${userId}/${applicationId}/${documentType}-${crypto.randomUUID()}-${file.name}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create document record
      const { data: document, error: docError } = await supabase
        .from("student_documents")
        .insert({
          application_id: applicationId,
          document_type: documentType,
          storage_path: path,
          original_filename: file.name,
          mime_type: file.type,
          status: "pending",
          uploaded_by: uploadedBy,
          notes: notes || null,
        })
        .select()
        .single();

      if (docError) throw docError;

      // Log activity
      await logActivity({
        action: "create",
        entityType: "document",
        entityId: document.id,
        payload: {
          application_id: applicationId,
          document_type: documentType,
          uploaded_by: uploadedBy,
          is_reupload: true, // Flag to indicate this is a re-upload
        },
      });

      // Check if this is a student upload (not admin) - if so, notify admins
      const { data: uploaderProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uploadedBy)
        .single();

      const isStudentUpload = uploaderProfile?.role === "student";

      if (isStudentUpload) {
        // Notify staff/admins that a new document is pending review
        try {
          // Get all staff users
          const { data: staffUsers } = await supabase
            .from("profiles")
            .select("id")
            .in("role", ["staff", "superadmin"]);

          if (staffUsers && staffUsers.length > 0) {
            // Create notifications for all staff
            const notifications = staffUsers.map((staff) => ({
              user_id: staff.id,
              title: "New Document Uploaded",
              message: `A new ${documentType.replace(/_/g, " ")} document has been uploaded for application review.`,
              type: "info" as const,
              link: `/admin/applications/${applicationId}`,
              is_read: false,
            }));

            // Insert notifications in batch
            const { error: notifError } = await supabase
              .from("notifications")
              .insert(notifications);

            if (notifError) {
              console.error("Error creating notifications:", notifError);
            }
          }
        } catch (notifError) {
          console.error("Error notifying staff of document upload:", notifError);
          // Don't fail the upload if notification fails
        }
      }

      return document;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["student-documents", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["application-documents", variables.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", variables.applicationId] });
      
      toast({
        title: "Document uploaded",
        description: "Your document has been uploaded and is pending review.",
      });
    },
    onError: (error) => {
      console.error("Document upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    },
  });
};

