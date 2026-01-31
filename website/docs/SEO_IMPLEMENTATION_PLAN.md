# SEO Implementation Plan – Website Pages

**Purpose:** Exact recommendations for every website page. No code changes until you decide. Use this as the single checklist for SEO work.

---

## 1. What search engines and SEO tools check (priority order)

| Factor | What crawlers use it for | Current / recommended |
|--------|---------------------------|------------------------|
| **DOM output** | First paint, structure, accessibility | Ensure one `<main>`, clear hierarchy; avoid layout thrash. |
| **Loading time (LCP, FID, CLS)** | Core Web Vitals; ranking and UX | Measure with Lighthouse; lazy-load below-fold images; minimise main-thread work. |
| **H1 / H2 / H3 / paragraphs** | Topic and hierarchy | One H1 per page; logical H2 → H3; body in `<p>`. |
| **Readability** | UX and engagement signals | Short sentences, subheadings, lists; avoid walls of text. |
| **Internal linking (in text)** | Crawl paths and topical relevance | Links inside body copy (not only nav/buttons) to key pages. |
| **Page structure** | Semantics and outline | `<main>`, `<section>` with `aria-labelledby`, `<article>` for list items. |
| **Content readability** | Dense vs scannable | Line length, contrast, font size; avoid tiny or low-contrast text. |
| **Meta title** | SERP title (click-through) | **50–60 characters** (Google ~600px; ~60 chars safe). |
| **Meta description** | SERP snippet | **120–158 characters** (155–160 ideal; show in UI with limit). |
| **OG / Twitter** | Social and rich results | Title, description, image per page; image alt/title for SEO. |

---

## 2. Meta title and meta description – character limits (UX, not labels)

**Recommended limits (industry 2024–2025):**

- **Meta title:** **60 characters** hard max. Soft “sweet spot” 50–60. (Google truncates by pixel width; ~60 chars is a safe cap.)
- **Meta description:** **160 characters** hard max. Soft “sweet spot” 155–158. (SERPs often show ~155–160.)

**Admin UI (SEO Management) – recommendations:**

1. **Character count (UX, not label-only)**  
   - Show a **live character count** under (or next to) each field, e.g. `42 / 60` for meta title and `98 / 160` for meta description.  
   - No need to change the label text; the count is the limit indicator.

2. **Visual feedback**  
   - **Green** or neutral when within range (e.g. title ≤ 60, description ≤ 160).  
   - **Amber** when near limit (e.g. title 56–60, description 155–160).  
   - **Red** when over limit (e.g. title > 60, description > 160).  
   Optionally prevent saving when over limit or show a warning.

3. **Apply to:**  
   - Page SEO form: Meta title, Meta description.  
   - General SEO: Default meta title, Default meta description.  
   - Same limits and behaviour for OG title/description and Twitter title/description if you want consistency in social snippets.

4. **Enforcement**  
   - Either: hard cap at 60 / 160 (truncate or block input), or: allow over but always show count and red state so staff know it may be truncated in SERPs.

---

## 3. Search engine preview (when SEO fields are filled)

**Recommendation:** In the **Edit page SEO** (and optionally **Add page SEO**) form, add a **“Search preview”** block that appears when the required fields are filled (e.g. meta title + meta description).

- **Content:**  
  - **Title line:** Same as meta title (or default), in a serif or standard font, blue, single line (truncate with “…” if over ~60 chars in the preview).  
  - **URL line:** Green, e.g. `https://yoursite.com/page-path` (from `canonical_url` or `site_url + page_path`).  
  - **Description line:** Same as meta description, 2–3 lines, grey; truncate if long.  

- **Placement:**  
  - Directly under “Search meta” (meta title + meta description) or in a collapsible “Preview” section so it’s visible without scrolling.

- **Behaviour:**  
  - Update live as the user types (or on blur) so staff see how the page will look in Google once the fields are saved.

- **Optional:**  
  - Small caption: “How this page may appear in Google search results.”

This is “preview when fields are filled”, not a separate “preview” button; no backend change required beyond using existing meta + canonical/site URL.

---

## 4. SEO images – titles and meta descriptions

**Recommendation:**

- **Per-page OG / Twitter image:**  
  - In `seo_pages`: `og_image_url`, `twitter_image_url` already exist.  
  - Ensure admin can set **one image per page** (or fallback to default).  
  - No separate “image meta description” is standard; the **page** meta description is what search engines use.  

- **Image alt text (accessibility + SEO):**  
  - For **all content images** (hero, amenities, blog featured, etc.): require or encourage **alt text** (e.g. in `website_media`, `website_amenities`, blog post featured image, `media_library.alt_text`).  
  - Use short, descriptive phrases (e.g. “Urban Hub building exterior”) rather than “image” or file name.  

- **Image “title” for SEO:**  
  - Optional: where you have an image upload (e.g. OG image), allow an optional “Image title” or “Caption” stored in DB and output as `og:image:alt` (and in `<img>` title if needed).  
  - Not mandatory for basic SEO; prioritise meta title/description and alt text first.

**Implementation plan items:**  
1) Add/use alt text on all content images.  
2) In admin, for OG/Twitter image uploads, optional “title” or “alt” that maps to `og:image:alt` and/or `<img alt>`.  
3) No separate “image meta description” field unless you want a custom social description for the image card.

---

## 5. Perfect structure (per page) – checklist

- **Every page:**  
  - One `<main>` wrapping primary content.  
  - One visible **H1** (or one H1 in DOM that matches the main topic).  
  - H2 → H3 hierarchy (no H3 without H2, no H4 without H3).  
  - Sections use `<section>` and, where useful, `aria-labelledby` pointing to the section heading id.  
  - List of items (reviews, blog cards, studios) in `<article>` where appropriate.  
  - Body content in `<p>`; lists in `<ul>`/`<ol>`.  

- **Technical:**  
  - Meta title and description from one source of truth (see below).  
  - Canonical URL set (from `seo_pages` or fallback to current URL).  
  - OG and Twitter tags set for every public page.  
  - No duplicate H1s; no empty headings.

---

## 6. Current state vs recommendations (page by page)

### 6.1 Route and SEO source

- **Index (`/`):** Redirects to `/studios/:year`. No DOM content for crawlers; SEO is effectively for the destination.  
  - **Recommendation:** Keep redirect. Ensure **Studios** page SEO is used for path `/studios` and, if you use a **normalised path** for SEO (see below), for `/studios/:year` (e.g. lookup by `/studios` so one `seo_pages` row covers all years).

- **Studios home (`/studios`, `/studios/:year`):**  
  - **Current:** `seo_pages` has `/studios` only. `MetaTagsUpdater` uses `location.pathname`, so `/studios/2025-26` does **not** match and gets default meta.  
  - **Recommendation:** Normalise SEO lookup: for paths like `/studios`, `/studios/2025-26`, use **one** key (e.g. `/studios`) so the same meta title/description/OG apply to all academic-year URLs. Implement in `usePageSeo` or in the component that calls it (e.g. map `/studios/:year` → `/studios` for SEO only).

- **Contact (`/contact`):**  
  - **Current:** Page sets its own `document.title`, meta description, OG, Twitter in `useEffect`. `seo_pages` has a row for `/contact` but **MetaTagsUpdater** runs first; then Contact’s `useEffect` overwrites. So DB SEO is not the source of truth here.  
  - **Recommendation:** Remove Contact’s local meta `useEffect`. Rely on **MetaTagsUpdater + seo_pages** only. Ensure `/contact` row in `seo_pages` is filled (already in seed).  
  - **Structure:** Has H1 (“CONTACT”), `<main>`, `<section>`. Good. Add **internal links in body text** (e.g. “For viewings and bookings, see our [Studios](/studios) and [FAQ](/faq).”) if you add a short intro paragraph.

- **FAQ (`/faq`):**  
  - **Current:** Page sets its own title and meta in `useEffect`; overrides MetaTagsUpdater.  
  - **Recommendation:** Remove local meta; use **seo_pages** only. Ensure one H1 for the page (e.g. “Frequently asked questions” or “FAQ”) and that the first visible heading is H1. Check FAQ has `<main>` and sections.

- **Blog listing (`/blog`):**  
  - **Current:** Sets own title/meta in `useEffect`.  
  - **Recommendation:** Use **seo_pages** for `/blog`; remove duplicate meta. Ensure one H1 (e.g. “Blog” or “News and tips”), `<main>`, and internal links in intro text to key pages (e.g. Studios, Contact, Reviews).

- **Blog post (`/:slug` – BlogDetail):**  
  - **Current:** Uses post title + excerpt for meta; sets OG/Twitter in component. Blog posts have their own `seo_pages` row (from import or manual) keyed by path like `/${slug}`.  
  - **Recommendation:** Keep blog-specific meta but ensure it’s consistent: either BlogDetail reads from `seo_pages` by path `/${slug}` or keeps setting meta from post data but without overwriting canonical/robots if those come from SEO table. One H1 = post title; `<article>` wrapping the post; optional JSON-LD Article.

- **About (`/about`):**  
  - **Current:** Sets own title/meta in `useEffect`.  
  - **Recommendation:** Use **seo_pages** only; remove local meta. Check one H1, `<main>`, sections, and add 1–2 in-text links (e.g. to Studios, Facilities/amenities, Contact).

- **Short-term (`/short-term`):**  
  - **Current:** Sets own title/meta in `useEffect`.  
  - **Recommendation:** Use **seo_pages** only; remove local meta. Page has H1 per tab and `<section>`; ensure one “primary” H1 for the page (e.g. first tab’s heading) for crawlers.

- **Reviews (`/reviews`):**  
  - **Current:** Uses **usePageSeo** and sets title from SEO; good.  
  - **Gap:** Seed migration **006_seo_pages_seed.sql** does **not** insert `/reviews`. So either add `/reviews` to that seed or ensure it’s created via admin.  
  - **Recommendation:** Add `/reviews` to seed (or a one-off insert) with meta title, description, focus keyphrase, OG, Twitter. Keep current structure (main, sections, H2, article with schema).

- **Privacy (`/privacy`):**  
  - **Current:** Sets own title/meta in `useEffect`.  
  - **Recommendation:** Use **seo_pages** only; remove local meta. Structure already has H1, H2, `<main>`, `<article>`. Keep in-text link to Contact (and optionally Terms).

- **Terms (`/terms`):**  
  - **Current:** Sets own title/meta in `useEffect`.  
  - **Recommendation:** Use **seo_pages** only; remove local meta. Structure has H1, H2, H3, `<main>`, `<article>`. Already has in-text links to Privacy and Contact; good.

- **NotFound (404):**  
  - **Current:** Sets `document.title` for “Page Not Found”.  
  - **Recommendation:** Keep; ensure page has `<main>`, one H1, and internal links (e.g. Home, Contact, FAQ) in text or clearly visible.

- **Admin routes:** No SEO requirements for public search; no change.

---

## 7. Single source of truth for meta (site-wide)

**Current:**  
- **MetaTagsUpdater** sets meta from `usePageSeo(location.pathname)` and defaults.  
- **PageTitle** (usePageTitle) also sets `document.title` and appends ` | ${baseTitle}`.  
- Several pages **overwrite** meta in their own `useEffect` (Contact, FAQ, Blog, About, ShortTerm, Privacy, Terms, BlogDetail).

**Problems:**  
- Duplicate logic; DB (`seo_pages`) is ignored for pages that set meta locally.  
- Title can be set twice (MetaTagsUpdater + PageTitle) and may end up with double “ | base” or wrong order.  
- MetaTagsUpdater has: `if (!document.title.includes("|"))` before setting title – fragile and unnecessary once one source is used.

**Recommendation:**  
1. **One place sets all meta:** **MetaTagsUpdater** (or a single hook used only there).  
2. **Data source:** **seo_pages** by path (with path normalisation for `/studios`, `/studios/:year`).  
3. **Remove** from every page: local `useEffect` that sets `document.title`, meta description, OG, Twitter, canonical.  
4. **Remove or simplify PageTitle:** Either remove **PageTitle** and rely only on MetaTagsUpdater, or make PageTitle only read from the same source (e.g. same hook) and set title once, without appending base if `meta_title` already contains the site name.  
5. **Default/fallback:** MetaTagsUpdater already uses `website_seo_settings` and branding; keep that for paths with no `seo_pages` row.

Result: one source of truth (DB + MetaTagsUpdater), no duplicate setters, and admin SEO edits apply to all pages.

---

## 8. Internal linking (in text, not just buttons)

**Current:**  
- Most internal links are in **Navigation**, **Footer**, or **buttons** (e.g. “Back to home”, “Contact us”).  
- **In-text links:** Terms links to Privacy and Contact; Privacy links to Contact. Blog/listing and BlogDetail link to `/blog` and post URLs.

**Recommendation:**  
- Add **in-content** links where it fits naturally:  
  - **About:** In intro or “Why us” copy, link “studios” → `/studios`, “reviews” → `/reviews`, “contact” → `/contact`, “FAQ” → `/faq`.  
  - **Studios (StudiosHome):** In intro or “How to book”, link “contact” → `/contact`, “FAQ” → `/faq`, “reviews” → `/reviews`.  
  - **Short-term:** In description, link “student studios” → `/studios`, “contact” → `/contact`.  
  - **FAQ:** In intro, link “book a viewing” → `/studios`, “contact” → `/contact`.  
  - **Blog listing:** In intro, link “studios”, “contact”, “reviews” where relevant.  
  - **Blog post:** In body or sidebar, link “back to blog” and maybe “view our studios” / “contact us”.  
  - **Reviews:** In intro, link “studios” → `/studios`, “contact” → `/contact`.  
- Keep links **natural** (anchor text that describes the target), not “click here”.  
- Prefer **2–5** contextual links per page to key pages (Studios, Contact, FAQ, About, Reviews, Short-term) rather than many generic links.

---

## 9. Loading time and DOM (high level)

- **LCP:** Hero images and above-the-fold content; use responsive images, priority/hint for hero.  
- **CLS:** Reserve space for images (width/height or aspect-ratio); avoid inserting content above existing blocks.  
- **DOM:** Keep structure simple; avoid deep div nests; use semantic tags so crawlers see clear outline.  
- **Lazy loading:** Use for images below the fold and for carousel slides not in the first view.  
- **No change in this plan;** add to backlog: run Lighthouse on each public page and fix the top 2–3 issues per page.

---

## 10. Checklist summary (your decisions)

Use this as the decision list before implementation:

- [ ] **Meta limits:** Add character count (e.g. 60 / 160) and colour states in SEO forms (UX, not label-only).  
- [ ] **Search preview:** Add “Search preview” block in Edit (and optionally Add) page SEO when title + description are filled.  
- [ ] **Images:** Enforce/encourage alt text on all content images; optional OG image title/alt.  
- [ ] **Single meta source:** Remove all per-page meta `useEffect`; use only MetaTagsUpdater + seo_pages; fix or remove PageTitle so title is set once.  
- [ ] **Path normalisation:** Use `/studios` for SEO for both `/studios` and `/studios/:year`.  
- [ ] **Reviews in seed:** Add `/reviews` to `006_seo_pages_seed.sql` (or one-off insert) with full SEO fields.  
- [ ] **Structure:** Audit each page for one H1, one `<main>`, H2/H3 order, `<section>`/`<article>` where needed.  
- [ ] **Internal links:** Add 2–5 in-text links per page to Studios, Contact, FAQ, About, Reviews, Short-term where natural.  
- [ ] **No other changes:** No code changed until you tick and approve the items you want implemented.

---

**Document version:** 1.0  
**Last updated:** 2026-01-27  
**Scope:** Website public pages only; no portal or admin logic changes.
