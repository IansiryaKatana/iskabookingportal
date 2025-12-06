# Admin Navigation Structure

## Recommended Hierarchical Navigation

```
📊 Overview
   └─ Dashboard

📅 Academic Management
   ├─ Academic Years
   ├─ Studio Grades
   └─ Studios

💰 Finance
   ├─ Payment Plans
   ├─ Contracts
   ├─ Payment History
   ├─ Weekly Payment Report
   ├─ Fully Paid Students
   ├─ Financial Forecast
   └─ Refunds

👥 Students & Applications
   ├─ Applications
   ├─ Students
   └─ Student Detail (dynamic route)

💼 Partners
   ├─ Partners
   └─ Partner Commissions

🎁 Promotions
   └─ Cashback Campaigns

📧 Communications
   ├─ Bulk Messages
   └─ Email Templates

📊 Reports
   └─ Reports

⚙️ System
   ├─ Users
   ├─ Audit Logs
   └─ Settings
```

## Current Routes vs Navigation

### ✅ Routes in Navigation
- Overview (/admin)
- Academic Years (/admin/academic-years)
- Studio Grades (/admin/studio-grades)
- Payment Plans (/admin/payment-plans)
- Contracts (/admin/contracts)
- Studios (/admin/studios)
- Applications (/admin/applications)
- Students (/admin/students)
- Reports (/admin/reports)
- Bulk Messages (/admin/bulk-messages)
- Email Templates (/admin/email-templates)
- Financial Forecast (/admin/financial-forecast)
- Payment History (/admin/payment-history)
- Fully Paid Students (/admin/fully-paid-students)
- Cashback Campaigns (/admin/cashback-campaigns)
- Partners (/admin/partners)
- Partner Commissions (/admin/partner-commissions)
- Weekly Payment Report (/admin/weekly-payment-report)
- Users (/admin/users)
- Refunds (/admin/refunds)
- Audit Logs (/admin/audit-logs)
- Settings (/admin/settings)

### ⚠️ Routes NOT in Navigation (but exist)
- Application Detail (/admin/applications/:applicationId) - Dynamic route
- Student Detail (/admin/students/:applicationId) - Dynamic route

### ✅ All Routes Are Accounted For

## Implementation Plan

1. **Add Create Contract Functionality**
   - Add `useCreateContract` hook
   - Add "Create Contract" button and dialog
   - Include academic year and studio grade selectors

2. **Update Navigation Structure**
   - Convert flat navigation to hierarchical with collapsible sections
   - Add expand/collapse functionality
   - Group related items logically

3. **Visual Improvements**
   - Add icons for parent sections
   - Indent sub-items
   - Show active state for parent when child is active
   - Smooth expand/collapse animations

