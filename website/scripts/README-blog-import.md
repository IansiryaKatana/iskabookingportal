# Blog CSV import and image download

## Your CSV file (`website blogs.csv`)

Your CSV has the right structure for the admin import:

- **ID, Title, Content, Excerpt, Date, Post Type, Permalink** – core post data  
- **Image URL** – featured image (we try to download and host, or use the URL as-is)  
- **Categories, Tags** – comma-separated; we create/link categories and tags  
- **Yoast SEO:** `_yoast_wpseo_focuskw`, `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`,  
  `_yoast_wpseo_opengraph-title`, `_yoast_wpseo_opengraph-description`,  
  `_yoast_wpseo_twitter-description` – mapped to `seo_pages` and post SEO  
- **Status, Slug, Author Username, Author Email, Author First Name, Author Last Name**

## 1. Admin: Import from CSV (recommended)

1. In **Website Admin → Blog**, click **Import from CSV**.
2. Choose your **website blogs.csv** (or any export with the same column names).
3. Optionally leave **“Try to download images and host in storage”** checked.  
   - If the image server allows CORS, images are downloaded and stored in the `website` bucket.  
   - If not (e.g. many WordPress hosts), we still save the **Image URL** as `featured_image_url`, so images show from the original source.
4. Click **Start import**.  
   Posts are created/updated with:
   - Excerpt, content, featured image (URL or our storage)
   - SEO: meta title, meta description, focus keyphrase, OG title/description, Twitter description  
   - Categories and tags created and linked

That gives you your exact blogs (content, excerpt, SEO, featured image URL) without running any script.

## 2. Optional: Download images and host them (Node script)

If you want **all** featured images **downloaded and hosted in Supabase** (so they don’t depend on the original site), you can run the script after the CSV import:

1. In your **website** project root, ensure `.env` has:
   - `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`  
   (Service role key: Supabase Dashboard → Project Settings → API → `service_role`.)

2. From the **website** directory run:
   ```bash
   node scripts/import-blog-images.mjs
   ```
   Or with a specific CSV path:
   ```bash
   node scripts/import-blog-images.mjs "website blogs.csv"
   ```

The script:

- Reads the CSV (default: `website blogs.csv` in the project root).
- For each row: fetches **Image URL**, uploads to the `website` bucket under `blog/`, then updates `blog_posts.featured_image_url` for the post with that **Slug**.

After it runs, your posts use Supabase-hosted images instead of the original URLs.

## Summary

- **Yes, it’s possible:** your CSV has everything we need (excerpt, content, SEO, featured image URL, etc.).
- **Admin “Import from CSV”** creates/updates posts with that data and optionally tries to download images (CORS permitting).
- **Node script** is optional and only for re-hosting all featured images in Supabase when the browser can’t fetch them (e.g. CORS).
