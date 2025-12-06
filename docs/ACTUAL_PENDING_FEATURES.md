# Actual Pending Features & Enhancements
**Date:** January 27, 2025  
**Status:** Updated after all migrations and functions deployed

---

## ✅ COMPLETED (All Migrations & Functions Deployed Today)

- ✅ All database migrations
- ✅ All edge functions deployed
- ✅ Payment system complete
- ✅ Rebooking system complete
- ✅ Studio availability complete
- ✅ Payment history complete
- ✅ Weekly reports complete

---

## 🔴 CRITICAL FEATURES STILL NEEDED

### 1. Email Notification Triggers ⚠️ HIGH PRIORITY
**Status:** Edge function exists, but may not be triggered on all events

**Missing Triggers:**
- [ ] Deposit payment received → Send confirmation email
- [ ] Signature completed → Send confirmation email
- [ ] Application confirmed → Send welcome email
- [ ] Payment due (7 days before) → Send reminder email
- [ ] Payment overdue → Send overdue notification
- [ ] Document verification needed → Send notification

**Action:** Verify these triggers are set up in database or edge functions

---

### 2. DocuSign Webhook Handler ⚠️ MEDIUM PRIORITY
**Status:** Currently using polling (inefficient)

**Required:**
- [ ] Create `handle-docusign-webhook` edge function (if not exists)
- [ ] Configure DocuSign webhook URL in DocuSign dashboard
- [ ] Handle webhook events automatically
- [ ] Replace polling with webhook-based updates

**Current:** Polling every 30 seconds  
**Better:** Real-time webhook updates

---

### 3. Application Detail View Enhancements ⚠️ HIGH PRIORITY
**Location:** `src/pages/admin/ApplicationDetail.tsx`

**Missing Features:**
- [ ] Document preview (images, PDFs) - currently requires download
- [ ] Bulk document verification (approve/reject multiple at once)
- [ ] Notes/comments section per application
- [ ] Timeline view showing application progression
- [ ] Email/SMS trigger buttons (send custom messages)
- [ ] Studio reassignment with preview

**Impact:** Staff cannot efficiently review applications

---

### 4. Real Dashboard Metrics ⚠️ MEDIUM PRIORITY
**Location:** `src/pages/admin/Dashboard.tsx`

**Replace Placeholders With:**
- [ ] Real occupancy percentage calculation
- [ ] Revenue projections based on confirmed applications
- [ ] Pending verification count (actual data)
- [ ] Upcoming instalments with amounts
- [ ] Charts/graphs for trends (occupancy over time, revenue)

**Current:** May show placeholder data  
**Need:** Real calculations from database

---

## 🟡 HIGH PRIORITY FEATURES

### 5. Missing Financial Reports
**Location:** `src/pages/admin/Reports.tsx`

**Missing Reports:**
- [ ] **Awaiting Signatures Report**
  - Applications with `awaiting_signature` status
  - Days waiting, contact info
  - Export to CSV
  
- [ ] **Awaiting Deposit Report**
  - Applications with `awaiting_deposit` status
  - Deposit amount, days waiting
  - Export to CSV
  
- [ ] **Overdue Payments Report**
  - Instalments with `due_date < today` and not paid
  - Days overdue, amounts
  - Export to CSV
  
- [ ] **Debtors Report**
  - Students with unpaid instalments
  - Total owed, oldest overdue date
  - Export to CSV
  
- [ ] **Occupancy Report**
  - Studio assignments by grade, floor, building
  - Student names, contract dates
  - Export to CSV

**Also Missing (from Payment Assessment):**
- [ ] Accounts Receivable (AR) Report
- [ ] Revenue Summary Report (monthly/quarterly)
- [ ] Aged Debt Report (0-30, 31-60, 61-90, 90+ days)
- [ ] Stripe Reconciliation Report

---

### 6. Pay-in-Full Payment Option ⚠️ HIGH PRIORITY
**Status:** Not implemented

**Required:**
- [ ] Add `is_pay_in_full` flag to `payment_plans` table (migration)
- [ ] Update Step 5 (Payment Plan Selection) UI to show "Pay in Full" option
- [ ] Hide guarantor section for pay-in-full
- [ ] Add "Pay Remaining Balance" button after deposit
- [ ] Create single payment intent for remaining amount
- [ ] Update payment flow logic

**Location:** `src/pages/portal/ApplicationWizard.tsx` (Step 5)

---

### 7. Payment Receipts ⚠️ MEDIUM PRIORITY
**Status:** Not implemented

**Required:**
- [ ] Generate PDF receipts on payment success
- [ ] Receipt download page in student portal
- [ ] Email receipts automatically
- [ ] Receipt history view in student portal

**Location:** `src/pages/portal/Payments.tsx`

---

### 8. Notification System UI Enhancement
**Location:** `src/pages/portal/Notifications.tsx`

**Missing:**
- [ ] Notification bell in header with unread count badge
- [ ] Real-time notification updates (Supabase Realtime)
- [ ] Link to relevant pages from notifications
- [ ] Notification categories/filtering
- [ ] Mark all as read functionality

**Current:** Page exists but may need enhancement

---

### 9. Automated Payment Reminders ⚠️ MEDIUM PRIORITY
**Status:** Not implemented

**Required:**
- [ ] Scheduled emails for upcoming payments (7 days before)
- [ ] Overdue payment reminders (automatic daily)
- [ ] Payment due notifications (day of)
- [ ] Configurable reminder schedules

**Implementation:** Edge function with cron job or scheduled task

---

### 10. Student Portal - Rebooking UI Indicators
**Status:** Backend complete, UI may need enhancement

**Missing (if not implemented):**
- [ ] Clear indication when viewing rebooking application
- [ ] Link to previous application
- [ ] Rebooking reason display (if applicable)

**Location:** `src/pages/portal/ApplicationWizard.tsx`

---

## 🟢 MEDIUM PRIORITY ENHANCEMENTS

### 11. Bulk Actions (Admin Portal)
**Status:** Not implemented

**Missing:**
- [ ] Bulk document verification (approve/reject multiple)
- [ ] Bulk status updates for applications
- [ ] Bulk email/SMS sending
- [ ] Bulk export to CSV

---

### 12. Document Management Enhancements

**Missing:**
- [ ] Document preview in admin portal (images, PDFs in modal)
- [ ] File size limits enforced in frontend (currently backend only?)
- [ ] Document expiry tracking (e.g., visa expiration)
- [ ] Automatic reminders for expiring documents
- [ ] Document versioning (keep history of re-uploads)

---

### 13. Studio Management Enhancements

**Missing:**
- [ ] Interactive floor plan visualization
- [ ] Advanced filters (floor, building, amenities)
- [ ] Bulk studio status updates
- [ ] Studio maintenance scheduling
- [ ] Occupancy calendar view

---

### 14. Application Wizard Enhancements

**Missing:**
- [ ] Progress persistence across browser sessions (localStorage backup)
- [ ] Offline support for form completion (PWA?)
- [ ] Visual indication of required vs optional documents
- [ ] Explicit "Save Progress" button (currently autosaves)
- [ ] Better error messages for failed uploads

---

### 15. Admin Portal - User Management Verification
**Location:** `src/pages/admin/Users.tsx`

**Verify These Features Exist:**
- [ ] Invite staff flow (email invitation → signup)
- [ ] Role assignment interface (staff, superadmin)
- [ ] User deactivation/activation
- [ ] Password reset for users

**Action:** Review the Users page to verify completeness

---

### 16. Admin Portal - Rebooking Indicators
**Location:** `src/pages/admin/ApplicationDetail.tsx`

**Missing:**
- [ ] Rebooking badge if `is_rebooking === true`
- [ ] Link to previous application (if `previous_application_id` exists)
- [ ] Rebooking reason display (if `rebooking_reason` exists)

**Priority:** LOW (nice to have)

---

### 17. Email Template System Enhancements
**Location:** `src/pages/admin/EmailTemplates.tsx`

**Missing (if not implemented):**
- [ ] Rich text editor for templates (currently basic?)
- [ ] Variable picker dropdown in editor
- [ ] Preview with sample data
- [ ] Test send functionality
- [ ] Version history for templates

---

## ⚪ LOW PRIORITY / TESTING & INFRASTRUCTURE

### 18. Automated Testing ⚠️ HIGH PRIORITY
**Status:** No automated tests found

**Missing:**
- [ ] Unit tests for hooks and utilities
- [ ] Integration tests for edge functions
- [ ] E2E tests for critical workflows (Playwright/Cypress)
- [ ] Test coverage reporting
- [ ] CI/CD pipeline with tests

**Impact:** No regression testing

---

### 19. Monitoring & Observability

**Missing:**
- [ ] Verify Sentry is properly configured in production
- [ ] Error alerts for critical failures
- [ ] Performance monitoring (APM)
- [ ] Structured logging (replace console.log)
- [ ] Log aggregation
- [ ] Uptime monitoring

---

### 20. Mobile Responsiveness Improvements

**Missing:**
- [ ] Bottom-sheet dialogs for mobile (spec requirement)
- [ ] Camera integration for document upload on mobile
- [ ] Sticky deposit CTA on mobile (spec requirement)
- [ ] Touch-friendly carousel controls

---

### 21. Accessibility Improvements

**Missing:**
- [ ] Full ARIA label audit
- [ ] Keyboard navigation testing
- [ ] Screen reader testing (NVDA/JAWS)
- [ ] High-contrast mode support
- [ ] Color contrast audit (WCAG AA compliance)

---

### 22. Performance Optimizations

**Missing:**
- [ ] Image optimization (WebP, responsive sizes)
- [ ] Lazy loading for images
- [ ] React Query caching strategies optimization
- [ ] Code splitting for large components
- [ ] Bundle size analysis and optimization

---

### 23. Documentation Gaps

**Missing:**
- [ ] `.env.example` file with all required variables
- [ ] API documentation for Edge Functions
- [ ] User guides (student portal)
- [ ] User guides (admin portal)
- [ ] User guides (partner portal)
- [ ] Deployment guide (production steps)
- [ ] Maintenance guide (troubleshooting)

---

## 📊 SUMMARY

### Completed Today ✅
- All database migrations deployed
- All edge functions deployed
- Payment system complete
- Rebooking system complete
- Studio availability complete

### Critical Items Still Needed (9 items)
1. Email notification triggers
2. Application detail view enhancements
3. Missing financial reports
4. Pay-in-full option
5. Automated payment reminders
6. Real dashboard metrics
7. Payment receipts
8. DocuSign webhook handler
9. Automated testing

### High Priority Items (8 items)
- Notification UI enhancements
- Bulk actions
- Document management enhancements
- User management verification
- And more...

### Estimated Time
- **Critical Items:** 2-3 weeks
- **High Priority:** 2-3 weeks  
- **Total:** 4-6 weeks for production-ready

---

**Last Updated:** January 27, 2025  
**Next Review:** After critical items completed

