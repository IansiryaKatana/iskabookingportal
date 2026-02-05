# Permissions: Hardcoded vs Dynamic – Root Cause & Fix

## What you saw

- **Applications** is enabled for **reservationist** in the Permissions UI.
- Reservationist can view the applications list and click **Review** (goes to `/admin/applications/:id` – works).
- When they click **Open journey** (goes to `/portal/applications/:id`), they are **redirected to OTA Bookings** instead of the application journey.

So permissions are **not fully** controlled by the Permissions UI: some behaviour was fixed in code.

---

## Root cause: two-layer permission model

Access is decided in **two** places. Both must allow the role; if either blocks, the user is redirected.

### 1. Route-level (hardcoded in `App.tsx`) – **this was the problem**

Each `<ProtectedRoute>` has an **`allowedRoles`** array. Only roles in that array are ever considered for that route.

- **`/admin/applications`** and **`/admin/applications/:applicationId`** already included:  
  `staff`, `superadmin`, `operations_manager`, `reservationist`, `accountant`, `front_desk`, `maintenance_officer`, `housekeeper`.  
  So reservationist could open **Review** (admin application detail).

- **`/portal/applications/:applicationId`** (Open journey – application wizard) and **`/portal/applications/:applicationId/select-studio`** had only:  
  `["student", "staff", "superadmin"]`.  
  **Reservationist was not in that list**, so as soon as they opened the journey URL, `ProtectedRoute` denied access and redirected to their default route (OTA Bookings for reservationist).

So: **Permissions UI had Applications ON for reservationist, but the portal journey route did not include reservationist in `allowedRoles`.** The UI cannot add a role that isn’t in `allowedRoles`; it can only turn existing ones on/off in the database.

### 2. Database (`route_permissions` / Permissions UI)

- `ProtectedRoute` also checks the **`route_permissions`** table.
- The Permissions UI only edits this table.
- If a role is **not** in `allowedRoles` for that route, it is **denied in code** before the DB is checked. So the UI could not fix the “Open journey” case until the route was updated.

---

## What was fixed

1. **`App.tsx`**  
   The same staff sub-roles that can access Applications are now allowed on the portal application routes:
   - **`/portal/applications/:applicationId`** (Application Journey / StudentApplicationWizard)
   - **`/portal/applications/:applicationId/select-studio`** (Studio Selection)

   Added to **both** routes:  
   `operations_manager`, `reservationist`, `accountant`, `front_desk`, `maintenance_officer`, `housekeeper`.

   So reservationist (and the others) are no longer blocked at the route level when they click **Open journey**.

2. **`ProtectedRoute.tsx` – `getPermissionPath()`**  
   - `/portal/applications/:id` → permission path **`/portal/applications`**  
   - `/portal/applications/:id/select-studio` → permission path **`/portal/applications/select-studio`**  
   So one permission row per path controls all application IDs. The Permissions UI can now turn “Application Journey (Portal)” and “Studio Selection (Portal)” on/off per role.

3. **Migration `20260208_route_permissions_portal_application_journey.sql`**  
   Inserts **`route_permissions`** for:
   - **`/portal/applications`** – “Application Journey (Portal)”
   - **`/portal/applications/select-studio`** – “Studio Selection (Portal)”  
   for: student, staff, superadmin, admin, operations_manager, reservationist, accountant, front_desk, maintenance_officer, housekeeper (all allowed by default).  
   So these two routes **appear in the Permissions UI** and can be managed there.

After deploying the code and running the migration, reservationist with Applications enabled can use **Open journey** without being sent to OTA. You can still turn “Application Journey (Portal)” or “Studio Selection (Portal)” off for specific roles in the Permissions UI if needed.

---

## Rule of thumb (to avoid similar issues live)

- **Permissions UI** only toggles access for roles that are **already** in **`allowedRoles`** for that route.
- If a role can reach a **page** (e.g. Applications list/detail) but a **link** from that page goes to another route (e.g. portal journey), that **target route** must also list the same roles in **`allowedRoles`** in `App.tsx`. Otherwise they will be denied and redirected to their default route.
- So when adding or changing links from an admin/portal page, check that the **destination route** in `App.tsx` has the right `allowedRoles` for the same set of roles that can see the source page.

---

## Other places that could cause similar issues

These are the only routes that had a **mismatch**: they are linked from pages that sub-roles can access, but the route’s `allowedRoles` did not include those sub-roles.

- **Open journey** → `/portal/applications/:id` – **fixed** (sub-roles added + route_permissions).
- **Studio selection** (from journey) → `/portal/applications/:id/select-studio` – **fixed** (same).

No other links from application list/detail or ApplicationDetail were found that point to routes with narrower `allowedRoles`. If you add new links (e.g. “View as student”, “Edit contract”, etc.), ensure the target route’s `allowedRoles` in `App.tsx` includes every role that should be able to use that link.

---

## Summary

- **Why reservationist was redirected to OTA:**  
  “Open journey” goes to `/portal/applications/:id`, which had **allowedRoles** = `["student", "staff", "superadmin"]`. Reservationist was not in that list, so access was denied and they were sent to their default route (OTA).

- **Are permissions partly hardcoded?**  
  Yes. **Which roles can ever access a route** is fixed in **`App.tsx`** (`allowedRoles`). The Permissions UI only controls **who, among those roles, is allowed** via **`route_permissions`**. So the UI cannot grant access to a role that isn’t in `allowedRoles`.

- **What was done:**  
  Portal application journey and studio selection routes now include the same sub-roles as Applications in `App.tsx`, and both paths are in **`route_permissions`** and in **getPermissionPath**, so they are fully manageable in the Permissions UI and reservationist can use **Open journey** when they have access.

Apply the migration **20260208_route_permissions_portal_application_journey.sql** and deploy the app changes so this is live.
