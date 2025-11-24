# UI/UX Standards - Urban Hub Booking Portal

This document defines the UI/UX standards for the Urban Hub Booking Portal to ensure consistency across the application.

## ⚠️ IMPORTANT: Do Not Override Standards

**Before changing any styling, typography, or component patterns, check `src/constants/ui-standards.ts` and use the defined constants.**

## Typography

### Font Families
- **Display Font**: `font-display` - Used for headings, titles, and prominent text
- **Body Font**: `font-sans` - Used for body text and descriptions

### Standard Heading Styles

```typescript
// Import from ui-standards.ts
import { TYPOGRAPHY } from "@/constants/ui-standards";

// Usage:
<h1 className={TYPOGRAPHY.heading.h1}>Title</h1>
<h2 className={TYPOGRAPHY.heading.h2}>Subtitle</h2>
<h3 className={TYPOGRAPHY.heading.h3}>Section</h3>
```

**Standard Classes:**
- H1: `text-2xl font-display font-black uppercase tracking-wide`
- H2: `text-xl font-display font-bold uppercase tracking-wide`
- H3: `text-lg font-display font-semibold uppercase tracking-wide`
- Card Title: `text-lg font-display uppercase tracking-wide`
- Section Title: `text-xs uppercase tracking-[0.3em] text-muted-foreground`

## Buttons

### Standard Button Classes

**Always include base classes:**
```typescript
className="rounded-full uppercase tracking-wide"
```

**Size variants:**
- Small: `text-xs h-7 px-2 gap-2`
- Medium: `text-sm h-9 px-4 gap-2`
- Large: `text-base h-11 px-6 gap-2`

**Mobile buttons:**
- Container: `flex items-center gap-2 flex-shrink-0`
- Button: `rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs`
- Icon-only: `h-7 w-7 p-0` (for icon-only buttons)

### Icon Sizes
- Small: `h-4 w-4` (default for buttons)
- Medium: `h-5 w-5`
- Large: `h-6 w-6`

### Mobile Action Buttons Pattern

When adding action buttons to mobile view, use this pattern:

```tsx
mobileActionButton={
  <div className="flex items-center gap-2 flex-shrink-0">
    {/* Secondary action (outline variant) */}
    <Button
      variant="outline"
      size="sm"
      className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
      onClick={handleSecondaryAction}
    >
      <Icon className="h-4 w-4" />
    </Button>
    {/* Primary action */}
    <Button
      size="sm"
      className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
      onClick={handlePrimaryAction}
    >
      <Icon className="h-4 w-4" />
    </Button>
  </div>
}
```

**Rules:**
1. Always wrap multiple buttons in a flex container with `gap-2`
2. Use icon-only buttons on mobile (no text labels)
3. Secondary actions use `variant="outline"`
4. Primary actions use default variant
5. All buttons must include: `rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs`

## Cards

### Standard Card Classes

- Main Card: `rounded-3xl border border-border/60 shadow-xl`
- Content Card: `rounded-2xl border border-border/60`
- Nested Card: `rounded-xl border border-border/60 bg-muted/40`

## Spacing

### Standard Spacing Classes

- Section: `space-y-6`
- Card: `space-y-4`
- Form: `space-y-4`
- List: `space-y-3`

## Dialogs

### Standard Dialog Classes

- Content: `rounded-3xl`
- Title: Use `TYPOGRAPHY.heading.h2`

## Forms

### Standard Form Classes

- Field Container: `space-y-2`
- Label: `text-sm font-medium`
- Input: `rounded-xl`
- Textarea: `rounded-xl min-h-[80px]`

## Mobile Responsiveness

### Key Principles

1. **Columns in desktop → Rows on mobile**: Use `flex-col md:flex-row`
2. **Flex on fields**: Form fields should flex appropriately on mobile
3. **Dialog forms**: Enter from bottom, `margin-bottom: 0`
4. **Action buttons**: Icon-only on mobile, full text on desktop
5. **Button container**: Always use `flex items-center gap-2 flex-shrink-0` for mobile action buttons

## Examples

### Example: Mobile Action Buttons

```tsx
// ✅ CORRECT
mobileActionButton={
  <div className="flex items-center gap-2 flex-shrink-0">
    <Button
      variant="outline"
      size="sm"
      className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
      onClick={handleDuplicate}
    >
      <Copy className="h-4 w-4" />
    </Button>
    <Button
      size="sm"
      className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
      onClick={handleCreate}
    >
      <Plus className="h-4 w-4" />
    </Button>
  </div>
}

// ❌ INCORRECT - Missing container, wrong classes
mobileActionButton={
  <Button onClick={handleCreate}>Create</Button>
}
```

### Example: Typography

```tsx
// ✅ CORRECT
<CardTitle className="text-lg font-display uppercase tracking-wide">
  Instalment schedules
</CardTitle>

// ❌ INCORRECT - Missing standard classes
<CardTitle className="text-xl font-bold">
  Instalment schedules
</CardTitle>
```

## Enforcement

When reviewing code:
1. Check that buttons use standard classes
2. Verify mobile action buttons follow the pattern
3. Ensure typography uses standard heading styles
4. Confirm spacing follows standard patterns

## Academic Year Tabs

### Standard Design Pattern

Academic year selection tabs use a red-themed segmented control design:

**Container:**
- Background: `bg-primary/60` (lighter red)
- Shape: `rounded-full`
- Height: `h-12`
- Padding: `p-1.5`
- Gap: `gap-1.5 md:gap-2`
- Width: `w-auto` (fits content, not full width)

**Active Tab:**
- Background: `bg-primary` (darker red - full primary color)
- Text: `text-white`
- Shadow: `shadow-md`
- Classes: `data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md`

**Inactive Tab:**
- Background: `bg-transparent` (shows lighter container background)
- Text: `text-white/90`
- Hover: `hover:bg-primary/40`
- Classes: `data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/90`

**Text Format:**
- Display full year format: "2026/2027" (not abbreviated "26/27")
- Font: `font-semibold`
- Size: `text-xs md:text-sm`
- Tracking: `uppercase tracking-wide`

**Example Implementation:**
```tsx
<TabsList className="inline-flex h-12 items-center justify-center rounded-full bg-primary/60 p-1.5 gap-1.5 md:gap-2 shadow-sm">
  <TabsTrigger
    value={year.name}
    className="rounded-full uppercase tracking-wide text-xs md:text-sm font-semibold px-4 md:px-6 py-2 md:py-2.5 flex-shrink-0 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all data-[state=inactive]:bg-transparent data-[state=inactive]:text-white/90 hover:data-[state=inactive]:bg-primary/40"
  >
    {year.name}
  </TabsTrigger>
</TabsList>
```

**Visual Result:**
- Red container with lighter red background
- Active tab: darker red with shadow (stands out)
- Inactive tab: transparent (shows lighter container background)
- Both tabs have white text for contrast
- Compact width (fits content, not full width)

## Updates

If you need to update a standard:
1. Update `src/constants/ui-standards.ts`
2. Update this documentation
3. Search for all usages and update them
4. Document the change reason

