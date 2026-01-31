/**
 * Parse blog export CSV (e.g. from WordPress export plugins) into typed rows.
 * Handles quoted fields with embedded newlines and commas.
 */

import Papa from "papaparse";

export interface CsvBlogRow {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  date: string;
  postType: string;
  permalink: string;
  imageUrl: string;
  categories: string;
  tags: string;
  focusKeyword: string;
  seoTitle: string;
  metaDesc: string;
  ogTitle: string;
  ogDescription: string;
  twitterDescription: string;
  status: string;
  authorUsername: string;
  authorEmail: string;
  authorFirstName: string;
  authorLastName: string;
  slug: string;
  postModifiedDate: string;
}

const COL = {
  ID: "ID",
  Title: "Title",
  Content: "Content",
  Excerpt: "Excerpt",
  Date: "Date",
  PostType: "Post Type",
  Permalink: "Permalink",
  ImageUrl: "Image URL",
  Categories: "Categories",
  Tags: "Tags",
  FocusKw: "_yoast_wpseo_focuskw",
  SeoTitle: "_yoast_wpseo_title",
  MetaDesc: "_yoast_wpseo_metadesc",
  OgTitle: "_yoast_wpseo_opengraph-title",
  OgDesc: "_yoast_wpseo_opengraph-description",
  TwitterDesc: "_yoast_wpseo_twitter-description",
  Status: "Status",
  AuthorUsername: "Author Username",
  AuthorEmail: "Author Email",
  AuthorFirstName: "Author First Name",
  AuthorLastName: "Author Last Name",
  Slug: "Slug",
  PostModifiedDate: "Post Modified Date",
};

function get(row: Record<string, string>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Parse CSV file content into typed blog rows.
 * Only returns rows that look like posts (have Title and Slug or Permalink).
 */
export function parseCsvBlogExport(csvText: string): CsvBlogRow[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error: ${first.message} (row ${first.row})`);
  }

  const rows: CsvBlogRow[] = [];
  for (const row of parsed.data) {
    const title = get(row, COL.Title);
    const slug = get(row, COL.Slug);
    const permalink = get(row, COL.Permalink);
    const postType = get(row, COL.PostType);
    // Only include post-type rows that have a title
    if (!title) continue;
    if (postType && postType.toLowerCase() !== "post" && postType.toLowerCase() !== "posts") continue;

    rows.push({
      id: get(row, COL.ID),
      title,
      content: get(row, COL.Content),
      excerpt: get(row, COL.Excerpt),
      date: get(row, COL.Date),
      postType,
      permalink,
      imageUrl: get(row, COL.ImageUrl),
      categories: get(row, COL.Categories),
      tags: get(row, COL.Tags),
      focusKeyword: get(row, COL.FocusKw),
      seoTitle: get(row, COL.SeoTitle),
      metaDesc: get(row, COL.MetaDesc),
      ogTitle: get(row, COL.OgTitle),
      ogDescription: get(row, COL.OgDesc),
      twitterDescription: get(row, COL.TwitterDesc),
      status: get(row, COL.Status),
      authorUsername: get(row, COL.AuthorUsername),
      authorEmail: get(row, COL.AuthorEmail),
      authorFirstName: get(row, COL.AuthorFirstName),
      authorLastName: get(row, COL.AuthorLastName),
      slug: slug || slugFromPermalink(permalink) || slugFromTitle(title),
      postModifiedDate: get(row, COL.PostModifiedDate),
    });
  }

  return rows;
}

function slugFromPermalink(permalink: string): string {
  if (!permalink) return "";
  try {
    const path = new URL(permalink).pathname;
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  } catch {
    return "";
  }
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Parse comma-separated category or tag names from CSV cell (may be "name1,name2" or "name1, name2").
 */
export function parseCsvCategoriesOrTags(cell: string): Array<{ name: string; slug: string }> {
  if (!cell || !cell.trim()) return [];
  const names = cell.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  return names
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((name) => ({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }));
}
