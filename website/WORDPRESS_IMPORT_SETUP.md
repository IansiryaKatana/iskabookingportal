# WordPress Import Setup Guide

## ✅ What's Been Created

### 1. **Database Schema** (`supabase/migrations/001_blog_seo_tables.sql`)
   - ✅ `seo_pages` - Stores all SEO metadata
   - ✅ `blog_posts` - Blog post content
   - ✅ `blog_categories` - Blog categories
   - ✅ `blog_tags` - Blog tags
   - ✅ `blog_post_tags` - Many-to-many relationship
   - ✅ `media_library` - Media file management
   - ✅ `content_blocks` - Flexible page content
   - ✅ Row Level Security (RLS) policies
   - ✅ Indexes for performance

### 2. **XML Parser** (`src/utils/wordpressXmlParser.ts`)
   - ✅ Parses WordPress WXR export files
   - ✅ Extracts posts, categories, tags, authors
   - ✅ Extracts all Yoast SEO data:
     - Meta titles & descriptions
     - Focus keywords
     - Open Graph tags
     - Twitter Card data
     - Canonical URLs
     - Robots meta

### 3. **Import Component** (`src/components/admin/WordPressImport.tsx`)
   - ✅ File upload interface
   - ✅ XML parsing preview
   - ✅ Progress tracking
   - ✅ Batch import with error handling
   - ✅ Automatic category/tag creation
   - ✅ SEO data mapping

---

## 🚀 Next Steps

### Step 1: Run Database Migration

1. **Connect to Supabase:**
   ```bash
   # If you have Supabase CLI installed
   supabase db push
   ```

2. **Or manually in Supabase Dashboard:**
   - Go to your Supabase project
   - Navigate to SQL Editor
   - Copy and paste the contents of `supabase/migrations/001_blog_seo_tables.sql`
   - Run the migration

### Step 2: Add Import Route to Admin Dashboard

You'll need to add the import component to your admin routes. Here's an example:

```tsx
// In your admin routes file
import WordPressImport from "@/components/admin/WordPressImport";

// Add route:
<Route 
  path="/admin/content/import" 
  element={
    <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
      <WordPressImport />
    </ProtectedRoute>
  } 
/>
```

### Step 3: Test the Import

1. **Access the import page** in your admin dashboard
2. **Upload your XML file** (`urbanhub-studentsaccommodation.WordPress.2026-01-27.xml`)
3. **Review the preview** - Check post count, categories, tags
4. **Click "Start Import"** - Watch the progress
5. **Verify imported data** in your database

---

## 📊 What Gets Imported

### From Your WordPress Export:

✅ **Blog Posts:**
- Title, slug, content, excerpt
- Publication date and status
- Author information
- WordPress ID (for reference)

✅ **SEO Data:**
- Meta title: `_yoast_wpseo_title`
- Meta description: `_yoast_wpseo_metadesc`
- Focus keyword: `_yoast_wpseo_focuskw`
- Canonical URL: `_yoast_wpseo_canonical`
- Open Graph title/description/image
- Twitter Card data
- Robots meta (noindex/nofollow)

✅ **Taxonomy:**
- Categories (with slugs)
- Tags (with slugs)

✅ **Relationships:**
- Post → Category
- Post → Tags (many-to-many)
- Post → SEO Page

---

## 🔍 Data Mapping

### WordPress → Your Database

| WordPress Field | Database Table | Column |
|----------------|----------------|--------|
| `wp:post_name` | `blog_posts` | `slug` |
| `title` | `blog_posts` | `title` |
| `content:encoded` | `blog_posts` | `content` |
| `excerpt:encoded` | `blog_posts` | `excerpt` |
| `wp:status` | `blog_posts` | `status` |
| `_yoast_wpseo_title` | `seo_pages` | `meta_title` |
| `_yoast_wpseo_metadesc` | `seo_pages` | `meta_description` |
| `_yoast_wpseo_focuskw` | `seo_pages` | `focus_keyword` |
| `category[domain="category"]` | `blog_categories` | `name`, `slug` |
| `category[domain="post_tag"]` | `blog_tags` | `name`, `slug` |

---

## ⚠️ Important Notes

### URL Structure
- WordPress URLs are converted to `/blog/{slug}` format
- SEO pages are created with the blog path
- Original WordPress URL is stored in `wordpress_url` field

### Featured Images
- Featured image URLs are preserved in the database
- You may want to download and upload to Supabase Storage separately
- The `featured_image_url` field stores the original WordPress URL

### Duplicate Handling
- Posts with existing slugs will be **updated** (not duplicated)
- Categories and tags are checked for existing slugs
- SEO pages are updated if they already exist

### Status Mapping
- `publish` → `published`
- `draft` → `draft`
- Other statuses → `draft`

---

## 🐛 Troubleshooting

### Import Fails
- Check that database tables exist (run migration)
- Verify RLS policies allow inserts
- Check browser console for errors
- Ensure you're logged in as admin

### Missing SEO Data
- Some posts may not have Yoast SEO data (normal)
- Check that meta fields exist in XML export
- Verify XML file is complete

### Categories/Tags Not Linking
- Check that categories/tags were imported first
- Verify slug matching is working
- Check database for `blog_post_tags` entries

---

## 📝 Next: Build Admin Dashboard Pages

After import, you'll want to create:

1. **Blog Management** (`/admin/content/blog`)
   - List all posts
   - Create/Edit/Delete posts
   - Filter by category/status

2. **SEO Management** (`/admin/seo/pages`)
   - Edit SEO for any page
   - Bulk edit capabilities
   - Preview meta tags

3. **Category Management** (`/admin/content/categories`)
   - Manage categories
   - Edit category SEO

4. **Media Library** (`/admin/media`)
   - Upload media
   - Manage files
   - Replace WordPress URLs

---

## ✅ Ready to Import!

Your WordPress export file is ready:
- **File:** `urbanhub-studentsaccommodation.WordPress.2026-01-27.xml`
- **Location:** Project root directory

**Next:** Run the database migration, then use the import tool in your admin dashboard!
