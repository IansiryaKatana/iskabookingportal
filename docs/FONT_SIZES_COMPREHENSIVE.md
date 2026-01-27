# Comprehensive Font Size Analysis - STUCOMMS Booking Portal

## Analysis Date
2025-02-14

## Base Body Font Size (Global)

**Location**: `src/index.css`

```css
body {
  font-size: 12px;  /* Mobile (< 768px) */
}

@media (min-width: 768px) {
  body {
    font-size: 16px;  /* Desktop (≥ 768px) */
  }
}
```

**Breakpoint**: `md` (768px)
- **Mobile**: 12px
- **Desktop (md+)**: 16px

---

## Tailwind Default Font Size Classes

### Standard Tailwind Classes (Relative to base font-size)

| Class | Rem Value | Mobile (12px base) | Desktop (16px base) | Usage Count |
|-------|-----------|-------------------|---------------------|-------------|
| `text-xs` | 0.75rem | **9px** | **12px** | ~500+ |
| `text-sm` | 0.875rem | **10.5px** | **14px** | ~800+ |
| `text-base` | 1rem | **12px** | **16px** | ~300+ |
| `text-lg` | 1.125rem | **13.5px** | **18px** | ~200+ |
| `text-xl` | 1.25rem | **15px** | **20px** | ~150+ |
| `text-2xl` | 1.5rem | **18px** | **24px** | ~100+ |
| `text-3xl` | 1.875rem | **22.5px** | **30px** | ~30 |
| `text-4xl` | 2.25rem | **27px** | **36px** | ~20 |
| `text-5xl` | 3rem | **36px** | **48px** | ~10 |
| `text-6xl` | 3.75rem | **45px** | **60px** | ~8 |
| `text-7xl` | 4.5rem | **54px** | **72px** | ~5 |
| `text-8xl` | 6rem | **72px** | **96px** | 0 |
| `text-9xl` | 8rem | **96px** | **128px** | 0 |

---

## Custom Font Sizes (Arbitrary Values)

### Custom Pixel Values

| Class | Pixel Value | Usage Location |
|-------|-------------|----------------|
| `text-[8px]` | 8px | `OTABookingChartPage.tsx` - Chart labels |
| `text-[9px]` | 9px | `BookingPanel.tsx` - Terms label |
| `text-[10px]` | 10px | Multiple files - Small badges, labels, calendar items |
| `text-[11px]` | 11px | `StudiosCatalog.tsx`, `ContractShowcase.tsx`, Login pages |
| `text-[0.8rem]` | 0.8rem | `calendar.tsx` - Calendar header cells |

### Custom Rem Values (in inline styles)

**Location**: `src/pages/admin/EmailTemplates.tsx` (Email template HTML)
- `font-size: 32px` - Email headers
- `font-size: 28px` - Email subheaders
- `font-size: 18px` - Email emphasis text
- `font-size: 16px` - Email body text
- `font-size: 14px` - Email footer text
- `font-size: 12px` - Email disclaimer text

**Location**: `src/pages/portal/ApplicationWizard.tsx` (Inline styles)
- `font-size: 0.95rem` - Custom form elements
- `font-size: 0.75rem` - Custom small text

---

## Responsive Font Size Combinations

### Mobile-First Responsive Patterns

#### Pattern 1: `text-xs md:text-sm`
**Mobile**: 9px → **Desktop**: 14px
- Used in: Labels, form fields, table headers, descriptions
- **Usage**: ~200+ instances
- **Examples**: 
  - `Label` components
  - `CardDescription` components
  - `TableHead` components
  - Muted text labels

#### Pattern 2: `text-sm md:text-base`
**Mobile**: 10.5px → **Desktop**: 16px
- Used in: Input fields, buttons, body text
- **Usage**: ~50+ instances
- **Examples**:
  - Input fields
  - Button text
  - Search inputs

#### Pattern 3: `text-base md:text-lg`
**Mobile**: 12px → **Desktop**: 18px
- Used in: Card titles, section headings
- **Usage**: ~100+ instances
- **Examples**:
  - `CardTitle` components
  - Section headings
  - Dialog titles

#### Pattern 4: `text-base md:text-xl`
**Mobile**: 12px → **Desktop**: 20px
- Used in: Larger headings
- **Usage**: ~20 instances
- **Examples**:
  - Page subtitles
  - Card titles with emphasis

#### Pattern 5: `text-lg md:text-xl`
**Mobile**: 13.5px → **Desktop**: 20px
- Used in: Medium headings
- **Usage**: ~10 instances

#### Pattern 6: `text-xl md:text-2xl`
**Mobile**: 15px → **Desktop**: 24px
- Used in: Stat numbers, large headings
- **Usage**: ~80+ instances
- **Examples**:
  - Dashboard stat cards
  - Financial numbers
  - OTA booking stats
  - Housekeeping stats

#### Pattern 7: `text-2xl md:text-3xl`
**Mobile**: 18px → **Desktop**: 30px
- Used in: Page titles, hero headings
- **Usage**: ~15 instances
- **Examples**:
  - Login page titles
  - Admin layout page titles
  - Reset password headings

#### Pattern 8: `text-2xl md:text-4xl`
**Mobile**: 18px → **Desktop**: 36px
- Used in: Large display numbers
- **Usage**: ~5 instances
- **Examples**:
  - Dashboard percentage displays
  - Large stat numbers

#### Pattern 9: `text-4xl md:text-5xl`
**Mobile**: 27px → **Desktop**: 48px
- Used in: Hero headings, large titles
- **Usage**: ~10 instances
- **Examples**:
  - Hero section titles
  - Contract detail pages
  - Studio catalog titles

#### Pattern 10: `text-4xl md:text-5xl lg:text-6xl`
**Mobile**: 27px → **Tablet**: 48px → **Desktop**: 60px
- Used in: Large hero headings
- **Usage**: ~8 instances
- **Examples**:
  - Login page hero text
  - Application wizard hero
  - Partner login hero

#### Pattern 11: `text-4xl md:text-6xl lg:text-7xl`
**Mobile**: 27px → **Tablet**: 60px → **Desktop**: 72px
- Used in: Extra large hero headings
- **Usage**: ~5 instances
- **Examples**:
  - Hero section main titles
  - Amenities section titles
  - Studio overview titles

#### Pattern 12: `text-[10px] md:text-xs`
**Mobile**: 10px → **Desktop**: 12px
- Used in: Very small text, badges
- **Usage**: ~20 instances
- **Examples**:
  - Calendar event text
  - Small badges
  - Booking calendar items

#### Pattern 13: `text-[10px] md:text-[11px]`
**Mobile**: 10px → **Desktop**: 11px
- Used in: Footer text, disclaimer text
- **Usage**: ~5 instances
- **Examples**:
  - Login page footer text
  - Auth page footer text

#### Pattern 14: `text-[10px] sm:text-xs`
**Mobile**: 10px → **Small screens (640px+)**: 12px
- Used in: Mobile-first small text
- **Usage**: ~10 instances
- **Examples**:
  - Notification badges
  - Mobile button text
  - Rebooking carousel text

#### Pattern 15: `text-3xl md:text-4xl`
**Mobile**: 22.5px → **Desktop**: 36px
- Used in: Partner login stats
- **Usage**: ~3 instances

---

## Component-Specific Font Sizes

### UI Components (Base Classes)

#### Card Component (`src/components/ui/card.tsx`)
- `CardTitle`: `text-2xl` (18px mobile / 24px desktop) - **Base class, often overridden**
- `CardDescription`: `text-sm` (10.5px mobile / 14px desktop)

#### Button Component (`src/components/ui/button.tsx`)
- Default: `text-sm` (10.5px mobile / 14px desktop)
- **Note**: Buttons often use custom sizes via className overrides

#### Calendar Component (`src/components/ui/calendar.tsx`)
- Header cells: `text-[0.8rem]` (9.6px mobile / 12.8px desktop)
- Day cells: `text-sm` (10.5px mobile / 14px desktop)

---

## Typography Standards (from `src/constants/ui-standards.ts`)

### Standard Heading Styles

| Style | Classes | Mobile | Desktop |
|-------|---------|--------|---------|
| H1 | `text-2xl font-display font-black uppercase tracking-wide` | 18px | 24px |
| H2 | `text-xl font-display font-bold uppercase tracking-wide` | 15px | 20px |
| H3 | `text-lg font-display font-semibold uppercase tracking-wide` | 13.5px | 18px |
| Card Title | `text-lg font-display uppercase tracking-wide` | 13.5px | 18px |
| Section Title | `text-xs uppercase tracking-[0.3em] text-muted-foreground` | 9px | 12px |

### Button Font Sizes

| Size | Classes | Mobile | Desktop |
|------|---------|--------|---------|
| Small | `text-xs` | 9px | 12px |
| Medium | `text-sm` | 10.5px | 14px |
| Large | `text-base` | 12px | 16px |

---

## Breakpoint Reference

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| `sm` | 640px | Small tablets, large phones |
| `md` | 768px | Tablets, small desktops (primary breakpoint) |
| `lg` | 1024px | Desktops |
| `xl` | 1280px | Large desktops |
| `2xl` | 1400px | Extra large desktops |

**Note**: The system primarily uses `md` (768px) as the main breakpoint for font size changes.

---

## Font Size Usage by Category

### Small Text (Labels, Captions, Muted Text)
- `text-xs` - 9px / 12px
- `text-[10px]` - 10px
- `text-[11px]` - 11px
- `text-sm` - 10.5px / 14px
- **Responsive**: `text-xs md:text-sm` (9px → 14px)

### Body Text
- `text-base` - 12px / 16px (matches body font-size)
- `text-sm` - 10.5px / 14px
- **Responsive**: `text-sm md:text-base` (10.5px → 16px)

### Headings (Card Titles, Section Headings)
- `text-base md:text-lg` - 12px → 18px
- `text-lg` - 13.5px / 18px
- `text-base md:text-xl` - 12px → 20px
- `text-xl` - 15px / 20px

### Large Headings (Page Titles)
- `text-2xl md:text-3xl` - 18px → 30px
- `text-3xl` - 22.5px / 30px
- `text-2xl md:text-4xl` - 18px → 36px

### Display Text (Hero Sections, Large Titles)
- `text-4xl` - 27px / 36px
- `text-4xl md:text-5xl` - 27px → 48px
- `text-4xl md:text-5xl lg:text-6xl` - 27px → 48px → 60px
- `text-4xl md:text-6xl lg:text-7xl` - 27px → 60px → 72px

### Stat Numbers (Dashboard, Financial)
- `text-xl md:text-2xl` - 15px → 24px (most common)
- `text-2xl md:text-4xl` - 18px → 36px (large stats)
- `text-3xl` - 22.5px / 30px (fixed size)

---

## Summary Statistics

### Most Used Font Size Classes
1. `text-xs` - ~500+ instances
2. `text-sm` - ~800+ instances
3. `text-base` - ~300+ instances
4. `text-lg` - ~200+ instances
5. `text-xl` - ~150+ instances
6. `text-2xl` - ~100+ instances

### Most Used Responsive Patterns
1. `text-xs md:text-sm` - ~200+ instances
2. `text-xl md:text-2xl` - ~80+ instances
3. `text-base md:text-lg` - ~100+ instances
4. `text-[10px] md:text-xs` - ~20 instances

### Custom Font Sizes
- `text-[8px]` - 1 instance
- `text-[9px]` - 1 instance
- `text-[10px]` - ~20 instances
- `text-[11px]` - ~5 instances
- `text-[0.8rem]` - 1 instance

---

## Notes

1. **Base Font Size**: The system uses a responsive base font size (12px mobile, 16px desktop) which affects all rem-based font sizes.

2. **Mobile-First Approach**: Most responsive font sizes follow a mobile-first pattern where smaller sizes are default and larger sizes apply at `md` breakpoint and above.

3. **Display Font**: Big Shoulders Display is used for headings with `font-display` class, typically with `font-bold` or `font-black` weights.

4. **Body Font**: Inter Tight is used for body text with `font-sans` class (default).

5. **Consistency**: The system follows consistent patterns for similar use cases (e.g., all stat numbers use `text-xl md:text-2xl`).

6. **Custom Sizes**: Custom pixel values are used sparingly, primarily for very small text (8-11px) where standard Tailwind sizes don't provide enough granularity.

---

## Files Analyzed

- All `.tsx` files in `src/` directory
- `src/index.css` - Base font size definitions
- `src/App.css` - Additional styles
- `tailwind.config.ts` - Tailwind configuration
- `src/constants/ui-standards.ts` - Typography standards
- `src/components/ui/*.tsx` - UI component base classes
- `docs/FONT_UX_FIXES.md` - Font fix documentation
- `docs/architecture-spec.md` - Architecture specifications

---

*This document was generated through comprehensive analysis of the entire codebase.*







