# Website Architecture & Database Strategy Recommendations

## Executive Summary

This document provides comprehensive recommendations for architecting the Urban Hub website (urbanhub.uk) as a separate webapp from the booking portal (portal.urbanhub.uk), including database strategy, integration patterns, and admin dashboard requirements.

---

## Current State Analysis

### Existing System
- **Booking Portal**: Live at `portal.urbanhub.uk`
- **Database**: Single Supabase project (`pzptocwdaqpczexlbajr`)
- **Website Directory**: Exists but outdated (you've been working on UI/UX on a copy)
- **Key Portal Tables**: 
  - `academic_years`, `studio_grades`, `studios`, `studio_grade_prices`
  - `studio_grade_availability_by_year` (view for availability)
  - `contracts`, `student_applications`

### Website Requirements
1. **Public Website** (urbanhub.uk)
   - Display studio grades with availability
   - Link to portal for booking (when studio grade clicked from specific academic year)
   - Content pages, blog, reviews, contact forms

2. **Website Admin Dashboard**
   - Website activity log
   - Website users admin
   - SEO editor
   - Manager & Analyst roles
   - Traffic analysis (Google Analytics integration)
   - Blog CRUD (table row list layout)
   - Comments on posts CRUD (table row list layout)
   - Reviews CRUD (table row list layout)
   - Form submissions (callback, viewing, contact/inquiry) CRUD (table row list layout)
   - Google Analytics integration settings and live checker
   - Button tagging for analytics tracking CRUD (table row list layout)
   - Users CRUD (table row list layout)

---

## Database Architecture Recommendation

### ✅ **RECOMMENDED: Same Supabase Project with Schema Segregation**

**Why this approach:**
1. **Shared Data Access**: Website needs real-time availability data from portal
2. **Cost Efficiency**: Single Supabase project is more cost-effective
3. **Simplified Integration**: No cross-project authentication complexity
4. **Data Consistency**: Single source of truth for studio data
5. **Easier Maintenance**: One database to manage, backup, and monitor

**Implementation Strategy:**

#### 1. Schema Naming Convention
Use table prefixes to clearly segregate website vs portal data:

**Portal Tables** (existing - no changes needed):
- `academic_years`
- `studio_grades`
- `studios`
- `studio_grade_prices`
- `studio_grade_availability_by_year` (view)
- `contracts`
- `student_applications`
- `profiles` (shared - but with role segregation)
- etc.

**Website Tables** (new - prefixed with `website_`):
- `website_posts` (blog posts)
- `website_post_comments`
- `website_reviews`
- `website_form_submissions`
- `website_analytics_events` (button tracking)
- `website_seo_settings`
- `website_activity_logs`
- `website_users` (if separate from portal users)

**Shared/Cross-Reference Tables**:
- `profiles` (shared user base - use `role` field to distinguish: `student`, `staff`, `partner`, `superadmin`, `website_admin`, `website_manager`, `website_analyst`)
- Consider `website_user_roles` junction table if you need more granular permissions

#### 2. Row Level Security (RLS) Policies

**Portal Data Access:**
```sql
-- Website can read portal data (studio grades, availability)
-- But cannot modify it
CREATE POLICY "website_read_studio_grades"
ON studio_grades FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('website_admin', 'website_manager', 'website_analyst', 'staff', 'superadmin')
  )
  OR true -- Public read access for studio grades
);
```

**Website Data Access:**
```sql
-- Only website admins can manage website content
CREATE POLICY "website_manage_posts"
ON website_posts FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('website_admin', 'website_manager', 'superadmin')
  )
);
```

#### 3. Database Views for Website

Create read-only views that aggregate portal data for website consumption:

```sql
-- View for website to consume studio availability
CREATE VIEW website_studio_availability AS
SELECT 
  sg.id as studio_grade_id,
  sg.slug,
  sg.name,
  sg.short_description,
  ay.id as academic_year_id,
  ay.name as academic_year_name,
  sga.available_count,
  sga.total_capacity,
  sga.availability_percentage
FROM studio_grades sg
JOIN studio_grade_availability_by_year sga ON sg.id = sga.studio_grade_id
JOIN academic_years ay ON sga.academic_year_id = ay.id
WHERE sg.is_active = true
AND ay.is_active = true;
```

---

## Integration Architecture

### 1. Data Flow: Portal → Website

**Studio Availability Integration:**
- Website reads from `studio_grade_availability_by_year` view (read-only)
- Real-time updates via Supabase Realtime subscriptions (optional)
- Or periodic polling (every 30-60 seconds)

**Studio Grade Details:**
- Website reads from `studio_grades`, `studio_grade_media`, `studio_grade_amenities`
- Public read access via RLS policies

**Academic Year Selection:**
- Website reads from `academic_years` table
- Filters by `is_active = true`

### 2. Navigation Flow: Website → Portal

**When user clicks a studio grade:**
```
Website: /studios/{year}/{grade-slug}
  ↓
Redirect to Portal: /studios/{year}/{grade-slug}
  ↓
Portal loads contract detail page for that grade/year
```

**Implementation:**
```typescript
// In website StudiosCatalog component
const handleStudioGradeClick = (gradeSlug: string, academicYear: string) => {
  // Redirect to portal with same URL structure
  window.location.href = `https://portal.urbanhub.uk/studios/${academicYear}/${gradeSlug}`;
};
```

### 3. Webhook Integration (Optional)

If you need website to send data to portal (e.g., form submissions that create leads):

**Option A: Direct Database Write** (Recommended if same project)
- Website admin creates records in portal tables directly
- Use RLS policies to control access

**Option B: Supabase Edge Function** (If you want API layer)
- Create edge function: `website-to-portal-lead`
- Website calls edge function with form data
- Edge function validates and creates portal records

**Option C: External Webhook** (If separate projects)
- Website sends HTTP POST to portal webhook endpoint
- Portal processes and stores data

---

## Admin Dashboard Architecture

### 1. User Roles & Permissions

**New Roles to Add:**
- `website_admin` - Full website management
- `website_manager` - Content management (blog, reviews, forms)
- `website_analyst` - Analytics and reporting only
- `website_seo_editor` - SEO settings only

**Role Hierarchy:**
```
superadmin > website_admin > website_manager > website_analyst > website_seo_editor
```

**Implementation:**
```sql
-- Add new roles to profiles.role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'website_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'website_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'website_analyst';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'website_seo_editor';
```

### 2. Admin Dashboard Features

#### A. Website Activity Log
**Table:** `website_activity_logs`
```sql
CREATE TABLE website_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'create_post', 'update_review', 'delete_comment', etc.
  entity_type TEXT NOT NULL, -- 'post', 'review', 'comment', 'form_submission'
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Filter by user, action, entity type, date range
- Search functionality
- Export to CSV
- Table row layout

#### B. Website Users Admin
**Table:** `website_users` (or extend `profiles` with website-specific fields)
```sql
-- Option 1: Extend profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website_permissions JSONB;

-- Option 2: Separate table (if you need website-specific user data)
CREATE TABLE website_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  website_role TEXT, -- 'author', 'editor', 'contributor'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- List all website users
- Create/edit/delete users
- Assign roles
- Table row layout with search and filters

#### C. SEO Editor
**Table:** `website_seo_settings`
```sql
CREATE TABLE website_seo_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT UNIQUE NOT NULL, -- '/', '/studios', '/blog/post-slug'
  page_type TEXT NOT NULL, -- 'home', 'catalog', 'blog_post', 'review'
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT[],
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  twitter_card_type TEXT, -- 'summary', 'summary_large_image'
  canonical_url TEXT,
  robots_meta TEXT, -- 'noindex', 'nofollow', etc.
  structured_data JSONB, -- JSON-LD schema
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Per-page SEO settings
- Preview functionality (how it appears in search results)
- Bulk edit capabilities
- Template system for common page types

#### D. Google Analytics Integration
**Table:** `website_analytics_settings`
```sql
CREATE TABLE website_analytics_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_analytics_id TEXT, -- GA4 Measurement ID
  google_tag_manager_id TEXT,
  api_key TEXT, -- For GA4 Reporting API (encrypted)
  view_id TEXT,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT, -- 'success', 'error', 'pending'
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Connect Google Analytics account
- Live connection status checker
- Real-time traffic data display
- Traffic analysis dashboard (page views, sessions, users, bounce rate)
- Date range filtering
- Export reports

**Implementation:**
- Use Google Analytics Data API (GA4)
- Store API credentials in `credentials` table (encrypted)
- Edge function: `sync-google-analytics` for periodic data sync
- Real-time widget in admin dashboard

#### E. Blog CRUD
**Table:** `website_posts`
```sql
CREATE TABLE website_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL, -- Rich text/HTML
  featured_image_url TEXT,
  author_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'archived'
  published_at TIMESTAMPTZ,
  category_id UUID REFERENCES website_categories(id),
  tags TEXT[],
  seo_settings_id UUID REFERENCES website_seo_settings(id),
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Full CRUD operations
- Rich text editor (Tiptap or similar)
- Image upload to Supabase Storage
- Categories and tags
- Draft/Published status
- Table row layout with:
  - Title, Author, Status, Published Date, Views
  - Quick actions (Edit, Delete, View)
  - Search and filters (status, author, date range)

#### F. Comments CRUD
**Table:** `website_post_comments`
```sql
CREATE TABLE website_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES website_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES website_post_comments(id), -- For nested replies
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_website TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'spam', 'trash'
  ip_address INET,
  user_agent TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Full CRUD operations
- Moderation workflow (approve/reject/spam)
- Nested replies support
- Table row layout with:
  - Post, Author, Content preview, Status, Date
  - Bulk actions (approve, spam, delete)
  - Search and filters

#### G. Reviews CRUD
**Table:** `website_reviews`
```sql
CREATE TABLE website_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  featured BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  verified_purchase BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Full CRUD operations
- Star rating system (1-5)
- Moderation workflow
- Featured reviews
- Table row layout with:
  - Reviewer, Rating, Title, Status, Date
  - Bulk actions
  - Search and filters (rating, status, date)

#### H. Form Submissions CRUD
**Table:** `website_form_submissions`
```sql
CREATE TABLE website_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL, -- 'contact', 'callback', 'viewing', 'inquiry'
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  metadata JSONB, -- Additional form fields
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'read', 'replied', 'archived'
  assigned_to UUID REFERENCES auth.users(id),
  read_at TIMESTAMPTZ,
  read_by UUID REFERENCES auth.users(id),
  replied_at TIMESTAMPTZ,
  replied_by UUID REFERENCES auth.users(id),
  notes TEXT, -- Internal notes
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Full CRUD operations
- Status workflow (new → read → replied → archived)
- Assignment to staff members
- Internal notes
- Table row layout with:
  - Type, Name, Email, Status, Date
  - Quick actions (Mark as Read, Reply, Archive)
  - Search and filters (type, status, date range, assigned to)

#### I. Button Tagging for Analytics
**Table:** `website_analytics_events`
```sql
CREATE TABLE website_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL, -- 'button_click', 'form_submit', 'link_click'
  element_id TEXT, -- Button ID or selector
  element_text TEXT, -- Button text
  page_path TEXT NOT NULL,
  metadata JSONB, -- Additional event data
  user_id UUID REFERENCES auth.users(id), -- If logged in
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Table:** `website_analytics_tags` (for managing button tags)
```sql
CREATE TABLE website_analytics_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name TEXT UNIQUE NOT NULL,
  element_selector TEXT NOT NULL, -- CSS selector or element ID
  event_name TEXT NOT NULL DEFAULT 'button_click',
  category TEXT, -- 'engagement', 'conversion', 'navigation'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features:**
- Full CRUD for button tags
- Automatic event tracking via JavaScript
- Event analytics dashboard
- Table row layout for tags management
- Event log viewer

---

## Implementation Roadmap

### Phase 1: Database Setup (Week 1)
1. ✅ Create website schema tables
2. ✅ Set up RLS policies
3. ✅ Create database views for portal data access
4. ✅ Add new user roles
5. ✅ Set up storage buckets for website media

### Phase 2: Website Admin Dashboard (Weeks 2-3)
1. ✅ Authentication & role-based access
2. ✅ Layout and navigation
3. ✅ Activity log viewer
4. ✅ Users management
5. ✅ SEO editor
6. ✅ Google Analytics integration

### Phase 3: Content Management (Weeks 4-5)
1. ✅ Blog CRUD
2. ✅ Comments CRUD
3. ✅ Reviews CRUD
4. ✅ Form submissions CRUD
5. ✅ Button tagging CRUD

### Phase 4: Integration & Testing (Week 6)
1. ✅ Portal data integration (availability)
2. ✅ Navigation flow (website → portal)
3. ✅ End-to-end testing
4. ✅ Performance optimization

---

## Alternative: Separate Supabase Project

### When to Consider This:
- If you need complete data isolation
- If portal and website have different compliance requirements
- If you want separate billing/resource allocation

### Implementation:
1. **Portal Project**: Keep existing project as-is
2. **Website Project**: New Supabase project
3. **Integration Methods**:
   - **Option A**: Supabase Edge Function in portal project exposes API
   - **Option B**: Direct database connection (service role key) - less secure
   - **Option C**: Webhook-based integration

### Challenges:
- More complex authentication
- Data synchronization complexity
- Higher costs (2 projects)
- More maintenance overhead

---

## Security Considerations

### 1. RLS Policies
- Portal data: Read-only for website, write-only for portal
- Website data: Role-based access control
- Public data: Studio grades, availability (read-only)

### 2. API Keys & Secrets
- Store Google Analytics API keys in `credentials` table (encrypted)
- Use Supabase Edge Functions for sensitive operations
- Never expose service role keys to frontend

### 3. Rate Limiting
- Implement rate limiting for form submissions
- Protect against spam in comments/reviews
- Use Supabase Edge Functions with rate limiting

---

## Cost Considerations

### Same Project (Recommended):
- **Supabase Pro**: ~$25/month (if under limits)
- **Storage**: Shared between portal and website
- **Edge Functions**: Shared quota
- **Database**: Single instance

### Separate Projects:
- **Supabase Pro x2**: ~$50/month
- **Storage**: Separate buckets
- **Edge Functions**: Separate quotas
- **Database**: Two instances

**Recommendation**: Start with same project, migrate to separate if needed later.

---

## Migration Strategy

### If You Choose Same Project:
1. No migration needed - just add new tables
2. Update RLS policies
3. Add new roles to existing `profiles` table

### If You Choose Separate Project:
1. Create new Supabase project
2. Set up website tables
3. Create integration layer (Edge Functions or webhooks)
4. Migrate website users (if any)
5. Set up cross-project authentication (complex)

---

## Final Recommendation

### ✅ **Use Same Supabase Project with Schema Segregation**

**Reasons:**
1. ✅ Simpler integration (shared database)
2. ✅ Real-time availability data access
3. ✅ Cost-effective
4. ✅ Easier maintenance
5. ✅ Single source of truth
6. ✅ Can migrate to separate project later if needed

**Implementation:**
- Use `website_` prefix for all website tables
- Extend `profiles.role` enum with website roles
- Create RLS policies for proper access control
- Use database views for portal data consumption
- Store sensitive credentials in `credentials` table (encrypted)

---

## Next Steps

1. **Review this document** and confirm approach
2. **Create database migration** for website tables
3. **Set up RLS policies** for data segregation
4. **Build admin dashboard** structure
5. **Implement integration** with portal data
6. **Test end-to-end** flow

---

## Questions to Consider

1. **User Authentication**: Will website users be separate from portal users, or shared?
   - **Recommendation**: Shared `profiles` table with role-based access

2. **Form Submissions**: Should website form submissions create leads in portal?
   - **Recommendation**: Yes, create records in portal's lead/application system

3. **Blog Authors**: Can portal staff be blog authors?
   - **Recommendation**: Yes, allow `staff` role to create blog posts

4. **Analytics**: Real-time or periodic sync?
   - **Recommendation**: Periodic sync (every hour) + real-time widget for current session

5. **SEO**: Per-page or template-based?
   - **Recommendation**: Both - templates for common pages, per-page override

---

## Additional Website Content Requirements

### ⚠️ **IMPORTANT: These are observations from UI/UX work - to be implemented when website directory is updated**

The following additional tables and features are required based on website design:

#### 1. Website Amenities
**Table:** `website_amenities`
- **Purpose**: Website-specific amenities display (separate from portal amenities)
- **Fields Required**:
  - `title` - Amenity title
  - `short_description` - Brief description
  - `photos` - Minimum 2 photos per amenity (stored in Supabase Storage)
  - `display_order` - For ordering on website
  - `is_active` - Show/hide amenity

**Display Requirements**:
- **Homepage**: Title and vertical image (image only, no description)
- **About Page**: Title, description, and horizontal image

**Storage**: `website-amenities/{amenity_id}/{photo_uuid}.{ext}`

#### 2. Why Us Cards
**Table:** `website_why_us_cards`
- **Purpose**: Feature cards explaining why choose Urban Hub
- **Fields Required**:
  - `icon` - Icon identifier or icon URL
  - `title` - Card title
  - `description` - Card description text
  - `display_order` - For ordering
  - `is_active` - Show/hide card

#### 3. Media Upload/Management
**Table:** `website_media`
- **Purpose**: Manage website media assets (videos, images)
- **Fields Required**:
  - `title` - Media title
  - `subtitle` - Media subtitle
  - `media_type` - 'video' or 'image'
  - `video_url` - Video URL (if type is video)
  - `cover_image_desktop` - Cover image for desktop
  - `cover_image_mobile` - Cover image for mobile (optional, falls back to desktop)
  - `storage_path` - Path in Supabase Storage
  - `display_order` - For ordering
  - `is_active` - Show/hide media

**Storage**: `website-media/{media_id}/cover-desktop.{ext}`, `website-media/{media_id}/cover-mobile.{ext}`, `website-media/{media_id}/video.{ext}`

#### 4. Room Grade Bullet Points
**Table:** `website_studio_grade_features`
- **Purpose**: Website-specific bullet points/features for each studio grade (separate from portal data)
- **Fields Required**:
  - `studio_grade_id` - References `studio_grades.id` (portal table)
  - `feature_text` - Bullet point text
  - `display_order` - For ordering
  - `is_active` - Show/hide feature

**Note**: Pricing section pulls from portal (`studio_grade_prices`), but bullet points are website-specific to avoid clashing with portal data.

#### 5. FAQs (Frequently Asked Questions)
**Table:** `website_faqs`
- **Purpose**: Manage all FAQs for the website
- **Fields Required**:
  - `question` - FAQ question
  - `answer` - FAQ answer (rich text/HTML)
  - `category` - Optional category grouping
  - `display_order` - For ordering
  - `is_active` - Show/hide FAQ
  - `helpful_count` - Track if FAQ was helpful (optional)

#### 6. Blog Read Implementation
**Table:** `website_post_reads` (or extend `website_posts`)
- **Purpose**: Track blog post reads/views
- **Fields Required**:
  - `post_id` - References `website_posts.id`
  - `user_id` - References `auth.users.id` (if logged in, nullable)
  - `session_id` - Anonymous session identifier
  - `ip_address` - IP address (for analytics)
  - `read_at` - Timestamp
  - `read_duration` - How long user spent reading (optional)

**Implementation Advice**:
- Use `IntersectionObserver` API to track when post enters viewport
- Track scroll depth (25%, 50%, 75%, 100%)
- Store read events in `website_post_reads` table
- Update `website_posts.view_count` on read
- Consider time-based reads (e.g., 30+ seconds = full read)

#### 7. Amenities/Facilities Display Logic

**Homepage Display**:
- Query: `SELECT title, vertical_image FROM website_amenities WHERE is_active = true ORDER BY display_order`
- Show: Title + Vertical Image only (no description)

**About Page Display**:
- Query: `SELECT title, description, horizontal_image FROM website_amenities WHERE is_active = true ORDER BY display_order`
- Show: Title + Description + Horizontal Image

**Storage Structure**:
- `website-amenities/{amenity_id}/vertical.{ext}` - For homepage
- `website-amenities/{amenity_id}/horizontal.{ext}` - For about page
- `website-amenities/{amenity_id}/gallery/{photo_uuid}.{ext}` - Additional photos (min 2)

---

## Updated Database Schema Quick Reference

### Website Tables (Complete List)

**Content Management**:
- `website_posts` - Blog posts
- `website_post_comments` - Comments on posts
- `website_post_reads` - Blog read tracking
- `website_reviews` - Reviews
- `website_faqs` - Frequently asked questions
- `website_categories` - Blog categories
- `website_tags` - Blog tags

**Website-Specific Content**:
- `website_amenities` - Website amenities (title, desc, photos - min 2 each)
- `website_why_us_cards` - Why us feature cards (icon, title, desc)
- `website_media` - Media uploads (title, subtitle, video, cover images)
- `website_studio_grade_features` - Room grade bullet points (website-specific)

**Forms & Submissions**:
- `website_form_submissions` - Contact/callback/inquiry forms

**Analytics & Tracking**:
- `website_analytics_events` - Button click tracking
- `website_analytics_tags` - Button tag definitions
- `website_analytics_settings` - Google Analytics configuration

**SEO & Settings**:
- `website_seo_settings` - SEO metadata per page

**Admin & Management**:
- `website_activity_logs` - Admin activity tracking
- `website_users` - Website users (or extend profiles)

---

## Appendix: Database Schema Quick Reference

### Website Tables (New)
- `website_posts` - Blog posts
- `website_post_comments` - Comments on posts
- `website_reviews` - Reviews
- `website_form_submissions` - Contact/callback/inquiry forms
- `website_analytics_events` - Button click tracking
- `website_analytics_tags` - Button tag definitions
- `website_seo_settings` - SEO metadata per page
- `website_analytics_settings` - Google Analytics configuration
- `website_activity_logs` - Admin activity tracking
- `website_categories` - Blog categories
- `website_tags` - Blog tags (or use JSONB array in posts)

### Portal Tables (Existing - Read Access)
- `academic_years` - Academic year definitions
- `studio_grades` - Studio grade information
- `studio_grade_media` - Studio images/videos
- `studio_grade_availability_by_year` - Availability view
- `contracts` - Contract details
- `studios` - Studio inventory

### Shared Tables
- `profiles` - User profiles (extend with website roles)
- `credentials` - API keys and secrets (encrypted)

---

**Document Version**: 1.1  
**Last Updated**: January 27, 2026  
**Author**: AI Assistant  
**Status**: Recommendations for Review - Additional Requirements Added

**Changelog**:
- v1.1: Added additional website content requirements (amenities, why us cards, media upload, room grade features, FAQs, blog reads)
- v1.0: Initial recommendations document
