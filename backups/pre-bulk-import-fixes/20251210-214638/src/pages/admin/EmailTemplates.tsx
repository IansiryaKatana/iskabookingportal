import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
} from "@/hooks/useEmailTemplates";
import { Plus, Edit, Trash2, Mail, Info, Sparkles } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const templateTypes = [
  { value: "welcome", label: "Welcome" },
  { value: "application_received", label: "Application Received" },
  { value: "deposit_reminder", label: "Deposit Reminder" },
  { value: "payment_reminder", label: "Payment Reminder" },
  { value: "overdue_payment", label: "Overdue Payment" },
  { value: "application_confirmed", label: "Application Confirmed" },
  { value: "document_approved", label: "Document Approved" },
  { value: "document_rejected", label: "Document Rejected" },
  { value: "signature_reminder", label: "Signature Reminder" },
  { value: "custom", label: "Custom" },
];

// Zod validation schema
const emailTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(255, "Name is too long"),
  subject: z.string().min(1, "Email subject is required").max(500, "Subject is too long"),
  body_html: z.string().min(1, "HTML body is required"),
  body_text: z.string().optional(),
  template_type: z.enum([
    "welcome",
    "application_received",
    "deposit_reminder",
    "payment_reminder",
    "overdue_payment",
    "application_confirmed",
    "document_approved",
    "document_rejected",
    "signature_reminder",
    "custom",
  ]),
  is_active: z.boolean(),
});

type EmailTemplateFormData = z.infer<typeof emailTemplateSchema>;

// Available variables for each template type
const templateVariables: Record<string, { variables: string[]; description: string }> = {
  welcome: {
    variables: ["student_name", "portal_url"],
    description: "Welcome email sent to new students",
  },
  application_received: {
    variables: ["student_name", "application_id", "next_steps"],
    description: "Sent when application is submitted",
  },
  deposit_reminder: {
    variables: ["student_name", "amount", "due_date", "payment_url"],
    description: "Reminder for deposit payment",
  },
  payment_reminder: {
    variables: ["student_name", "amount", "due_date", "installment_number", "payment_url"],
    description: "Reminder for upcoming payment",
  },
  overdue_payment: {
    variables: ["student_name", "amount", "due_date", "days_overdue", "payment_url"],
    description: "Notification for overdue payments",
  },
  application_confirmed: {
    variables: ["student_name", "studio_number", "contract_start", "contract_end", "portal_url"],
    description: "Sent when application is confirmed",
  },
  document_approved: {
    variables: ["student_name", "document_type", "application_id"],
    description: "Notification when document is approved",
  },
  document_rejected: {
    variables: ["student_name", "document_type", "rejection_reason", "application_id"],
    description: "Notification when document is rejected",
  },
  signature_reminder: {
    variables: ["student_name", "agreement_type", "signing_url", "expiry_date"],
    description: "Reminder to complete signature",
  },
  custom: {
    variables: ["student_name", "amount", "due_date", "portal_url", "application_id"],
    description: "Custom template with flexible variables",
  },
};

// Generate default template HTML for each type
// Branding constants - matches portal design system
const BRAND_COLORS = {
  primary: "hsl(0, 85%, 55%)", // Red
  primaryHex: "#e63946",
  accent: "hsl(45, 100%, 51%)", // Yellow
  accentHex: "#ffc107",
  text: "#1f2937",
  textMuted: "#4b5563",
  background: "#ffffff",
  backgroundMuted: "#f3f4f6",
  border: "#e5e7eb",
};

const BRAND_FONTS = {
  body: "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  display: "'Big Shoulders Display', 'Inter Tight', sans-serif",
};

const getDefaultTemplate = (templateType: string): { subject: string; html: string; text: string } => {
  // Logo URL - will be replaced with actual logo URL when sending emails
  // For preview, we'll use a placeholder or the actual favicon
  const logoUrl = "{logo_url}"; // This will be replaced with actual logo URL in Edge Function
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  
  const templates: Record<string, { subject: string; html: string; text: string }> = {
    welcome: {
      subject: "Welcome to {company_name}, {student_name}!",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700;800&family=Big+Shoulders+Display:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: ${BRAND_FONTS.body}; line-height: 1.6; color: ${BRAND_COLORS.text}; margin: 0; padding: 0; background-color: ${BRAND_COLORS.backgroundMuted}; }
    .email-wrapper { background-color: ${BRAND_COLORS.backgroundMuted}; padding: 20px 0; }
    .container { max-width: 600px; margin: 0 auto; background: ${BRAND_COLORS.background}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
    .header { background: linear-gradient(135deg, ${BRAND_COLORS.primaryHex} 0%, ${BRAND_COLORS.accentHex} 100%); color: white; padding: 40px 20px; text-align: center; }
    .header h1 { font-family: ${BRAND_FONTS.display}; font-size: 32px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }
    .logo { max-width: 120px; height: auto; margin-bottom: 20px; }
    .content { background: ${BRAND_COLORS.background}; padding: 40px 30px; }
    .content h2 { font-family: ${BRAND_FONTS.display}; color: ${BRAND_COLORS.text}; margin-top: 0; font-size: 28px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; }
    .button { display: inline-block; background: ${BRAND_COLORS.primaryHex}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; font-family: ${BRAND_FONTS.body}; text-transform: uppercase; letter-spacing: 0.05em; }
    .button:hover { background: hsl(0, 75%, 50%); }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: ${BRAND_COLORS.textMuted}; font-size: 14px; border-top: 1px solid ${BRAND_COLORS.border}; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="{company_name}" class="logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <h1 style="margin: 0; display: none;">{company_name}</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Welcome to {company_name}!</p>
      </div>
      <div class="content">
        <h2>Hello {student_name},</h2>
        <p style="font-size: 16px; color: ${BRAND_COLORS.textMuted};">We're thrilled to welcome you to {company_name}! Your journey to finding the perfect student accommodation starts here.</p>
        <p style="font-size: 16px; color: ${BRAND_COLORS.textMuted};">Our platform makes it easy to browse studio options, complete your application, and manage your booking all in one place.</p>
        <p style="margin: 20px 0 10px 0; font-weight: 600; color: ${BRAND_COLORS.text};"><strong>What's next?</strong></p>
        <ul style="color: ${BRAND_COLORS.textMuted}; line-height: 1.8;">
          <li>Browse our available studio grades</li>
          <li>Complete your application</li>
          <li>Review and sign your agreement</li>
          <li>Make your deposit payment</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{portal_url}" class="button">Access Your Portal</a>
        </div>
        <p style="font-size: 16px; color: ${BRAND_COLORS.textMuted};">If you have any questions, our support team is here to help. Welcome aboard!</p>
        <p style="margin: 30px 0 0 0; color: ${BRAND_COLORS.text};"><strong style="color: ${BRAND_COLORS.primaryHex}; font-family: ${BRAND_FONTS.display}; text-transform: uppercase;">The {company_name} Team</strong></p>
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
        <p style="margin: 0; font-size: 12px;">This email was sent to you as part of your {company_name} account.</p>
      </div>
    </div>
  </div>
</body>
</html>`,
      text: `Welcome to {company_name}!

Hello {student_name},

We're thrilled to welcome you to {company_name}! Your journey to finding the perfect student accommodation starts here.

Our platform makes it easy to browse studio options, complete your application, and manage your booking all in one place.

What's next?
- Browse our available studio grades
- Complete your application
- Review and sign your agreement
- Make your deposit payment

Access your portal: {portal_url}

If you have any questions, our support team is here to help. Welcome aboard!

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    application_received: {
      subject: "Application Received - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">✓ Application Received</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>Thank you for submitting your application to {company_name}! We've successfully received your application.</p>
      <div class="info-box">
        <p style="margin: 0 0 10px 0;"><strong>Application ID:</strong> {application_id}</p>
        <p style="margin: 0;">We're currently reviewing your application and will notify you of the next steps shortly.</p>
      </div>
      <p><strong>Next Steps:</strong></p>
      <ol>
        <li>Complete your payment plan selection</li>
        <li>Upload required documents</li>
        <li>Review and sign your tenancy agreement</li>
        <li>Make your deposit payment</li>
      </ol>
      <p>You can track your application progress and complete these steps in your student portal.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Application Received - {company_name}

Hello {student_name},

Thank you for submitting your application to {company_name}! We've successfully received your application.

Application ID: {application_id}

We're currently reviewing your application and will notify you of the next steps shortly.

Next Steps:
1. Complete your payment plan selection
2. Upload required documents
3. Review and sign your tenancy agreement
4. Make your deposit payment

You can track your application progress and complete these steps in your student portal.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    deposit_reminder: {
      subject: "Deposit Payment Reminder - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .payment-box { background: #fffbeb; border: 2px solid #f59e0b; padding: 25px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .amount { font-size: 32px; font-weight: bold; color: #d97706; margin: 10px 0; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">💰 Deposit Payment Reminder</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>This is a friendly reminder that your deposit payment is due soon.</p>
      <div class="payment-box">
        <p style="margin: 0 0 10px 0; color: #92400e; font-weight: 600;">Deposit Amount</p>
        <div class="amount">{amount}</div>
        <p style="margin: 10px 0 0 0; color: #92400e;"><strong>Due Date:</strong> {due_date}</p>
      </div>
      <p>To secure your studio booking, please complete your deposit payment before the due date. You can make your payment securely through your student portal.</p>
      <div style="text-align: center;">
        <a href="{payment_url}" class="button">Pay Deposit Now</a>
      </div>
      <p style="color: #dc2626; font-weight: 600;">⚠️ Important: Your reservation may expire if payment is not received by the due date.</p>
      <p>If you've already made this payment, please disregard this reminder. If you have any questions, please contact our support team.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Deposit Payment Reminder - {company_name}

Hello {student_name},

This is a friendly reminder that your deposit payment is due soon.

Deposit Amount: {amount}
Due Date: {due_date}

To secure your studio booking, please complete your deposit payment before the due date. You can make your payment securely through your student portal.

Pay now: {payment_url}

⚠️ Important: Your reservation may expire if payment is not received by the due date.

If you've already made this payment, please disregard this reminder. If you have any questions, please contact our support team.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    payment_reminder: {
      subject: "Payment Reminder - Installment #{installment_number} - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .payment-box { background: #eff6ff; border: 2px solid #3b82f6; padding: 25px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .amount { font-size: 32px; font-weight: bold; color: #2563eb; margin: 10px 0; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">💳 Payment Reminder</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>This is a reminder that your upcoming payment installment is due soon.</p>
      <div class="payment-box">
        <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: 600;">Installment #{installment_number}</p>
        <div class="amount">{amount}</div>
        <p style="margin: 10px 0 0 0; color: #1e40af;"><strong>Due Date:</strong> {due_date}</p>
      </div>
      <p>Please ensure your payment is made by the due date to avoid any late fees or service interruptions.</p>
      <div style="text-align: center;">
        <a href="{payment_url}" class="button">Pay Now</a>
      </div>
      <p>You can view your complete payment schedule and history in your student portal.</p>
      <p>If you have any questions or concerns about this payment, please don't hesitate to contact us.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Payment Reminder - Installment #{installment_number} - {company_name}

Hello {student_name},

This is a reminder that your upcoming payment installment is due soon.

Installment #{installment_number}
Amount: {amount}
Due Date: {due_date}

Please ensure your payment is made by the due date to avoid any late fees or service interruptions.

Pay now: {payment_url}

You can view your complete payment schedule and history in your student portal.

If you have any questions or concerns about this payment, please don't hesitate to contact us.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    overdue_payment: {
      subject: "⚠️ Overdue Payment - Action Required - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .payment-box { background: #fef2f2; border: 2px solid #dc2626; padding: 25px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .amount { font-size: 32px; font-weight: bold; color: #b91c1c; margin: 10px 0; }
    .button { display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">⚠️ Payment Overdue</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p style="color: #dc2626; font-weight: 600; font-size: 18px;">This payment is now overdue and requires immediate attention.</p>
      <div class="payment-box">
        <p style="margin: 0 0 10px 0; color: #991b1b; font-weight: 600;">Overdue Amount</p>
        <div class="amount">{amount}</div>
        <p style="margin: 10px 0 5px 0; color: #991b1b;"><strong>Original Due Date:</strong> {due_date}</p>
        <p style="margin: 5px 0 0 0; color: #991b1b;"><strong>Days Overdue:</strong> {days_overdue} day(s)</p>
      </div>
      <p><strong>Immediate action is required.</strong> Please make this payment as soon as possible to avoid:</p>
      <ul>
        <li>Late payment fees</li>
        <li>Service interruptions</li>
        <li>Impact on your account status</li>
      </ul>
      <div style="text-align: center;">
        <a href="{payment_url}" class="button">Pay Overdue Amount Now</a>
      </div>
      <p>If you're experiencing financial difficulties, please contact our support team immediately to discuss payment arrangements. We're here to help.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `⚠️ Overdue Payment - Action Required - {company_name}

Hello {student_name},

This payment is now overdue and requires immediate attention.

Overdue Amount: {amount}
Original Due Date: {due_date}
Days Overdue: {days_overdue} day(s)

Immediate action is required. Please make this payment as soon as possible to avoid:
- Late payment fees
- Service interruptions
- Impact on your account status

Pay now: {payment_url}

If you're experiencing financial difficulties, please contact our support team immediately to discuss payment arrangements. We're here to help.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    application_confirmed: {
      subject: "🎉 Application Confirmed - Welcome to {company_name}!",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .success-box { background: #f0fdf4; border: 2px solid #10b981; padding: 25px; margin: 20px 0; border-radius: 8px; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #d1d5db; }
    .info-row:last-child { border-bottom: none; }
    .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">🎉 Application Confirmed!</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Congratulations, {student_name}!</h2>
      <p>We're thrilled to inform you that your application has been confirmed. Welcome to {company_name}!</p>
      <div class="success-box">
        <h3 style="margin-top: 0; color: #059669;">Your Booking Details</h3>
        <div class="info-row">
          <span style="font-weight: 600;">Studio Number:</span>
          <span>{studio_number}</span>
        </div>
        <div class="info-row">
          <span style="font-weight: 600;">Contract Start:</span>
          <span>{contract_start}</span>
        </div>
        <div class="info-row">
          <span style="font-weight: 600;">Contract End:</span>
          <span>{contract_end}</span>
        </div>
      </div>
      <p>Your studio is now reserved for you. You can access your student portal to:</p>
      <ul>
        <li>View your contract and payment schedule</li>
        <li>Manage your documents</li>
        <li>Track your payments</li>
        <li>Update your profile</li>
      </ul>
      <div style="text-align: center;">
        <a href="{portal_url}" class="button">Access Your Portal</a>
      </div>
      <p>If you have any questions or need assistance, our support team is always here to help. We're excited to have you as part of the {company_name} community!</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `🎉 Application Confirmed - Welcome to {company_name}!

Congratulations, {student_name}!

We're thrilled to inform you that your application has been confirmed. Welcome to {company_name}!

Your Booking Details:
Studio Number: {studio_number}
Contract Start: {contract_start}
Contract End: {contract_end}

Your studio is now reserved for you. You can access your student portal to:
- View your contract and payment schedule
- Manage your documents
- Track your payments
- Update your profile

Access your portal: {portal_url}

If you have any questions or need assistance, our support team is always here to help. We're excited to have you as part of the {company_name} community!

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    document_approved: {
      subject: "Document Approved - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .success-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">✓ Document Approved</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>Great news! Your document has been reviewed and approved.</p>
      <div class="success-box">
        <p style="margin: 0 0 10px 0;"><strong>Document Type:</strong> {document_type}</p>
        <p style="margin: 0;"><strong>Application ID:</strong> {application_id}</p>
      </div>
      <p>Your application is progressing well. Continue with the remaining steps in your booking journey.</p>
      <p>You can view all your documents and their status in your student portal.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Document Approved - {company_name}

Hello {student_name},

Great news! Your document has been reviewed and approved.

Document Type: {document_type}
Application ID: {application_id}

Your application is progressing well. Continue with the remaining steps in your booking journey.

You can view all your documents and their status in your student portal.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    document_rejected: {
      subject: "Document Review - Action Required - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .warning-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">⚠️ Document Review Required</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>We've reviewed your document, but unfortunately it doesn't meet our requirements at this time.</p>
      <div class="warning-box">
        <p style="margin: 0 0 10px 0;"><strong>Document Type:</strong> {document_type}</p>
        <p style="margin: 0 0 10px 0;"><strong>Application ID:</strong> {application_id}</p>
        <p style="margin: 0;"><strong>Reason for Rejection:</strong></p>
        <p style="margin: 10px 0 0 0; padding: 10px; background: white; border-radius: 4px;">{rejection_reason}</p>
      </div>
      <p><strong>What you need to do:</strong></p>
      <ol>
        <li>Review the rejection reason above</li>
        <li>Upload a new document that meets our requirements</li>
        <li>Ensure the document is clear, complete, and valid</li>
      </ol>
      <p>Please log in to your student portal to upload a new document. If you have any questions about the requirements, please contact our support team.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Document Review - Action Required - {company_name}

Hello {student_name},

We've reviewed your document, but unfortunately it doesn't meet our requirements at this time.

Document Type: {document_type}
Application ID: {application_id}

Reason for Rejection:
{rejection_reason}

What you need to do:
1. Review the rejection reason above
2. Upload a new document that meets our requirements
3. Ensure the document is clear, complete, and valid

Please log in to your student portal to upload a new document. If you have any questions about the requirements, please contact our support team.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    signature_reminder: {
      subject: "Signature Reminder - Complete Your Agreement - {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .reminder-box { background: #faf5ff; border: 2px solid #8b5cf6; padding: 25px; margin: 20px 0; border-radius: 8px; }
    .button { display: inline-block; background: #8b5cf6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">✍️ Signature Reminder</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>This is a friendly reminder that you still need to complete signing your {agreement_type} agreement.</p>
      <div class="reminder-box">
        <p style="margin: 0 0 10px 0; color: #6b21a8; font-weight: 600;">Agreement Type:</p>
        <p style="margin: 0 0 15px 0; font-size: 18px; color: #6b21a8;">{agreement_type}</p>
        <p style="margin: 0; color: #6b21a8;"><strong>Expiry Date:</strong> {expiry_date}</p>
      </div>
      <p>To complete your booking, please sign your agreement before the expiry date. The signing process is quick and secure.</p>
      <div style="text-align: center;">
        <a href="{signing_url}" class="button">Sign Agreement Now</a>
      </div>
      <p style="color: #dc2626; font-weight: 600;">⚠️ Important: Your agreement will expire on {expiry_date}. Please complete the signing process before then.</p>
      <p>If you have any questions about the agreement or need assistance, please contact our support team.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Signature Reminder - Complete Your Agreement - {company_name}

Hello {student_name},

This is a friendly reminder that you still need to complete signing your {agreement_type} agreement.

Agreement Type: {agreement_type}
Expiry Date: {expiry_date}

To complete your booking, please sign your agreement before the expiry date. The signing process is quick and secure.

Sign now: {signing_url}

⚠️ Important: Your agreement will expire on {expiry_date}. Please complete the signing process before then.

If you have any questions about the agreement or need assistance, please contact our support team.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
    custom: {
      subject: "Notification from {company_name}",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">{company_name}</h1>
    </div>
    <div class="content">
      <h2 style="color: #1f2937; margin-top: 0;">Hello {student_name},</h2>
      <p>This is a custom notification from {company_name}.</p>
      <p>You can customize this template with any variables you need.</p>
      <p style="margin-bottom: 0;">Best regards,<br><strong>The {company_name} Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0;">© ${new Date().getFullYear()} {company_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Notification from {company_name}

Hello {student_name},

This is a custom notification from {company_name}.

You can customize this template with any variables you need.

Best regards,
The {company_name} Team

© ${new Date().getFullYear()} {company_name}. All rights reserved.`,
    },
  };

  return templates[templateType] || templates.custom;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  template_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  variables: string | null;
};

const EmailTemplates = () => {
  const { toast } = useToast();
  const { data: templatesData, isLoading } = useEmailTemplates();
  const templates = (templatesData ?? []) as unknown as EmailTemplate[];
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  const form = useForm<EmailTemplateFormData>({
    resolver: zodResolver(emailTemplateSchema),
    defaultValues: {
      name: "",
      subject: "",
      body_html: "",
      body_text: "",
      template_type: "custom",
      is_active: true,
    },
  });

  const handleLoadDefaultTemplate = () => {
    const templateType = form.watch("template_type");
    const defaultTemplate = getDefaultTemplate(templateType);
    const templateName = templateTypes.find((t) => t.value === templateType)?.label || "Template";
    
    form.setValue("name", form.watch("name") || `${templateName} Template`);
    form.setValue("subject", defaultTemplate.subject);
    form.setValue("body_html", defaultTemplate.html);
    form.setValue("body_text", defaultTemplate.text);
    
    toast({
      title: "Template loaded",
      description: `Default ${templateName.toLowerCase()} template has been loaded.`,
    });
  };

  const handleOpenDialog = (templateId?: string) => {
    if (templateId) {
      const template = templates?.find((t) => t.id === templateId);
      if (template) {
        setEditingTemplate(templateId);
        form.reset({
          name: template.name,
          subject: template.subject,
          body_html: template.body_html,
          body_text: template.body_text || "",
          template_type: template.template_type as EmailTemplateFormData["template_type"],
          is_active: template.is_active,
        });
      }
    } else {
      setEditingTemplate(null);
      form.reset({
        name: "",
        subject: "",
        body_html: "",
        body_text: "",
        template_type: "custom",
        is_active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (data: EmailTemplateFormData) => {
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate,
          name: data.name,
          subject: data.subject,
          body_html: data.body_html,
          body_text: data.body_text,
          template_type: data.template_type,
          is_active: data.is_active,
        });
        toast({
          title: "Template updated",
          description: "Email template has been updated successfully.",
        });
      } else {
        await createTemplate.mutateAsync({
          name: data.name,
          subject: data.subject,
          body_html: data.body_html,
          body_text: data.body_text,
          template_type: data.template_type,
          is_active: data.is_active ?? true,
        });
        toast({
          title: "Template created",
          description: "Email template has been created successfully.",
        });
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("Failed to save template:", error);
      toast({
        title: "Error",
        description: "Failed to save template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await deleteTemplate.mutateAsync(templateId);
      toast({
        title: "Template deleted",
        description: "Email template has been deleted successfully.",
      });
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast({
        title: "Error",
        description: "Failed to delete template. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Email Templates" subtitle="Manage email templates for student communications">
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
      pageTitle="Email Templates" 
      subtitle="Manage email templates for student communications"
      mobileActionButton={
        <Button
          size="sm"
          className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
          onClick={() => handleOpenDialog()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide">
              Email Templates
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage email templates for automated communications
            </p>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        </div>

        {templates && templates.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} className="rounded-3xl">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {template.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {template.subject}
                      </CardDescription>
                    </div>
                    <Badge variant={template.is_active ? "default" : "outline"} className="uppercase">
                      {template.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
                      <p className="text-sm font-medium capitalize">
                        {template.template_type.replace("_", " ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => handleOpenDialog(template.id)}
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
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
                No Templates Found
              </CardTitle>
              <CardDescription>
                Create your first email template to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleOpenDialog()}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display uppercase tracking-wide">
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the email template details."
                : "Create a new email template for student communications."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Welcome Email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="template_type"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2 mb-2">
                      <FormLabel>Template Type *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 rounded-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-2xl" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold text-sm">Available Variables</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {templateVariables[field.value]?.description || "Custom template variables"}
                      </p>
                      <div className="space-y-2">
                        {(templateVariables[field.value]?.variables || []).map((variable) => (
                          <div key={variable} className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                              {`{${variable}}`}
                            </code>
                            <span className="text-xs text-muted-foreground">
                              {variable.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                        Use these variables in your template. They will be replaced with actual values when the email is sent.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
                    </div>
                    <div className="flex gap-2">
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {templateTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!editingTemplate && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLoadDefaultTemplate}
                          className="rounded-full uppercase tracking-wide gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          Load Template
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Welcome to {company_name}!"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="body_html"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Body (HTML) *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="font-mono text-sm"
                        rows={10}
                        placeholder="<html>...</html>"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="body_text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Body (Plain Text)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={5}
                        placeholder="Plain text version of the email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <FormLabel>Active</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-full uppercase tracking-wide"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplate.isPending || updateTemplate.isPending}
                  className="rounded-full uppercase tracking-wide"
                >
                  {editingTemplate ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default EmailTemplates;

