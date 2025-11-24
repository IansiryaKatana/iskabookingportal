# Branding System Implementation Plan

## 📋 Current Hardcoded Values Found

### 1. **Logo** (2 locations)
- `src/components/Navigation.tsx` - Line 7, 137
- `src/components/Footer.tsx` - Line 5, 56
- Current: `src/assets/urban-hub-logo.webp`

### 2. **Favicon** (4 locations)
- `index.html` - Lines 16, 18, 22
- `src/pages/admin/Login.tsx` - Line 49
- `src/pages/partner/Login.tsx` - Line 57
- Current: `public/favicon.png`

### 3. **Header Navigation Items** (`src/components/Navigation.tsx`)
- Lines 129-133: HOME, ABOUT, FAQ, BLOG, CONTACT
- All hardcoded with `href="#"`

### 4. **Footer Quick Links** (`src/components/Footer.tsx`)
- Lines 81-100: Home, About Us, FAQ, Blog
- All hardcoded with `href="#"`

### 5. **Footer Contact Information** (`src/components/Footer.tsx`)
- Line 108: Phone: `+44 123 456 7890`
- Line 113: Email: `info@urbanhub.uk`
- Lines 118-120: Address: `123 Student Street, City Centre, Preston, PR1 1AA`

### 6. **Footer Opening Hours** (`src/components/Footer.tsx`)
- Line 128: `Monday - Friday: 9am - 6pm`
- Line 129: `Saturday: 10am - 4pm`
- Line 130: `Sunday: Closed`
- Line 132: `Emergency contact available 24/7`

### 7. **Footer Description** (`src/components/Footer.tsx`)
- Line 59: `Premium student accommodation designed for modern living and academic success.`

### 8. **Footer Credits** (`src/components/Footer.tsx`)
- Line 139: `© {year} Urban Hub. All rights reserved.`

---

## 🗄️ Database Schema Design

### Table 1: `branding_settings`
Stores main branding assets and text content.

```sql
CREATE TABLE public.branding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type TEXT NOT NULL, -- 'text', 'url', 'file_path'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Settings:**
- `logo_path` - Logo file path in storage
- `favicon_path` - Favicon file path in storage
- `footer_description` - Footer description text
- `footer_copyright_text` - Copyright text (e.g., "Urban Hub. All rights reserved.")
- `contact_phone` - Phone number
- `contact_email` - Email address
- `contact_address_line1` - Address line 1
- `contact_address_line2` - Address line 2
- `contact_address_line3` - Address line 3
- `contact_address_postcode` - Postcode
- `emergency_contact_text` - Emergency contact text

### Table 2: `navigation_items`
Stores header navigation items.

```sql
CREATE TABLE public.navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  location TEXT NOT NULL DEFAULT 'header', -- 'header' or 'footer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table 3: `opening_hours`
Stores structured opening hours.

```sql
CREATE TABLE public.opening_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_name TEXT NOT NULL, -- 'Monday', 'Tuesday', etc.
  day_order INTEGER NOT NULL, -- 1-7 for Mon-Sun
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  special_note TEXT, -- e.g., "Emergency contact available 24/7"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(day_name)
);
```

---

## 🎨 Admin Page Structure

### Page: `/admin/branding`

**Sections:**

1. **Logo & Favicon**
   - Upload logo (with preview)
   - Upload favicon (with preview)
   - Delete/replace functionality
   - Current file display

2. **Header Navigation**
   - Add/Edit/Delete navigation items
   - Drag to reorder
   - Toggle active/inactive
   - Title and URL fields

3. **Footer Quick Links**
   - Add/Edit/Delete footer links
   - Drag to reorder
   - Toggle active/inactive
   - Title and URL fields

4. **Contact Information**
   - Phone number
   - Email address
   - Address (3 lines + postcode)

5. **Opening Hours**
   - Day-by-day editor
   - Time pickers for open/close
   - Closed checkbox
   - Special notes field

6. **Footer Content**
   - Description textarea
   - Copyright text input

---

## 🔄 Component Updates Required

1. **Navigation.tsx**
   - Fetch navigation items from database
   - Fetch logo from branding settings
   - Render dynamically

2. **Footer.tsx**
   - Fetch all footer data from database
   - Fetch logo from branding settings
   - Render dynamically

3. **index.html**
   - Update favicon link dynamically (or use API endpoint)

4. **Login pages**
   - Fetch favicon from branding settings

---

## 📦 File Storage

- **Logo**: Upload to Supabase Storage bucket `branding` → `logo.webp`
- **Favicon**: Upload to Supabase Storage bucket `branding` → `favicon.png`
- Store paths in `branding_settings` table

---

## ✅ Implementation Steps

1. Create database migrations for tables
2. Create admin branding page with all sections
3. Add file upload functionality for logo/favicon
4. Update Navigation component to use dynamic data
5. Update Footer component to use dynamic data
6. Update login pages to use dynamic favicon
7. Add RLS policies
8. Seed initial data with current hardcoded values

---

## 🎯 Benefits

- ✅ No code changes needed for branding updates
- ✅ Easy to manage from admin panel
- ✅ Consistent branding across all pages
- ✅ Version control for branding assets
- ✅ Easy to add/remove navigation items
- ✅ Flexible opening hours management

