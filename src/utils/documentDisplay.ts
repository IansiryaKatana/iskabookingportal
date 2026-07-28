/** Display helpers for student_documents rows. */

export function formatDocumentTypeTitle(documentType: string): string {
  if (documentType === "additional") return "Additional document";
  return documentType.replace(/_/g, " ");
}

export function formatDocumentDisplayName(doc: {
  document_type: string;
  notes?: string | null;
  original_filename?: string | null;
  status?: string | null;
}): string {
  if (doc.document_type !== "additional") {
    return formatDocumentTypeTitle(doc.document_type);
  }

  // For additional docs, notes hold the staff/student label until rejection
  // overwrites notes with a rejection reason.
  if (doc.status !== "rejected" && doc.notes?.trim()) {
    return doc.notes.trim();
  }

  return doc.original_filename?.trim() || "Additional document";
}
