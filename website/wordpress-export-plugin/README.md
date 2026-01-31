# Yoast Blog & SEO Exporter Plugin

A safe, read-only WordPress plugin to export all blog posts with complete Yoast SEO data.

## 🛡️ Safety Features

- **Read-Only**: This plugin only reads data - it never modifies, deletes, or changes anything
- **Security Checks**: Uses WordPress nonces and capability checks
- **No Database Changes**: Does not create, modify, or delete any database tables
- **Standard WordPress Practices**: Follows WordPress coding standards

## 📦 Installation

1. **Download the plugin folder** (`wordpress-export-plugin`)
2. **Upload to WordPress**:
   - Via FTP: Upload the entire `wordpress-export-plugin` folder to `/wp-content/plugins/`
   - Via Admin: Zip the folder and upload via Plugins → Add New → Upload Plugin
3. **Activate the plugin**: Go to Plugins → Installed Plugins → Activate "Yoast Blog & SEO Exporter"

## 🚀 Usage

1. Go to **Tools → Export Blog & SEO**
2. Choose export format:
   - **JSON** (Recommended): Most complete, includes all data including schema
   - **CSV**: Easy to view in Excel/Google Sheets
3. Select options:
   - Post status (Published only or All)
   - Include media URLs
   - Include schema data
4. Click **"Export Blog Posts & SEO Data"**
5. Download will start automatically

## 📊 What Gets Exported

✅ **Post Content:**
- Title, slug, content, excerpt
- Publication date, status
- Author information

✅ **Yoast SEO Data:**
- Meta title and description
- Focus keyword/keyphrase
- Canonical URL
- Robots meta (noindex, nofollow)

✅ **Social Media:**
- Open Graph tags (title, description, image)
- Twitter Card data

✅ **Additional:**
- Featured image URL and alt text
- Categories and tags
- Schema.org JSON-LD data (if available)
- Attachment URLs

## 🔒 Security

- Requires `export` capability (administrators have this by default)
- Uses WordPress nonces for form security
- All user input is sanitized
- No file system writes (only reads)

## ⚠️ Important Notes

- This plugin is **completely safe** - it only reads data
- It does not modify your WordPress installation in any way
- You can deactivate/delete it anytime without any impact
- Large sites (1000+ posts) may take a few minutes to export

## 🐛 Troubleshooting

**Export is slow:**
- Normal for sites with many posts
- Consider exporting in smaller batches if needed

**Missing SEO data:**
- Some posts may not have Yoast SEO data if they were created before Yoast was installed
- This is expected and normal

**Permission errors:**
- Make sure you're logged in as an administrator
- Check that your user has the `export` capability

## 📝 Support

If you encounter any issues:
1. Check that Yoast SEO is installed and active
2. Verify you have administrator access
3. Check WordPress error logs if export fails

## 🗑️ Uninstallation

Simply deactivate and delete the plugin. No data is stored, so removal is clean and safe.
