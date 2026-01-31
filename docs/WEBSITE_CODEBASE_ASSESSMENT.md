# Website Codebase Assessment – Full Outline

**Booking Portal**: Portal.urbanhub.uk  
**Website**: Urbanhub.uk  
**Assessment Date**: January 2026  
**Scope**: website directory – every page, hook, component, library, and portal integration point.

---

## 1. Project structure and libraries

### 1.1 Directory layout

```
website/
├── public/           (_redirects, favicon, placeholder, robots.txt)
├── src/
│   ├── About/        (facility images – static)
│   ├── Homepage/     (lifestyle images – static)
│   ├── assets/       (amenity/studio images – static)
│   ├── components/   (UI, contact, leads, admin, animations)
│   ├── contexts/     (AuthContext)
│   ├── hooks/        (useBranding, useStudioAvailability, useContactForm, etc.)
│   ├── integrations/supabase/  (client, types → types.generated)
│   ├── lib/          (utils)
│   ├── pages/        (Index, StudiosCatalog, About, Blog, BlogDetail, Contact, FAQ, ShortTerm, NotFound)
│   └── utils/        (getDefaultRoute, wordpressXmlParser)
├── supabase/migrations/  (001_blog_seo_tables.sql)
├── wordpress-export-plugin/
├── urbanhub-studentsaccommodation.WordPress.2026-01-27.xml
├── SEO_MIGRATION_AND_ADMIN_PLAN.md
├── WORDPRESS_EXPORT_INSTRUCTIONS.md
├── WORDPRESS_IMPORT_SETUP.md
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

### 1.2 Dependencies (package.json)

**UI / layout**  
- react, react-dom, react-router-dom  
- @radix-ui/* (accordion, dialog, tabs, etc.)  
- framer-motion, gsap  
- embla-carousel-react, embla-carousel-autoplay  
- lucide-react, react-icons  
- next-themes, vaul (drawer), cmdk  

**Forms / validation**  
- react-hook-form, @hookform/resolvers, zod  

**Data / backend**  
- @supabase/supabase-js  
- @tanstack/react-query  
- date-fns  

**Other**  
- @stripe/react-stripe-js, @stripe/stripe-js  
- recharts  
- jspdf, jspdf-autotable  
- libphonenumber-js, react-international-phone  
- country-list  
- sonner, tailwind-merge, class-variance-authority, clsx  

**Note**: Website uses same stack as portal (Supabase, React Query, shadcn-style Radix, etc.). No separate “website-only” DB client; single Supabase client for both portal data and website tables.

---

## 2. Routes and pages

### 2.1 Route definition

**File**: `src/components/AnimatedRoutes.tsx`

| Route            | Component      | Notes                          |
|------------------|----------------|--------------------------------|
| `/`              | Index          | Redirects to `/studios/{year}` |
| `/studios`       | StudiosCatalog |                                |
| `/studios/:year` | StudiosCatalog |                                |
| `/contact`       | Contact        |                                |
| `/faq`           | FAQ            |                                |
| `/blog`          | Blog           |                                |
| `/blog/:slug`    | BlogDetail     |                                |
| `/about`         | About          |                                |
| `/short-term`    | ShortTerm      |                                |
| `*`              | NotFound       | Catch-all                      |

**Gap**: There is **no** route for `/studios/:year/:slug` (studio grade detail).  
StudiosCatalog and About both use `<Link to={/studios/${year}/${grade.slug}}>`. That path is not defined in AnimatedRoutes, so it falls through to `*` → NotFound. Either add a StudioGradeDetail route (e.g. landing + CTA to portal) or change these links to point directly to Portal (e.g. `https://portal.urbanhub.uk/studios/${year}/${slug}`).

### 2.2 Page-by-page summary

- **Index** (`src/pages/Index.tsx`)  
  - Redirects to most recent active academic year `/studios/{year}`.  
  - **Portal DB**: `academic_years` (read: name, is_active, start_date, order).

- **StudiosCatalog** (`src/pages/StudiosCatalog.tsx`)  
  - Hero, year tabs, studio grade cards (gallery, price, availability), “Book Now” links, amenities carousel, “Why Choose Us”, testimonials, lead form.  
  - **Portal DB**: `academic_years`, `studio_grades`, `studio_grade_media`, `studio_grade_prices` (via inner join), `studio_grade_availability_by_year` (via hook).  
  - **Links**: “Book Now” → `/studios/${year}/${grade.slug}` (no matching route – see above).  
  - **Static/hardcoded**: Amenities list, “Why Us” features, testimonials (with video URLs).  
  - **Branding**: useBrandingSetting("studio_catalog_hero_image"), useBrandingSettings().

- **About** (`src/pages/About.tsx`)  
  - Video hero, facilities (static images from `About/Facilities/`), studio cards with availability, pricing.  
  - **Portal DB**: `academic_years`, `studio_grades`, `studio_grade_media`, `studio_grade_prices`.  
  - **Links**: Studio cards → `/studios/${year}/${grade.slug}` and `/studios/${studio.slug}` (same route gap).  
  - **Static**: Facility images, copy.

- **Blog** (`src/pages/Blog.tsx`)  
  - List: featured + “Top Reads” + grid; categories; search.  
  - **DB**: `blog_posts` (with `blog_categories`), filtered by `status = 'published'`.  
  - **Tables**: Website migration (`blog_posts`, `blog_categories`) – same Supabase project, no `website_` prefix.

- **BlogDetail** (`src/pages/BlogDetail.tsx`)  
  - Single post by slug; related posts by category.  
  - **DB**: `blog_posts`, `blog_categories`.  
  - **Bug**: Related posts query uses `.eq("category_slug", ...)` but `blog_posts` has `category_id` / relation to `blog_categories`, not a `category_slug` column – filter should use category id or join.

- **Contact** (`src/pages/Contact.tsx`)  
  - Hero, ContactForm.  
  - **Portal DB**: `social_media_settings` (WhatsApp url, is_enabled).  
  - **Form submit**: useContactForm → POST to external webhook (see below), not Supabase.

- **FAQ** (`src/pages/FAQ.tsx`)  
  - Accordion/tabs of Q&A.  
  - **Data**: Hardcoded `faqData` in component; **no** DB.  
  - **Recommendation**: Move to `website_faqs` (or equivalent) and load from DB.

- **ShortTerm** (`src/pages/ShortTerm.tsx`)  
  - Two forms (tourist / keyworker); submit via useShortTermForm.  
  - **Form submit**: POST to external webhook only; **no** direct Supabase.

- **NotFound** (`src/pages/NotFound.tsx`)  
  - No Supabase.

---

## 3. Portal database integration – exact locations

All read/write below use the **same** Supabase client as the portal (`src/integrations/supabase/client.ts`), i.e. **one** Supabase project for both portal and website.

### 3.1 Reads from portal tables (website reads portal data)

| File | Table / view | Purpose |
|------|----------------|--------|
| `pages/Index.tsx` | `academic_years` | Active year name for redirect to `/studios/{year}` |
| `pages/StudiosCatalog.tsx` | `academic_years` | Year list and selected year |
| `pages/StudiosCatalog.tsx` | `studio_grades` + `studio_grade_media` + `studio_grade_prices` (join) | Catalog cards, gallery, weekly price |
| `pages/StudiosCatalog.tsx` | (via hook) `studio_grade_availability_by_year` | Availability tags (“Going Fast”, “X Left”, “Fully Booked”) |
| `pages/About.tsx` | `academic_years` | Single active year for pricing |
| `pages/About.tsx` | `studio_grades` + `studio_grade_media` | Grade list + galleries |
| `pages/About.tsx` | `studio_grade_prices` | Weekly price per grade for selected year |
| `hooks/useStudioAvailability.ts` | `studio_grade_availability` | Per-grade, per-contract availability |
| `hooks/useStudioAvailability.ts` | `studio_grade_availability_by_year` | Per-year availability for catalog |
| `hooks/useBranding.ts` | `branding_settings` | All setting_key / setting_value (company name, logo, contact, etc.) |
| `hooks/useBranding.ts` | `navigation_items` | Header/footer links (location, display_order) |
| `hooks/useBranding.ts` | `opening_hours` | Footer opening hours |
| `components/Footer.tsx` | `social_media_settings` | Social links (platform, url, is_enabled, display_order) |
| `components/WhatsAppButton.tsx` | `social_media_settings` | WhatsApp url for floating button |
| `pages/Contact.tsx` | `social_media_settings` | WhatsApp url for contact hero |
| `contexts/AuthContext.tsx` | `profiles` | Role, name, etc. after auth |
| `utils/getDefaultRoute.ts` | `route_permissions` | Allowed routes by role (admin/portal) |
| `components/ProtectedRoute.tsx` | `route_permissions` | Per-route permission for current role |
| `hooks/usePageTitle.ts` | `studio_grades` | Grade name by slug for document title on `/studios/.../slug` |

So: **portal** tables used by the website are  
`academic_years`, `studio_grades`, `studio_grade_media`, `studio_grade_prices`, `studio_grade_availability`, `studio_grade_availability_by_year`, `branding_settings`, `navigation_items`, `opening_hours`, `social_media_settings`, `profiles`, `route_permissions`.

### 3.2 Writes to shared / website tables (same project)

| File | Table(s) | Operation |
|------|----------|-----------|
| `components/admin/WordPressImport.tsx` | `blog_categories`, `blog_tags`, `blog_post_tags`, `blog_posts`, `seo_pages` | Insert/update from WordPress import |

No other website code writes to the DB in the repo. Contact, callback, short-term forms use **webhooks** (different Supabase project), not direct inserts.

### 3.3 Blog/SEO tables (website migration, same DB)

**Migration**: `website/supabase/migrations/001_blog_seo_tables.sql`  
**Tables**: `seo_pages`, `blog_categories`, `blog_posts`, `blog_tags`, `blog_post_tags`, `media_library`, `content_blocks`.  
**Naming**: No `website_` prefix; they live in the same `public` schema as portal tables.

**Used by**:

- **Blog.tsx**: `blog_posts`, `blog_categories` (read).
- **BlogDetail.tsx**: `blog_posts`, `blog_categories` (read); related posts query is wrong (see above).
- **WordPressImport.tsx**: `blog_categories`, `blog_tags`, `blog_post_tags`, `blog_posts`, `seo_pages` (write/upsert).

---

## 4. External webhooks (different Supabase project)

These point at **another** Supabase project (`btbsslznsexidjnzizre`), not the portal project.

| File | URL | Purpose |
|------|-----|--------|
| `hooks/useContactForm.ts` | `CONTACT_WEBHOOK_URL` → `.../wordpress-webhook` | Contact form submit |
| `hooks/useLeadsCRM.ts` | `WEBHOOK_URL` → `.../wordpress-webhook` | Book viewing / callback |
| `hooks/useShortTermForm.ts` | `SHORT_TERM_WEBHOOK_URL` → `.../wordpress-webhook` | Short-term (tourist/keyworker) |

So: contact, callback, and short-term submissions do **not** hit the portal DB; they go to an edge function on a different project. For “Form submissions (callback, viewing, contact/inquiry) CRUD” and storing in portal/website DB, you will need either to switch to portal project (e.g. edge function + `website_form_submissions` or portal tables) or to add a separate store in the portal DB and call it from the website.

---

## 5. Types and Supabase client

- **Client**: `src/integrations/supabase/client.ts` – single `createClient<Database>(...)` using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (portal project).
- **Types**: `src/integrations/supabase/types.ts` re-exports `./types.generated`.  
- **types.generated**: Not in the repo; must be generated from the **portal** Supabase project (so it includes `academic_years`, `studio_grades`, `branding_settings`, etc.). Website code that uses `Database["public"]["Tables"]["..."]` (e.g. StudiosCatalog, About, AuthContext, getDefaultRoute) assumes portal schema.  
- **Blog/SEO tables**: If they are created only in `website/supabase/migrations/`, they may not be in the same project as the one used for `types.generated` today; then either run that migration in the portal project or generate types from the DB that includes both portal and website tables.

---

## 6. Auth and protected routes

- **AuthContext**: Uses Supabase Auth + `profiles` (portal). Same auth and roles as portal (student, staff, superadmin, partner, admin, subroles).
- **ProtectedRoute**: Uses `route_permissions` (portal) for allowed routes; redirects to `/admin`, `/portal/login`, etc. So website app is aware of portal/admin routes even though it only renders website pages.
- **Navigation**: “Portal” / “Account” links to `/portal/login`, `/portal`, or `/admin` (same origin). For deployment, if the website is at Urbanhub.uk and the portal at Portal.urbanhub.uk, these must become cross-origin (e.g. `https://portal.urbanhub.uk/login` etc.) or you need a single domain with path-based split.

---

## 7. Gaps and alignment with recommendations

### 7.1 Routing and “Book Now”

- **Current**: “Book Now” and studio cards link to `/studios/${year}/${grade.slug}`. No route for that path → NotFound.
- **Required**: Either  
  - add a route `/studios/:year/:slug` that shows a studio grade page and a clear CTA to “Book on Portal” → `https://portal.urbanhub.uk/studios/${year}/${slug}`, or  
  - change all these links to point directly to `https://portal.urbanhub.uk/studios/${year}/${slug}`.

### 7.2 Naming and schema

- **Recommendation (WEBSITE_ARCHITECTURE_RECOMMENDATIONS.md)**: New website tables use `website_` prefix in the **same** Supabase project.
- **Current**: `001_blog_seo_tables.sql` creates `seo_pages`, `blog_posts`, `blog_categories`, etc. **without** `website_` prefix.
- **Action**: Either rename to `website_*` in a new migration (and update Blog, BlogDetail, WordPressImport) or explicitly document that blog/SEO stay unprefixed and only **new** tables (FAQs, amenities, why-us, media, form submissions, etc.) use `website_*`.

### 7.3 Data not yet in DB

- **FAQ**: All content is hardcoded in FAQ.tsx. Should be moved to a table (e.g. `website_faqs`) and loaded from DB.
- **Amenities (homepage / about)**: Currently static lists + static or asset images. Recommendations: `website_amenities` with title, short_description, photos (min 2), vertical vs horizontal image for homepage vs about.
- **Why Us cards**: Hardcoded in StudiosCatalog. Should be in `website_why_us_cards` (icon, title, description).
- **Testimonials / media**: Hardcoded with video URLs. Should be in `website_media` (title, subtitle, video, cover desktop/mobile) and optionally a testimonials table.
- **Room grade bullet points**: Pricing comes from portal (`studio_grade_prices`); bullet points should be in a website-only table (e.g. `website_studio_grade_features`) so they don’t clash with portal data.
- **Form submissions**: Contact, callback, short-term currently only go to webhooks. To have “Form submissions CRUD” in the website admin, store submissions in the portal DB (e.g. `website_form_submissions`) and either call an edge function in the portal project or write from the website app with RLS.

### 7.4 Blog

- **Read implementation**: Blog and BlogDetail read from `blog_posts` / `blog_categories`. No `website_post_reads` or view-count tracking yet; add when you implement “blog read” tracking (e.g. `website_post_reads` + optional `view_count` on `website_posts`).
- **Related posts**: BlogDetail uses a filter that doesn’t match the schema (e.g. `category_slug` on `blog_posts`). Fix to use category id or join via `blog_categories`.

### 7.5 Domains

- **Current**: All links are same-origin (e.g. `/portal/login`, `/studios/...`).
- **Live**: Portal = Portal.urbanhub.uk, Website = Urbanhub.uk.
- **Action**:  
  - Replace internal `/portal/*` and `/admin/*` links with `https://portal.urbanhub.uk/...` (or your chosen portal base URL).  
  - Replace “Book Now”/studio links with `https://portal.urbanhub.uk/studios/${year}/${slug}` (or the route you define on the portal).  
  - Ensure CORS and redirects (e.g. Netlify `_redirects`) are set so that Urbanhub.uk serves the website and Portal.urbanhub.uk serves the portal.

---

## 8. Where to add or change integrations (checklist)

Use this when implementing migrations and dashboard.

### 8.1 Keep as-is (portal read-only)

- **Index**: `academic_years` – keep.
- **StudiosCatalog**: `academic_years`, `studio_grades`, `studio_grade_media`, `studio_grade_prices`, `studio_grade_availability_by_year` – keep; ensure RLS allows public (or anon) read where needed.
- **About**: Same as above for grades and prices – keep.
- **useBranding.ts**: `branding_settings`, `navigation_items`, `opening_hours` – keep.
- **Footer / Contact / WhatsAppButton**: `social_media_settings` – keep.
- **AuthContext**: `profiles` – keep.
- **getDefaultRoute.ts / ProtectedRoute.tsx**: `route_permissions` – keep (or adjust if website admin gets its own routes).
- **usePageTitle.ts**: `studio_grades` (name by slug) – keep.

### 8.2 Fix or add in website codebase

- **StudiosCatalog / About**: Fix “Book Now” and studio card links – either add `/studios/:year/:slug` and CTA to portal, or link directly to Portal.urbanhub.uk.
- **AnimatedRoutes**: Add route for `/studios/:year/:slug` if you keep an in-website studio grade page.
- **BlogDetail**: Fix related-posts query (use category id or relation, not `category_slug` on `blog_posts`).
- **Navigation**: Point “Portal” / “Account” and any “Book Now” to Portal.urbanhub.uk when the site is deployed at Urbanhub.uk.
- **Environment**: Ensure website `.env` uses portal Supabase URL/anon key for all current Supabase usage; webhook URLs for contact/leads/short-term stay as-is unless you move those to the portal project.

### 8.3 New backend (migrations + RLS)

- **website_amenities** – title, short_description, photos (min 2), vertical/horizontal image, display_order; used by homepage (title + vertical image) and about (title + description + horizontal image).
- **website_why_us_cards** – icon, title, description, display_order.
- **website_media** – title, subtitle, video, cover_image_desktop, cover_image_mobile; for testimonials/media section.
- **website_studio_grade_features** – studio_grade_id (FK to portal `studio_grades`), feature_text, display_order; for room-grade bullet points (pricing stays from portal).
- **website_faqs** – question, answer, category, display_order; replace hardcoded FAQ.
- **website_form_submissions** – form_type, name, email, phone, message, status, etc.; optionally back contact/callback/short-term from webhook into this table (e.g. via edge function in portal project).
- **website_posts** / **website_post_reads** – if you rename blog to `website_*` and add read tracking.
- **website_seo_settings**, **website_analytics_***, **website_activity_logs**, etc. – as in WEBSITE_ARCHITECTURE_RECOMMENDATIONS.md and WEBSITE_ARCHITECTURE_RECOMMENDATIONS (additional requirements).

### 8.4 Webhooks and form storage

- **Current**: Contact, callback, short-term → `btbsslznsexidjnzizre` Supabase project `wordpress-webhook`.
- **If you want form submissions in portal DB**: Add edge function(s) in the **portal** project that accept the same payloads and insert into `website_form_submissions` (and optionally notify); then either point website form hooks to that new function or keep existing webhook and have it call portal DB (e.g. server-side).

---

## 9. One-page reference: portal tables used by the website

| Table / view | Used in | Operation |
|--------------|---------|-----------|
| academic_years | Index, StudiosCatalog, About | SELECT |
| studio_grades | StudiosCatalog, About, usePageTitle | SELECT |
| studio_grade_media | StudiosCatalog, About | SELECT |
| studio_grade_prices | StudiosCatalog, About | SELECT |
| studio_grade_availability | useStudioAvailability | SELECT |
| studio_grade_availability_by_year | useStudioAvailability, StudiosCatalog, About | SELECT |
| branding_settings | useBranding (many components) | SELECT |
| navigation_items | useBranding, Footer, Navigation | SELECT |
| opening_hours | useBranding, Footer | SELECT |
| social_media_settings | Footer, WhatsAppButton, Contact | SELECT |
| profiles | AuthContext | SELECT (after auth) |
| route_permissions | getDefaultRoute, ProtectedRoute | SELECT |
| blog_posts | Blog, BlogDetail, WordPressImport | SELECT / INSERT/UPDATE |
| blog_categories | Blog, BlogDetail, WordPressImport | SELECT / INSERT |
| blog_tags, blog_post_tags | WordPressImport | INSERT |
| seo_pages | WordPressImport | INSERT/UPDATE |

Everything above is in one Supabase project except the webhook calls (contact, callback, short-term), which use a different project.

---

## 10. Summary

- **One codebase (website)**, **one Supabase project** (portal) for all DB access except webhooks.
- **Portal integration points**: All under §3 and §9; no other files touch the portal DB.
- **Missing route**: `/studios/:year/:slug`; links to it today 404.
- **Domain**: Switch to Portal.urbanhub.uk and Urbanhub.uk for links and env when going live.
- **Naming**: Decide whether blog/SEO stay unprefixed or get `website_` and migrate; all new tables use `website_*`.
- **Content to move to DB**: FAQs, amenities, why-us cards, media/testimonials, room-grade bullet points; form submissions if you want them in the admin.
- **Webhooks**: Contact/leads/short-term use a different Supabase project; form CRUD in admin implies storing in portal DB (e.g. `website_form_submissions`) via new edge function or backend.

This outline is the single reference for “where exactly” the website touches the booking portal database and what to add or change so nothing is missed when you add website-specific migrations and the website admin dashboard.
