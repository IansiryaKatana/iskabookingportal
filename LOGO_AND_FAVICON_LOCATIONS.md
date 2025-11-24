# Logo and Favicon Locations in System

## 📁 File Locations

### Favicon
- **Location**: `public/favicon.png`
- **Type**: PNG image file

### Logo
- **Location**: `src/assets/urban-hub-logo.webp`
- **Type**: WebP image file

---

## 🔍 Where Favicon is Used

### 1. **HTML Head** (`index.html`)
```html
Line 16: <link rel="icon" type="image/png" href="/favicon.png" />
Line 18: <meta property="og:image" content="/favicon.png" />
Line 22: <meta name="twitter:image" content="/favicon.png" />
```
- Browser tab favicon
- Open Graph image for social sharing
- Twitter card image

### 2. **Admin Login Page** (`src/pages/admin/Login.tsx`)
```tsx
Line 49: <img src="/favicon.png" alt="Urban Hub" className="h-12 w-12" />
```
- Displayed in the login card header

### 3. **Partner Login Page** (`src/pages/partner/Login.tsx`)
```tsx
Line 57: <img src="/favicon.png" alt="Urban Hub" className="h-12 w-12" />
```
- Displayed in the login card header

### 4. **Email Templates** (`src/pages/admin/EmailTemplates.tsx`)
```tsx
Line 143: const logoUrl = "{logo_url}"; // Placeholder
Line 175: <img src="${logoUrl}" alt="Urban Hub" class="logo" ...>
```
- Used in email template previews
- Replaced with actual URL when sending emails

### 5. **Email Sending Edge Function** (`supabase/functions/send-bulk-message/index.ts`)
```typescript
Line 383: const logoUrl = `${baseUrl}/storage/v1/object/public/studio-media/favicon.png`;
Line 384: emailBodyHtml = emailBodyHtml.replace(/{logo_url}/g, logoUrl);
```
- Replaces `{logo_url}` placeholder in email templates
- Uses Supabase Storage path: `/storage/v1/object/public/studio-media/favicon.png`

### 6. **Portal Notifications** (`src/pages/portal/Notifications.tsx`)
```tsx
Line 202: const logoUrl = window.location.origin + "/favicon.png";
Line 207: .replace(/{logo_url}/g, logoUrl)
```
- Used when displaying email notifications in the portal
- Replaces `{logo_url}` placeholder in notification HTML

---

## 🎨 Where Logo is Used

### 1. **Navigation Component** (`src/components/Navigation.tsx`)
```tsx
Line 7: import logo from "@/assets/urban-hub-logo.webp";
Line 137: <img src={logo} alt="Urban Hub" className="h-8 md:h-12" />
```
- Main site navigation header
- Centered logo on desktop, left-aligned on mobile
- Responsive sizing: h-8 (mobile) to h-12 (desktop)

### 2. **Footer Component** (`src/components/Footer.tsx`)
```tsx
Line 5: import logo from "@/assets/urban-hub-logo.webp";
Line 56: <img src={logo} alt="Urban Hub" className="h-12" />
```
- Footer section logo
- Fixed height: h-12

---

## 📊 Summary

### Favicon (`/favicon.png`)
- ✅ Browser tab icon
- ✅ Social media sharing images (OG, Twitter)
- ✅ Admin login page
- ✅ Partner login page
- ✅ Email templates (via edge function from Supabase Storage)
- ✅ Portal notifications

### Logo (`src/assets/urban-hub-logo.webp`)
- ✅ Main navigation header
- ✅ Footer

---

## ⚠️ Important Notes

1. **Email Logo Path Mismatch**: 
   - The edge function uses: `/storage/v1/object/public/studio-media/favicon.png`
   - But the actual favicon is at: `/public/favicon.png`
   - **This might cause emails to not show the logo correctly!**

2. **Storage Location**: 
   - The edge function expects the favicon to be in Supabase Storage bucket `studio-media`
   - If it's not there, email logos won't work

3. **Logo Format**:
   - Logo uses WebP format (modern, optimized)
   - Favicon uses PNG format (universal compatibility)

---

## 🔧 Recommendations

1. **Upload favicon to Supabase Storage** if you want it to work in emails:
   - Bucket: `studio-media`
   - Path: `favicon.png`

2. **Or update the edge function** to use the public URL:
   ```typescript
   const logoUrl = `${baseUrl}/favicon.png`;
   ```

3. **Consider using the logo** (`urban-hub-logo.webp`) in emails instead of favicon for better branding

