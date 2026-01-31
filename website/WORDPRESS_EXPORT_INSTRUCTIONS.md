# WordPress Blog Export Instructions - Yoast Premium

## 🎯 **Method 1: Yoast SEO Premium Export (Recommended)**

### **Step 1: Export via Yoast Premium Dashboard**

1. **Login to WordPress Admin**
   - Go to your WordPress admin panel
   - Navigate to: `SEO` → `Tools` → `Import and Export`

2. **Export SEO Data**
   - Click on **"Export"** tab
   - Select what to export:
     - ✅ **SEO Data** (meta titles, descriptions, focus keywords)
     - ✅ **Settings** (optional, for reference)
   - Click **"Download Export File"**
   - This will download a `.zip` file with your SEO data

3. **Export Posts via WordPress**
   - Go to: `Tools` → `Export`
   - Select **"Posts"** (or "All content" if you want everything)
   - Click **"Download Export File"**
   - This creates an XML file with all post content

### **Step 2: Using Yoast REST API (Alternative)**

If you have API access, you can export via REST API:

**URL Format:**
```
https://yourwordpresssite.com/wp-json/yoast/v1/posts
```

**Or for specific post:**
```
https://yourwordpresssite.com/wp-json/wp/v2/posts?per_page=100&_embed
```

This returns JSON with:
- Post content
- Yoast SEO meta (title, description, focus keyword)
- Featured images
- Categories/Tags

---

## 🔧 **Method 2: Using WP-CLI (If you have server access)**

If you have SSH/terminal access to your WordPress server:

```bash
# Export all posts with SEO data
wp post list --post_type=post --format=json > posts.json

# Export with Yoast SEO fields
wp post list --post_type=post --fields=ID,post_title,post_name,post_excerpt,post_date --format=json > posts.json

# Export post meta (includes Yoast SEO data)
wp post meta list --format=json > post_meta.json
```

---

## 📊 **Method 3: Direct Database Export (Most Complete)**

If you have database access (phpMyAdmin, cPanel, etc.):

### **SQL Query to Export Posts with Yoast SEO:**

```sql
SELECT 
    p.ID,
    p.post_title,
    p.post_name AS slug,
    p.post_content,
    p.post_excerpt,
    p.post_date,
    p.post_status,
    -- Yoast SEO Meta
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_title' THEN pm.meta_value END) AS yoast_title,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_metadesc' THEN pm.meta_value END) AS yoast_description,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_focuskw' THEN pm.meta_value END) AS focus_keyword,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_canonical' THEN pm.meta_value END) AS canonical_url,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_opengraph-title' THEN pm.meta_value END) AS og_title,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_opengraph-description' THEN pm.meta_value END) AS og_description,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_opengraph-image' THEN pm.meta_value END) AS og_image,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_twitter-title' THEN pm.meta_value END) AS twitter_title,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_twitter-description' THEN pm.meta_value END) AS twitter_description,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_twitter-image' THEN pm.meta_value END) AS twitter_image,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_meta-robots-noindex' THEN pm.meta_value END) AS noindex,
    MAX(CASE WHEN pm.meta_key = '_yoast_wpseo_meta-robots-nofollow' THEN pm.meta_value END) AS nofollow,
    -- Featured Image
    MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) AS featured_image_id
FROM wp_posts p
LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id
WHERE p.post_type = 'post' 
    AND p.post_status = 'publish'
GROUP BY p.ID
ORDER BY p.post_date DESC;
```

**Export Steps:**
1. Open phpMyAdmin or your database tool
2. Select your WordPress database
3. Go to **SQL** tab
4. Paste the query above
5. Click **"Go"**
6. Click **"Export"** → Choose **CSV** or **JSON** format
7. Download the file

---

## 🎨 **Method 4: Using Export Plugin (Easiest for Non-Technical)**

### **Install "Export URLs and Meta" Plugin:**

1. Go to: `Plugins` → `Add New`
2. Search for: **"Export URLs and Meta"**
3. Install and activate
4. Go to: `Tools` → `Export URLs and Meta`
5. Configure:
   - Post Type: **Posts**
   - Include: ✅ Meta Title, ✅ Meta Description, ✅ Focus Keyword
   - Format: **CSV**
6. Click **"Export"**
7. Download the CSV file

---

## 📦 **What Data You'll Get:**

After export, you should have:

✅ **Post Content:**
- Title
- Slug/URL
- Content (HTML)
- Excerpt
- Publication date
- Status

✅ **Yoast SEO Data:**
- Meta title
- Meta description
- Focus keyword
- Canonical URL
- Open Graph title/description/image
- Twitter Card title/description/image
- Robots meta (noindex/nofollow)

✅ **Media:**
- Featured image URL
- Image attachments

✅ **Taxonomy:**
- Categories
- Tags

---

## 🚀 **Recommended Approach:**

**For Best Results, Use Multiple Methods:**

1. **Primary:** Export via WordPress Tools → Export (XML file)
2. **Secondary:** Export Yoast SEO data via database query (SQL)
3. **Tertiary:** Use Export plugin for CSV format

**Why Multiple Methods?**
- XML export has all content but may miss some Yoast meta
- Database export has complete Yoast SEO data
- CSV is easiest to review/edit before import

---

## 📤 **After Export - What to Send Me:**

Once you have the files, you can:

1. **Share the files directly** (if they're not too large)
2. **Upload to Google Drive/Dropbox** and share link
3. **Paste sample data** (first 2-3 posts) so I can see the structure
4. **Describe the format** and I'll create the import tool accordingly

**I'll need:**
- ✅ Export file(s) (XML, CSV, or JSON)
- ✅ Sample of 2-3 blog posts (so I can see the data structure)
- ✅ Your WordPress site URL (for reference)

---

## ⚠️ **Important Notes:**

1. **Large Sites:** If you have 100+ posts, consider exporting in batches
2. **Media Files:** Featured images will need to be downloaded separately or we'll handle via URLs
3. **Schema Data:** Yoast may store schema in post meta - we'll extract that too
4. **Custom Fields:** If you have custom fields, let me know and I'll include them

---

## 🎯 **Next Steps:**

1. **Choose your export method** (I recommend Method 1 or 3)
2. **Export your data**
3. **Share the file(s) with me** or describe the structure
4. **I'll create the import tool** to map everything to your new database

**Ready?** Export your data and share it, and I'll build the import system! 🚀
