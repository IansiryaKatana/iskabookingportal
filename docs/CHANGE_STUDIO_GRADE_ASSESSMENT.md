# Changing a Studio’s Room Grade – Current State & Recommendations

## 1. Current State: Can You Change a Studio’s Grade Today?

**No.** There is no UI or flow that lets staff change the room grade (studio grade) of a studio.

### What exists today

| Area | Behaviour |
|------|-----------|
| **Admin → Studios** | Lists studios with **grade shown read-only** (e.g. “Silver — Floor 1”, “Gold — Floor 2”). You can change **status** (Available / Reserved / Occupied / Maintenance) and **allocation** (Student / OTA / Keyworkers / Unallocated) only. |
| **useUpdateStudio** | Accepts `Partial<StudioRow> & { id: string }` and passes all fields to Supabase `update()`. So **technically** you could call `updateStudio.mutateAsync({ id: studioId, studio_grade_id: newGradeId })` and it would work – but nothing in the app does that. |
| **useBulkUpdateStudios** | Same: `updates` is passed as-is to `.update(updates)`. Bulk **grade** change is not exposed in the UI. |
| **Database** | `studios.studio_grade_id` is `NOT NULL` and references `studio_grades(id) ON DELETE RESTRICT`. No trigger blocks updating it. |
| **RLS** | “Staff manage studios” allows staff to do **all** (including UPDATE) on `studios`. So updating `studio_grade_id` is **allowed** at the DB layer. |

So: the **backend and hooks already support** changing a studio’s grade; the **only** gap is that the **UI never sends** `studio_grade_id`.

---

## 2. Schema & Dependencies

- **studios.studio_grade_id**: required, FK to `studio_grades(id)`, no unique constraint. You can only set it to another **valid** grade ID (not null).
- **Applications**: `student_applications` has `assigned_studio_id` (the room) and `studio_grade_id` (from the **contract** they chose). If you change a studio’s grade after it’s assigned, the application still points to that studio; the application’s `studio_grade_id` stays the contract’s grade. So you can have “Studio 101 (now Gold)” assigned to an “Application for Silver contract”. Reports that join application → studio → `studios.studio_grade_id` will show the **current** grade (e.g. Gold). That’s usually what you want when “reclassifying” a room.
- **Availability / views**: All use `studios.studio_grade_id` at read time. After an update they just reflect the new grade; no schema or trigger changes needed.
- **OTA**: Only `studio_id`; no direct dependency on studio grade. Safe to change grade.

---

## 3. Recommendations (No Code Yet)

### Option A: Single-studio “Change grade” on Studios page (recommended baseline)

- **Where**: Admin → Studios (existing roster).
- **How**: Per row, add a **grade** dropdown (or “Change grade” action) next to the existing status dropdown. Options = current `studio_grades` (same source as the grade filter). On change, call `updateStudio.mutateAsync({ id: studio.id, studio_grade_id: selectedGradeId })`.
- **Pros**: Minimal change, clear, one studio at a time.  
- **Cons**: Bulk “regrade” many studios at once requires multiple calls or a separate bulk step.

### Option B: Bulk “Set grade” for selected studios

- Reuse the existing “select studios → Bulk Actions” pattern.
- Add a bulk action like “Set grade to…” and a grade selector in the confirm dialog. On confirm, call `bulkUpdateStudios.mutateAsync({ studioIds: [...], updates: { studio_grade_id: selectedGradeId } })`.
- **Pros**: Fast when reclassifying many rooms (e.g. a whole floor from Silver to Gold).  
- **Cons**: Slightly more UI; need to ensure the confirm dialog makes it clear which grade is being set.

### Option C: Dedicated “Edit studio” dialog/sheet

- Add an “Edit” (or “Edit studio”) action per row that opens a dialog/sheet with: studio number (read-only), floor, **grade** (dropdown), status, allocation, etc. Save calls `updateStudio` with the edited fields.
- **Pros**: Single place for all editable fields; room to add floor/notes later.  
- **Cons**: More UI work; might be more than you need if the only missing piece is grade.

### Recommendation

- **Implement Option A** so staff can change one studio’s grade from the Studios page without touching backend or RLS.
- **Optionally add Option B** if you often need to change grade for many studios at once.
- **Option C** is optional and useful if you want a general “edit studio” form later.

---

## 4. Safeguards / Edge Cases

1. **Application consistency**  
   After a grade change, existing applications still have `studio_grade_id` from the contract. That’s acceptable for “we reclassified this room”; reports that use `studios.studio_grade_id` will show the new grade. If you ever want to **block** changing grade when the studio is assigned to a confirmed application, that can be a follow-up (e.g. check in UI or in a small RPC).

2. **Validation**  
   New value must be a valid `studio_grades.id` (your dropdown will only list existing grades). DB FK already enforces this.

3. **Audit**  
   `useUpdateStudio` already logs to `logActivity` with “update” and payload; today it only logs status/allocation/is_active. Extend that payload to include `studio_grade_id` when it’s in `rest`, so “grade change” is visible in activity/audit logs.

4. **Cache**  
   After update, `queryClient.invalidateQueries({ queryKey: ["admin-studios"] })` is already called in the mutation, so the list and filters (e.g. by grade) will refresh.

---

## 5. Summary

| Question | Answer |
|----------|--------|
| Can you change a studio’s room grade today? | **No** – not from the UI. |
| Does the backend allow it? | **Yes** – RLS and hooks allow updating `studio_grade_id`. |
| What’s missing? | **UI only**: a way to choose a new grade and call the existing update (single or bulk). |
| Recommended first step? | **Option A**: add a grade dropdown (or “Change grade”) per studio on the Studios page and call `updateStudio` with `studio_grade_id`. Optionally add **Option B** for bulk “Set grade”. |
| DB/RLS/trigger changes? | **None** required. |

No code has been changed; this is assessment and recommendation only.
