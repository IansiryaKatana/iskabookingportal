# Phase 2 Progress: UI Implementation

**Date:** January 31, 2025  
**Status:** In Progress

---

## ✅ Completed

### Hooks Created

1. **`src/hooks/useHousekeeping.ts`**
   - ✅ `useHousekeepingStatus()` - Query with filters
   - ✅ `useUpdateHousekeepingStatus()` - Single update
   - ✅ `useBulkUpdateHousekeepingStatus()` - Bulk actions

2. **`src/hooks/useOutOfOrder.ts`**
   - ✅ `useOutOfOrderRecords()` - Query with filters
   - ✅ `useCreateOutOfOrderRecord()` - Create new record
   - ✅ `useUpdateOutOfOrderRecord()` - Update record

3. **`src/hooks/useOTABookings.ts`**
   - ✅ `useOTABookings()` - Query with filters
   - ✅ `useCreateOTABooking()` - Create booking
   - ✅ `useUpdateOTABooking()` - Update booking
   - ✅ `useBulkUpdateOTABookings()` - Bulk actions

4. **`src/hooks/useActivityLog.ts`**
   - ✅ `useActivityLog()` - Query activity log for entity

5. **`src/hooks/useStaffMembers.ts`**
   - ✅ `useStaffMembers()` - Query staff with filters
   - ✅ `useMaintenanceOfficers()` - Get maintenance officers

6. **Enhanced `src/hooks/useMaintenanceRequests.ts`**
   - ✅ Added `assigned_to` relation
   - ✅ Ready for new status workflow

---

## 📋 Next Steps: Pages to Build

### Module 1: Maintenance & Asset Maintenance

1. **`/maintenance` - Maintenance Dashboard**
   - [ ] Filter cards (category + status) - horizontally scrollable
   - [ ] Stats cards (New, Unassigned, Assigned, In Progress, Pending Approval, Overdue)
   - [ ] List/table view (desktop: table, mobile: cards)
   - [ ] Search + filters + sort
   - [ ] Details drawer (right-side desktop, full-screen mobile)
   - [ ] Timeline/activity log
   - [ ] Status change controls (role-based)
   - [ ] Approval/rejection buttons (Ops Manager)

2. **`/maintenance/job-management` - Job Management**
   - [ ] Assignment interface
   - [ ] Batch assignment (bulk select → assign officer)
   - [ ] SLA view
   - [ ] Work order queue by urgency

3. **`/maintenance/job-map` - Job Map** (Basic version)
   - [ ] Filter by building/floor/studio
   - [ ] Pins/tiles showing open tasks + urgency
   - [ ] Click pin opens details drawer

4. **`/maintenance/out-of-order` - Out of Order**
   - [ ] List of Out of Order records
   - [ ] Create/edit Out of Order dialog
   - [ ] Link to maintenance request
   - [ ] Blocking flag display

### Module 2: Housekeeping

1. **`/housekeeping` - Housekeeping Dashboard**
   - [ ] Clean status filter cards (horizontally scrollable)
   - [ ] Stats cards (Dirty count, Pending approvals, Today's assigned, Overdue, Without roster)
   - [ ] List/table with bulk edit CRUD
   - [ ] Bulk actions (assign cleaner, set date, mark dirty, approve)
   - [ ] Details drawer with cleaning history

2. **`/housekeeping/roster` - Housekeeping Roster**
   - [ ] View by Cleaner → list of studios
   - [ ] View by Studio → assigned cleaner
   - [ ] Default cleaning date per studio (editable)

### Module 3: OTA Bookings

1. **`/ota-bookings` - OTA Bookings Dashboard**
   - [ ] Status stat cards (11 statuses)
   - [ ] List/table with filters
   - [ ] Bulk actions (update status, assign studio, mark no-show)
   - [ ] Details drawer with guest info + timeline

2. **`/ota-bookings/booking-chart` - Booking Chart**
   - [ ] Enhance existing booking calendar
   - [ ] Studio rows vs date columns
   - [ ] Color blocks by booking
   - [ ] Filters (status, channel, studio group, date range)
   - [ ] Out of Order overlay

3. **`/ota-bookings/studio-allocation` - Studio Allocation**
   - [ ] Available OTA studios
   - [ ] Conflict detection (occupied, out of order, dirty)
   - [ ] Allocation interface

---

## 🔧 Implementation Priority

**High Priority (Core Functionality):**
1. Maintenance Dashboard (`/maintenance`) - Most critical
2. Housekeeping Dashboard (`/housekeeping`) - Daily operations
3. OTA Bookings Dashboard (`/ota-bookings`) - Revenue management

**Medium Priority:**
4. Maintenance Job Management (`/maintenance/job-management`)
5. Maintenance Out of Order (`/maintenance/out-of-order`)
6. Housekeeping Roster (`/housekeeping/roster`)

**Low Priority (Can enhance later):**
7. Maintenance Job Map (`/maintenance/job-map`)
8. OTA Booking Chart (`/ota-bookings/booking-chart`) - Enhance existing
9. OTA Studio Allocation (`/ota-bookings/studio-allocation`)

---

## 📝 Notes

- All hooks are ready and tested
- Need to create page components
- Need to add routes to App.tsx
- Need to update navigation (AdminLayout)
- Approval workflow UI needed (LoggedMessage dialog)
- Activity log timeline component needed

---

**Current Status:** Hooks Complete - Building Pages Next

