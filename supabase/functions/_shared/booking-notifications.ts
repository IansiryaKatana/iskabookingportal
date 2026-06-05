import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCredential } from "./get-credential.ts";
import {
  getCompanyName,
  getStaffEmailsByRoles,
  sendStaffAlertEmail,
  type StaffNotifyRole,
} from "./staff-notifications.ts";

export type BookingNotificationEvent =
  | "application_created"
  | "studio_reserved"
  | "deposit_paid"
  | "application_submitted"
  | "manual_payment_request_submitted";

export interface BookingNotificationMetadata {
  amount?: string;
  paymentMethod?: string;
  studioNumber?: string;
  notifyStudent?: boolean;
}

interface ApplicationContext {
  applicationId: string;
  studentId: string | null;
  studentName: string;
  studentEmail: string | null;
  studioNumber: string;
  contractName: string;
  status: string;
  companyName: string;
  portalUrl: string;
}

const STAFF_ROLES_BY_EVENT: Record<BookingNotificationEvent, StaffNotifyRole[]> = {
  application_created: ["reservationist", "accountant"],
  studio_reserved: ["reservationist"],
  deposit_paid: ["reservationist", "accountant"],
  application_submitted: ["reservationist"],
  manual_payment_request_submitted: ["accountant"],
};

async function loadApplicationContext(
  supabase: SupabaseClient,
  applicationId: string,
  metadata?: BookingNotificationMetadata,
): Promise<ApplicationContext | null> {
  const { data: application, error } = await supabase
    .from("student_applications")
    .select(`
      id,
      student_id,
      status,
      contract:contracts!contract_id ( name ),
      assigned_studio:studios!assigned_studio_id ( studio_number )
    `)
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !application) {
    console.error("notifyBookingEvent: application not found", applicationId, error);
    return null;
  }

  const companyName = await getCompanyName(supabase);
  const portalUrl = await getCredential("PORTAL_URL", {
    supabase,
    fallback: Deno.env.get("PORTAL_URL") ?? "",
  });

  let studentName = "Student";
  let studentEmail: string | null = null;

  if (application.student_id) {
    const { data: { user } } = await supabase.auth.admin.getUserById(application.student_id);
    studentEmail = user?.email ?? null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", application.student_id)
      .maybeSingle();

    if (profile?.first_name || profile?.last_name) {
      studentName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    } else {
      const { data: step1 } = await supabase
        .from("student_application_steps")
        .select("payload")
        .eq("application_id", applicationId)
        .eq("step_number", 1)
        .maybeSingle();
      const step1Data = step1?.payload as Record<string, string> | null;
      if (step1Data?.first_name || step1Data?.last_name) {
        studentName = [step1Data.first_name, step1Data.last_name].filter(Boolean).join(" ");
      }
    }
  }

  const contract = application.contract as { name?: string } | null;
  const studio = application.assigned_studio as { studio_number?: string } | null;

  return {
    applicationId,
    studentId: application.student_id,
    studentName,
    studentEmail,
    studioNumber: metadata?.studioNumber ?? studio?.studio_number ?? "TBA",
    contractName: contract?.name ?? "Booking",
    status: application.status ?? "draft",
    companyName,
    portalUrl: portalUrl || "",
  };
}

function buildStaffEmail(
  event: BookingNotificationEvent,
  ctx: ApplicationContext,
  metadata?: BookingNotificationMetadata,
): { subject: string; html: string } {
  const adminLink = ctx.portalUrl
    ? `${ctx.portalUrl.replace(/\/$/, "")}/admin/applications/${ctx.applicationId}`
    : "";

  switch (event) {
    case "application_created":
      return {
        subject: `New booking started – ${ctx.studentName} – ${ctx.companyName}`,
        html: `
          <h2>New Student Booking Started</h2>
          <p>A new application has been created in the booking portal.</p>
          <ul>
            <li><strong>Student:</strong> ${ctx.studentName}${ctx.studentEmail ? ` (${ctx.studentEmail})` : ""}</li>
            <li><strong>Contract:</strong> ${ctx.contractName}</li>
            <li><strong>Application ID:</strong> ${ctx.applicationId}</li>
            <li><strong>Status:</strong> ${ctx.status}</li>
          </ul>
          ${adminLink ? `<p><a href="${adminLink}">View application in admin</a></p>` : ""}
        `,
      };
    case "studio_reserved":
      return {
        subject: `Studio reserved – ${ctx.studioNumber} – ${ctx.studentName}`,
        html: `
          <h2>Studio Reserved</h2>
          <p>A student has reserved a studio during their booking journey.</p>
          <ul>
            <li><strong>Student:</strong> ${ctx.studentName}</li>
            <li><strong>Studio:</strong> ${ctx.studioNumber}</li>
            <li><strong>Contract:</strong> ${ctx.contractName}</li>
            <li><strong>Application ID:</strong> ${ctx.applicationId}</li>
          </ul>
          ${adminLink ? `<p><a href="${adminLink}">View application</a></p>` : ""}
        `,
      };
    case "deposit_paid":
      return {
        subject: `Deposit received – ${ctx.studentName} – ${metadata?.amount ?? "—"}`,
        html: `
          <h2>Deposit Payment Received</h2>
          <p>A deposit has been recorded for a student application.</p>
          <ul>
            <li><strong>Student:</strong> ${ctx.studentName}${ctx.studentEmail ? ` (${ctx.studentEmail})` : ""}</li>
            <li><strong>Amount:</strong> ${metadata?.amount ?? "See portal"}</li>
            <li><strong>Method:</strong> ${metadata?.paymentMethod ?? "Online"}</li>
            <li><strong>Studio:</strong> ${ctx.studioNumber}</li>
            <li><strong>Contract:</strong> ${ctx.contractName}</li>
            <li><strong>Application ID:</strong> ${ctx.applicationId}</li>
          </ul>
          ${adminLink ? `<p><a href="${adminLink}">View application</a></p>` : ""}
        `,
      };
    case "application_submitted":
      return {
        subject: `Agreements sent – ${ctx.studentName} – ready to sign`,
        html: `
          <h2>Application Submitted – Agreements Sent</h2>
          <p>The student has completed Step 5 and DocuSign agreements have been sent.</p>
          <ul>
            <li><strong>Student:</strong> ${ctx.studentName}</li>
            <li><strong>Studio:</strong> ${ctx.studioNumber}</li>
            <li><strong>Contract:</strong> ${ctx.contractName}</li>
            <li><strong>Application ID:</strong> ${ctx.applicationId}</li>
          </ul>
          ${adminLink ? `<p><a href="${adminLink}">View application</a></p>` : ""}
        `,
      };
    case "manual_payment_request_submitted": {
      const paymentLink = ctx.portalUrl
        ? `${ctx.portalUrl.replace(/\/$/, "")}/admin/manual-payment-entry`
        : "";
      return {
        subject: `Payment approval needed – ${ctx.studentName} – ${metadata?.amount ?? "—"}`,
        html: `
          <h2>Student Manual Payment Request</h2>
          <p>A student has submitted a manual payment for your approval.</p>
          <ul>
            <li><strong>Student:</strong> ${ctx.studentName}${ctx.studentEmail ? ` (${ctx.studentEmail})` : ""}</li>
            <li><strong>Amount:</strong> ${metadata?.amount ?? "See portal"}</li>
            <li><strong>Method:</strong> ${metadata?.paymentMethod ?? "Not specified"}</li>
            <li><strong>Contract:</strong> ${ctx.contractName}</li>
            <li><strong>Application ID:</strong> ${ctx.applicationId}</li>
          </ul>
          ${paymentLink ? `<p><a href="${paymentLink}">Review pending requests</a></p>` : ""}
        `,
      };
    }
  }
}

async function sendStudentDepositEmail(
  supabase: SupabaseClient,
  ctx: ApplicationContext,
  amount: string,
): Promise<void> {
  if (!ctx.studentId) return;

  const { error } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      user_id: ctx.studentId,
      email_type: "deposit_received",
      variables: {
        student_name: ctx.studentName,
        amount,
      },
      create_notification: true,
    },
  });

  if (error) {
    console.error("send-transactional-email deposit_received failed:", error);
  }
}

/**
 * Send booking/deposit notifications to staff (and student for deposits).
 */
export async function notifyBookingEvent(
  supabase: SupabaseClient,
  event: BookingNotificationEvent,
  applicationId: string,
  metadata?: BookingNotificationMetadata,
): Promise<{ ok: boolean; staffSent?: boolean; studentSent?: boolean }> {
  const ctx = await loadApplicationContext(supabase, applicationId, metadata);
  if (!ctx) {
    return { ok: false };
  }

  const roles = STAFF_ROLES_BY_EVENT[event];
  const staffEmails = await getStaffEmailsByRoles(supabase, roles);
  const { subject, html } = buildStaffEmail(event, ctx, metadata);

  const staffResult = await sendStaffAlertEmail(supabase, {
    to: staffEmails,
    subject,
    html,
  });

  let studentSent = false;
  if (
    event === "deposit_paid" &&
    ctx.studentId &&
    metadata?.notifyStudent !== false
  ) {
    await sendStudentDepositEmail(
      supabase,
      ctx,
      metadata?.amount ?? "—",
    );
    studentSent = true;
  }

  return {
    ok: true,
    staffSent: staffResult.sent,
    studentSent,
  };
}
