## Sales & Demographics Reports – Implementation Overview

This document summarises the changes made to implement the **Sales & Demographics** reporting feature, including database views, edge function, frontend hooks, and admin UI.

---

## 1. Database Reporting Views

Defined in `supabase/migrations/20251215_create_sales_reports_views.sql`.

### 1.1 `public.sales_demographics_report`

**Purpose**: One row per **confirmed** `student_applications` record, combining contract, pricing, partner, and demographic details for reporting and Excel export.

**Key joins**

- `student_applications sa`
- `contracts c`
- `studio_grades sg`
- `studios s`
- `academic_years ay`
- `profiles p`
- `student_application_steps` (`step1` = personal, `step3` = academic/additional)
- `application_cashbacks ac` (latest per application)
- `partner_referred_applications` / `partner_referrals` / `partners`

**Important columns**

- Identity & demographics:
  - `application_id`, `student_id`
  - `ucas_id` (`step1.payload ->> 'ucas_id'`)
  - `first_name`, `last_name`
  - `country` (`step1.payload ->> 'country'`)
  - `entry_into_uk` (`step3.payload ->> 'entry_into_uk'`)
- Inventory:
  - `studio_number`
  - `studio_grade`
  - `company_name` (currently `NULL::text` placeholder)
- Timing:
  - `created_at`
  - `confirmed_date` = `COALESCE(sa.submitted_at, sa.created_at)`
  - `arrival_date` = `c.contract_start`
  - `departure_date` = `c.contract_end`
  - `weeks` (derived from `contract_end - contract_start`)
  - `academic_year_id`, `academic_year_name`
- Commercials:
  - `weekly_rent` = `COALESCE(c.weekly_price_override, 0)`
  - `total_sales_value` = `sa.total_contract_value`
  - `cashback_applied` (bool) and `cashback_value` (latest `application_cashbacks` record)
  - `partner_commission`
- Channel & retention:
  - `partner_referral_code`, `partner_name`
  - `is_rebooker` (`sa.is_rebooking`)
- Seasonal:
  - `summer_sales_value` – `total_contract_value` when `contract_start` month is Jun–Aug (simple heuristic).

**Filter**

- `WHERE sa.status = 'confirmed'`

**Permissions**

- `GRANT SELECT ON public.sales_demographics_report TO authenticated;`

---

### 1.2 `public.sales_occupancy_monthly`

**Purpose**: Monthly occupancy per **academic year × studio grade**, based on confirmed contracts and studio capacity.

**Capacity helper**

- CTE `grade_capacity`:
  - `studio_grade_id`
  - `total_studios` = count of `studios` per grade

**Aggregation**

- Dimensions:
  - `academic_year_id`, `academic_year_name`
  - `month_start` = `DATE_TRUNC('month', c.contract_start)`
  - `month_label` = `TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY')`
  - `studio_grade_id`, `studio_grade_name`
  - `capacity` (from `grade_capacity`)
- Metrics:
  - `confirmed_contracts` = `COUNT(DISTINCT sa.id)`
  - `occupancy_percentage` = `confirmed_contracts / capacity * 100` (rounded to 2 dp)

**Filter**

- `sa.status = 'confirmed'`
- `c.contract_start IS NOT NULL`

**Permissions**

- `GRANT SELECT ON public.sales_occupancy_monthly TO authenticated;`

---

### 1.3 `public.sales_rebookers_monthly`

**Purpose**: Monthly rebooker performance per academic year.

**Aggregation**

- Dimensions:
  - `academic_year_id`, `academic_year_name`
  - `month_start` (`DATE_TRUNC('month', c.contract_start)`)
  - `month_label` (`TO_CHAR(DATE_TRUNC('month', c.contract_start), 'Mon YYYY')`)
- Metrics:
  - `rebooker_contracts` – count where `COALESCE(sa.is_rebooking, false)` is true
  - `rebooker_total_sales_value` – sum of `sa.total_contract_value` for rebookers
  - `total_contracts` – all confirmed contracts in that month
  - `rebooker_share_percentage` – rebooker contracts as % of total contracts

**Filter**

- `sa.status = 'confirmed'`
- `c.contract_start IS NOT NULL`

**Permissions**

- `GRANT SELECT ON public.sales_rebookers_monthly TO authenticated;`

---

## 2. Edge Function: `sales-report-export`

**Location**: `supabase/functions/sales-report-export/index.ts`  
**Tech**: Deno + `@supabase/supabase-js@2.57.2` + `xlsx@0.18.5`

### 2.1 CORS

- Handles `OPTIONS` with:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`

### 2.2 Auth & role checks

- Reads `Authorization: Bearer <access_token>`.
- Uses service‑role client to call `auth.getUser`.
- Looks up `profiles.role` and allows only:
  - `staff`
  - `superadmin`
- Returns `401`/`403` JSON otherwise.

### 2.3 Request body

- JSON:  
  - `{ academicYearId?: string }`
  - If omitted → reports across all years.

### 2.4 Data loading

- `sales_demographics_report` (optionally `eq("academic_year_id", academicYearId)`).
- `sales_occupancy_monthly` (same filter).
- `sales_rebookers_monthly` (same filter).
- Derives display `academic_year_name` from the first row if present.

### 2.5 Workbook structure

Created via `XLSX.utils.book_new()` and `aoa_to_sheet`.

- **Sheet: `Summary`**
  - Academic year name and generated timestamp.
  - Metrics:
    - `Total Confirmed Contracts`
    - `Total Sales Value`
    - `Total Summer Sales Value`
    - `Total Rebooker Contracts`

- **Sheet: `OccupancyByGrade`**
  - Columns:
    - `Academic Year`, `Month`, `Studio Grade`, `Capacity`, `Confirmed Contracts`, `Occupancy %`
  - Rows from `sales_occupancy_monthly`.

- **Sheet: `Rebookers`**
  - Columns:
    - `Academic Year`, `Month`, `Rebooker Contracts`, `Rebooker Total Sales Value`, `Total Contracts`, `Rebooker Share %`
  - Rows from `sales_rebookers_monthly`.

- **Sheet: `Demographics`**
  - Columns:
    - Application & student: `Application ID`, `Student ID`, `UCAS ID`, `First Name`, `Last Name`
    - Demographics: `Country`, `Entry Into UK`
    - Inventory: `Studio Number`, `Studio Grade`, `Company Name`
    - Timing: `Created At`, `Confirmed Date`, `Arrival Date`, `Departure Date`, `Weeks`, `Academic Year`
    - Commercials: `Weekly Rent`, `Total Sales Value`, `Cashback Applied`, `Cashback Value`
    - Partner: `Partner Referral Code`, `Partner Name`, `Partner Commission`
    - Flags: `Rebooker`, `Summer Sales Value`
  - Rows from `sales_demographics_report`.

### 2.6 Binary response (Excel)

- Writes workbook as an array and normalises to `Uint8Array`:

```ts
const wbArray = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
const wbout = wbArray instanceof ArrayBuffer ? new Uint8Array(wbArray) : (wbArray as Uint8Array);
```

- Responds with:

```ts
return new Response(wbout, {
  status: 200,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
  },
});
```

This ensures Excel receives a valid `.xlsx` binary stream.

---

## 3. Supabase Client Exports

**File**: `src/integrations/supabase/client.ts`

- Environment:
  - `export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;`
  - `export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_PUBLISHABLE_KEY;`
- Client:

```ts
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

These exports are reused in the sales report hooks to call the edge function with a raw `fetch`.

---

## 4. Frontend Hooks: `useSalesReports`

**File**: `src/hooks/useSalesReports.ts`

### 4.1 Types

- `SalesDemographicsRow` – mirrors `sales_demographics_report`.
- `SalesOccupancyMonthlyRow` – mirrors `sales_occupancy_monthly`.
- `SalesRebookersMonthlyRow` – mirrors `sales_rebookers_monthly`.

### 4.2 Data hooks

- `useSalesDemographicsReport(academicYearId?)`
  - `supabase.from("sales_demographics_report").select("*")` with optional `eq("academic_year_id", id)`.
- `useSalesOccupancyMonthly(academicYearId?)`
  - `supabase.from("sales_occupancy_monthly").select("*")` with optional filter.
- `useSalesRebookersMonthly(academicYearId?)`
  - `supabase.from("sales_rebookers_monthly").select("*")` with optional filter.

All use React Query for caching and loading states.

### 4.3 Download hook: `useDownloadSalesReport`

**Goal**: Trigger Excel file generation and download in the browser.

Steps:

1. Get current user session:

```ts
const session = await supabase.auth.getSession();
const accessToken = session.data.session?.access_token;
```

2. Call edge function with raw `fetch` (for reliable binary handling):

```ts
const response = await fetch(`${SUPABASE_URL}/functions/v1/sales-report-export`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(academicYearId ? { academicYearId } : {}),
});
```

3. Read binary and download:

```ts
const arrayBuffer = await response.arrayBuffer();
const blob = new Blob([arrayBuffer], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = "sales_report.xlsx";
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
URL.revokeObjectURL(url);
```

---

## 5. Admin UI: Sales & Demographics Page

**File**: `src/pages/admin/SalesReports.tsx`

### 5.1 Routing and navigation

- Lazy‑loaded in `App.tsx`:
  - `const AdminSalesReports = lazy(() => import("./pages/admin/SalesReports"));`
  - Route: `/admin/sales-reports` wrapped with `ProtectedRoute` for `["staff", "superadmin"]`.
- Added to `AdminLayout.navSections` under **Reports**:
  - `Accounting Reports` → `/admin/accounting-reports`
  - **`Sales & Demographics`** → `/admin/sales-reports`
  - `Operational Reports` → `/admin/reports`

### 5.2 Layout & filters

- Uses `AdminLayout` with:
  - `pageTitle="Sales & Demographics"`
  - Subtitle: “Live sales, occupancy, and demographics from confirmed contracts”
  - Mobile action button: rounded icon button for Download Excel on the far right.
- Filter card:
  - `AcademicYearSelector` (`academicYearId` state).
  - Text reminder that reports use **live confirmed contracts only**.

### 5.3 KPIs

Computed from `SalesDemographicsRow` data:

- `Total Confirmed Contracts`
- `Total Sales Value`
- `Rebooker Share %`
- `Summer Sales Value`

Displayed in responsive `grid` (columns on desktop, stacked on mobile) with branded card styling.

### 5.4 Charts

Using `ChartContainer` and Recharts line charts.

- **Occupancy by Month**
  - Data from `useSalesOccupancyMonthly`.
  - `month_label` (x‑axis) vs `occupancy_percentage`.
- **Rebookers by Month**
  - Data from `useSalesRebookersMonthly`.
  - `month_label` vs `rebooker_share_percentage`.

Both charts respect your UI rules (responsive columns on desktop, stack on mobile; minimal padding; consistent admin look).

### 5.5 Demographics table

- Data from `useSalesDemographicsReport`.
- Columns include:
  - Student name (+ UCAS ID sub‑label)
  - `country`
  - `studio_number`
  - `studio_grade`
  - `partner_name` or “Direct”
  - `weekly_rent`
  - `total_sales_value`
  - `cashback_value`
  - `partner_commission`
  - Rebooker/New badge
- Table is horizontally scrollable for smaller viewports.

### 5.6 Download behaviour

- Desktop: “Download Excel” button on the top‑right of the Sales Overview card.
- Mobile: round icon button in the page header (via `mobileActionButton`).
- Both call `useDownloadSalesReport`, which:
  - Authenticates with the current access token.
  - Invokes the `sales-report-export` edge function.
  - Streams and downloads the generated `.xlsx` file.

---

## 6. Notes & Future Enhancements

- `company_name` is currently a `NULL` placeholder; once a buildings/companies table is introduced, update `sales_demographics_report` to join it and populate this field.
- `summer_sales_value` currently treats any contract starting Jun–Aug as summer. This can be refined later to prorate contract value by weeks that actually fall within the summer window.
- All reporting logic is centralised in database views, so additional UIs or exports can reuse these views without duplicating logic.


