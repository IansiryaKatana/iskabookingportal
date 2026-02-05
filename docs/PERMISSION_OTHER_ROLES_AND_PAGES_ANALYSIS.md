# Permission “Other Roles” Redirect & Permissions Page Coverage

## 1. Why “other roles” land on OTA Bookings when accessing an application

### What happens today

1. **Route-level (App.tsx)**  
   `/admin/applications` and `/admin/applications/:applicationId` use:
   - `allowedRoles={["staff", "superadmin", "operations_manager", "reservationist", "accountant", "front_desk", "maintenance_officer", "housekeeper"]}`  
   So at the route level, all these roles are allowed to hit the Applications pages.

2. **Database-level (ProtectedRoute + `route_permissions`)**  
   - `ProtectedRoute` also checks the `route_permissions` table.  
   - If the **role** (or for sub-roles, **staff**) has `allowed = false` for `/admin/applications`, access is **denied**.  
   - When access is denied, the user is **redirected** to their “default” route from `getDefaultRouteForRole(role)`.

3. **Default route for reservationist (and similar)**  
   In `src/utils/getDefaultRoute.ts`, the **reservationist** default list is:
   - `["/ota-bookings", "/ota-bookings/booking-chart", "/ota-bookings/studio-allocation"]`  
   So when a reservationist (or any role whose first *allowed* default is OTA) is denied access to Applications, they are sent to **OTA Bookings** — not to an “Access denied” page.

So the behaviour is: **deny by DB → redirect to role’s first allowed default** → for reservationist that is OTA Bookings.

### Summary

- **Cause:** Denied access (e.g. Applications turned off in Permissions UI for that role or for staff) + redirect-to-default behaviour.  
- **Effect:** User tries to open an application → gets redirected to OTA Bookings.  
- **Not a bug in the sense of wrong redirect target:** the code is doing “send to first allowed default”. It’s a **UX/design** choice: you might prefer an “Access denied” page or a different fallback.

---

## 2. Options to improve behaviour

You can proceed in one or more of these ways:

- **A) Rely on Permissions UI only (no code change)**  
  - Ensure `/admin/applications` (and any other page you want) has the right toggles in the Permissions UI.  
  - For roles that should see Applications: turn **ON** for that role (or leave staff ON so sub-roles inherit).  
  - Then the “other roles” issue only appears when you **intentionally** deny Applications; redirect to OTA is then “first allowed page” for reservationist.

- **B) Add an “Access denied” page**  
  - When `ProtectedRoute` denies access, redirect to e.g. `/access-denied` instead of `getDefaultRouteForRole()`.  
  - User sees a clear “You don’t have access to this page” and a link to their dashboard/default.  
  - Requires: new route, new page component, and `ProtectedRoute` changed to use it when `!hasAccess`.

- **C) Keep redirect but make default list role-appropriate**  
  - Already the case: each role has its own default list.  
  - You could add more routes to the list (e.g. `/admin` for reservationist) so that when Applications is denied, they go to admin dashboard instead of OTA, if that fits your policy.

- **D) Combination**  
  - Use Permissions UI to manage who can access Applications (and other pages).  
  - Optionally add an Access denied page for denied access, and/or tweak default lists in `getDefaultRoute.ts` if you want a different fallback than OTA.

Recommendation: **A + ensure all relevant routes are in the Permissions UI** (see below). Optionally add **B** if you want a clear “no access” experience instead of silently sending users to OTA.

---

## 3. Pages/routes to add to the Permissions system (so the UI can manage all access)

The Permissions page shows **only routes that have at least one row** in `route_permissions`. So any protected route that should be toggleable per role needs at least one permission row (usually for `staff` and/or `superadmin`).

### 3.1 Routes that exist in the app but are missing from `route_permissions`

These are **not** in the initial seed or later migrations, so they **do not appear** in the Permissions UI and cannot be toggled:

| Route path | Route name (suggestion) | Notes |
|------------|-------------------------|--------|
| `/admin/sales-reports` | Sales Reports | App route exists; no permission rows. |
| `/admin/bulk-invitations` | Bulk Invitations | App route exists; no permission rows. |
| `/admin/secrets` | Secrets | Superadmin-only in App; add for superadmin (and optionally staff if you ever open it). |

Add these to `route_permissions` (see migration below) so they show up in the Permissions UI and you can manage access.

### 3.2 Route in DB but not in App

| Route path | Note |
|------------|------|
| `/maintenance/job-map` | Present in `20250131_route_permissions_three_modules.sql` but there is **no** `/maintenance/job-map` route in `App.tsx`. Either add the route in the app or remove/ignore this path in permissions. |

### 3.3 Incorrect or incomplete permission in DB

| Route path | Issue |
|------------|--------|
| `/maintenance/out-of-order` | In `20250131_route_permissions_three_modules.sql`, `maintenance_officer` has **no** row for this path. The App allows `maintenance_officer` on this route. So either the UI can’t show a toggle for maintenance_officer for this page, or they rely on staff inheritance. Adding `maintenance_officer` for `/maintenance/out-of-order` makes the Permissions UI complete for this page. |

### 3.4 Routes already covered (no change needed)

- **Portal:** `/portal`, `/portal/payments`, `/portal/contracts`, `/portal/documents`, `/portal/notifications`, `/portal/maintenance`, `/portal/profile`.  
- **Admin (most):** `/admin`, `/admin/academic-years`, `/admin/studio-grades`, `/admin/payment-plans`, `/admin/contracts`, `/admin/studios`, `/admin/applications`, `/admin/students`, `/admin/reports`, `/admin/booking-calendar`, `/admin/refunds`, `/admin/financial-forecast`, `/admin/accounting-reports`, `/admin/fully-paid-students`, `/admin/cashback-campaigns`, `/admin/partners`, `/admin/partner-commissions`, `/admin/weekly-payment-report`, `/admin/data-import`, `/admin/manual-payment-entry`, `/admin/expenses`, `/admin/bulk-messages`, `/admin/targeted-messages`, `/admin/email-templates`, `/admin/docusign-templates`, `/admin/branding`, `/admin/settings`, `/admin/audit-logs`, `/admin/users`, `/admin/permissions`, `/admin/payment-history`.  
- **Operations:** `/maintenance`, `/maintenance/job-management`, `/maintenance/out-of-order` (only maintenance_officer missing for out-of-order), `/housekeeping`, `/housekeeping/roster`, `/housekeeping/communal-areas`, `/ota-bookings`, `/ota-bookings/booking-chart`, `/ota-bookings/studio-allocation`, `/ota-bookings/finance`.  
- **Partner:** `/partner`, `/partner/referrals`, `/partner/commissions`, `/partner/profile`.

Detail routes like `/admin/applications/:id` and `/admin/students/:id` use the **parent** path in permission checks (`getPermissionPath` in `ProtectedRoute`), so `/admin/applications` and `/admin/students` already control list and detail.

---

## 4. Permissions UI behaviour (for managing all access)

- **Routes:** The UI lists every **distinct `route_path`** that exists in `route_permissions`. So adding the missing routes above will make them appear and allow toggling.  
- **Roles:** The UI lists every **distinct `role`** that exists in `route_permissions`. So `maintenance_officer` and `housekeeper` already appear if they have at least one row; adding maintenance_officer for `/maintenance/out-of-order` keeps that page fully manageable.  
- **Save behaviour:** The Permissions page updates/inserts rows in `route_permissions`. Turning a role **off** for a route sets `allowed = false` (or removes access depending on your save logic). That’s what causes the “no access → redirect to default” behaviour for Applications (or any other page).

So to “manage all access” from the Permissions UI you need:

1. **Every protected route** that should be toggleable to have at least one row in `route_permissions` (so it shows in the UI).  
2. **For each such route**, the roles you care about to have a row (so you can turn them on/off).  

Adding the missing routes and the missing `maintenance_officer` row for `/maintenance/out-of-order` completes the set of pages you can manage from the UI.

---

## 5. Recommended next steps

1. **Apply the migration** that:
   - Inserts `/admin/sales-reports`, `/admin/bulk-invitations`, `/admin/secrets` (with appropriate roles, e.g. staff/superadmin for sales-reports and bulk-invitations, superadmin for secrets).  
   - Inserts `maintenance_officer` for `/maintenance/out-of-order`.  
   (Optionally handle `/maintenance/job-map` in the same migration only if you add that route to the app.)

2. **Decide redirect behaviour:**  
   - Keep current: “denied → redirect to default route” (so reservationist goes to OTA when Applications is denied).  
   - Or add an “Access denied” page and redirect there when access is denied.

3. **Use the Permissions UI** to grant/revoke access to Applications (and other pages) per role. With the new rows, all relevant pages will be visible and manageable.

---

## 6. Files involved

| File | Purpose |
|------|--------|
| `src/components/ProtectedRoute.tsx` | Checks `route_permissions`; redirects to `getDefaultRouteForRole(role)` when access denied. |
| `src/utils/getDefaultRoute.ts` | Defines per-role default route lists; reservationist starts with `/ota-bookings`, so that’s where they land when denied elsewhere. |
| `src/pages/admin/Permissions.tsx` | Reads `route_permissions` and displays one row per route; toggles update the table. |
| `supabase/migrations/20250127_route_permissions_system.sql` | Initial route_permissions seed. |
| `supabase/migrations/20250131_route_permissions_three_modules.sql` | Maintenance, Housekeeping, OTA routes (and job-map). |
| `supabase/migrations/20250131_add_ota_finance_route_permissions.sql` | OTA Finance. |
| `supabase/migrations/20250131_add_communal_areas_route_permissions.sql` | Communal areas. |

Adding a new migration that inserts the missing routes and the missing `maintenance_officer` row will align the Permissions UI with the app and let you manage all access from one place.
