/**
 * WordPress XML Export Parser
 * Parses WordPress WXR (WordPress eXtended RSS) export files
 * Extracts posts, SEO data, categories, tags, and media
 */

export interface WordPressPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: string;
  date: string;
  dateGmt: string;
  modified: string;
  modifiedGmt: string;
  link: string;
  author: {
    login: string;
    email: string;
    displayName: string;
  };
  categories: Array<{ name: string; slug: string }>;
  tags: Array<{ name: string; slug: string }>;
  featuredImageId?: string;
  seo: {
    metaTitle?: string;
    metaDescription?: string;
    focusKeyword?: string;
    canonicalUrl?: string;
    noindex?: string;
    nofollow?: string;
    robotsAdvanced?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    twitterTitle?: string;
    twitterDescription?: string;
    twitterImage?: string;
    contentScore?: string;
    isCornerstone?: string;
  };
}

export interface ParsedWordPressExport {
  siteUrl: string;
  siteTitle: string;
  authors: Array<{
    id: string;
    login: string;
    email: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
  }>;
  posts: WordPressPost[];
  categories: Array<{ name: string; slug: string }>;
  tags: Array<{ name: string; slug: string }>;
}

/**
 * Parse WordPress XML export file
 */
export async function parseWordPressXML(xmlFile: File): Promise<ParsedWordPressExport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const xmlText = e.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // Check for parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
          reject(new Error('Failed to parse XML file. Please ensure it is a valid WordPress export.'));
          return;
        }

        const result = extractData(xmlDoc);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read XML file'));
    };

    reader.readAsText(xmlFile);
  });
}

/**
 * Extract data from parsed XML document
 */
function extractData(xmlDoc: Document): ParsedWordPressExport {
  const channel = xmlDoc.querySelector('channel');
  if (!channel) {
    throw new Error('Invalid WordPress export: channel element not found');
  }

  // Extract site information
  const siteTitle = channel.querySelector('title')?.textContent || '';
  const siteUrl = channel.querySelector('link')?.textContent || '';
  const baseSiteUrl = channel.querySelector('wp\\:base_site_url, base_site_url')?.textContent || siteUrl;

  // Extract authors
  const authors = extractAuthors(channel);

  // Extract categories and tags
  const categories = extractCategories(channel);
  const tags = extractTags(channel);

  // Extract posts
  const items = channel.querySelectorAll('item');
  const posts: WordPressPost[] = [];

  items.forEach((item) => {
    const postType = item.querySelector('wp\\:post_type, post_type')?.textContent;
    
    // Only process blog posts
    if (postType === 'post') {
      const post = extractPost(item, authors);
      if (post) {
        posts.push(post);
      }
    }
  });

  return {
    siteUrl: baseSiteUrl,
    siteTitle,
    authors,
    posts,
    categories,
    tags,
  };
}

/**
 * Extract authors from XML
 */
function extractAuthors(channel: Element): ParsedWordPressExport['authors'] {
  const authors: ParsedWordPressExport['authors'] = [];
  const authorElements = channel.querySelectorAll('wp\\:author');

  authorElements.forEach((authorEl) => {
    const id = authorEl.querySelector('wp\\:author_id')?.textContent || '';
    const login = authorEl.querySelector('wp\\:author_login')?.textContent || '';
    const email = authorEl.querySelector('wp\\:author_email')?.textContent || '';
    const displayName = authorEl.querySelector('wp\\:author_display_name')?.textContent || '';
    const firstName = authorEl.querySelector('wp\\:author_first_name')?.textContent || '';
    const lastName = authorEl.querySelector('wp\\:author_last_name')?.textContent || '';

    authors.push({
      id,
      login,
      email,
      displayName: displayName || login,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });
  });

  return authors;
}

/**
 * Extract categories from XML
 */
function extractCategories(channel: Element): Array<{ name: string; slug: string }> {
  const categories: Array<{ name: string; slug: string }> = [];
  const categoryElements = channel.querySelectorAll('wp\\:category');

  categoryElements.forEach((catEl) => {
    const name = catEl.querySelector('wp\\:cat_name')?.textContent || '';
    const nicename = catEl.querySelector('wp\\:category_nicename')?.textContent || '';

    if (name && !categories.find((c) => c.slug === nicename)) {
      categories.push({
        name,
        slug: nicename || name.toLowerCase().replace(/\s+/g, '-'),
      });
    }
  });

  return categories;
}

/**
 * Extract tags from XML
 */
function extractTags(channel: Element): Array<{ name: string; slug: string }> {
  const tags: Array<{ name: string; slug: string }> = [];
  const tagElements = channel.querySelectorAll('wp\\:tag');

  tagElements.forEach((tagEl) => {
    const name = tagEl.querySelector('wp\\:tag_name')?.textContent || '';
    const slug = tagEl.querySelector('wp\\:tag_slug')?.textContent || '';

    if (name && !tags.find((t) => t.slug === slug)) {
      tags.push({
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
      });
    }
  });

  return tags;
}

/**
 * Extract a single post from XML item element
 */
function extractPost(item: Element, authors: ParsedWordPressExport['authors']): WordPressPost | null {
  try {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const creator = item.querySelector('dc\\:creator')?.textContent || '';
    const guid = item.querySelector('guid')?.textContent || '';
    const description = item.querySelector('description')?.textContent || '';
    const content = item.querySelector('content\\:encoded')?.textContent || '';
    const excerpt = item.querySelector('excerpt\\:encoded')?.textContent || '';

    // WordPress post metadata
    const postId = item.querySelector('wp\\:post_id')?.textContent || '';
    const postDate = item.querySelector('wp\\:post_date')?.textContent || '';
    const postDateGmt = item.querySelector('wp\\:post_date_gmt')?.textContent || '';
    const postModified = item.querySelector('wp\\:post_modified')?.textContent || '';
    const postModifiedGmt = item.querySelector('wp\\:post_modified_gmt')?.textContent || '';
    const postName = item.querySelector('wp\\:post_name')?.textContent || '';
    const rawStatus = item.querySelector('wp\\:status')?.textContent?.trim();
    const status = rawStatus || 'publish';

    // Extract author information
    const author = authors.find((a) => a.login === creator) || authors[0] || {
      login: creator,
      email: '',
      displayName: creator,
    };

    // Extract categories
    const categories: Array<{ name: string; slug: string }> = [];
    const categoryElements = item.querySelectorAll('category[domain="category"]');
    categoryElements.forEach((catEl) => {
      const name = catEl.textContent || '';
      const nicename = catEl.getAttribute('nicename') || '';
      if (name && !categories.find((c) => c.slug === nicename)) {
        categories.push({
          name,
          slug: nicename || name.toLowerCase().replace(/\s+/g, '-'),
        });
      }
    });

    // Extract tags
    const tags: Array<{ name: string; slug: string }> = [];
    const tagElements = item.querySelectorAll('category[domain="post_tag"]');
    tagElements.forEach((tagEl) => {
      const name = tagEl.textContent || '';
      const nicename = tagEl.getAttribute('nicename') || '';
      if (name && !tags.find((t) => t.slug === nicename)) {
        tags.push({
          name,
          slug: nicename || name.toLowerCase().replace(/\s+/g, '-'),
        });
      }
    });

    // Extract post meta (including Yoast SEO data)
    const postMeta: Record<string, string> = {};
    const metaElements = item.querySelectorAll('wp\\:postmeta');
    metaElements.forEach((metaEl) => {
      const key = metaEl.querySelector('wp\\:meta_key')?.textContent || '';
      const value = metaEl.querySelector('wp\\:meta_value')?.textContent || '';
      if (key) {
        postMeta[key] = value;
      }
    });

    // Extract featured image ID
    const featuredImageId = postMeta['_thumbnail_id'] || undefined;

    // Extract Yoast SEO data
    const seo = {
      metaTitle: postMeta['_yoast_wpseo_title'] || undefined,
      metaDescription: postMeta['_yoast_wpseo_metadesc'] || undefined,
      focusKeyword: postMeta['_yoast_wpseo_focuskw'] || undefined,
      canonicalUrl: postMeta['_yoast_wpseo_canonical'] || undefined,
      noindex: postMeta['_yoast_wpseo_meta-robots-noindex'] || undefined,
      nofollow: postMeta['_yoast_wpseo_meta-robots-nofollow'] || undefined,
      robotsAdvanced: postMeta['_yoast_wpseo_meta-robots-adv'] || undefined,
      ogTitle: postMeta['_yoast_wpseo_opengraph-title'] || undefined,
      ogDescription: postMeta['_yoast_wpseo_opengraph-description'] || undefined,
      ogImage: postMeta['_yoast_wpseo_opengraph-image'] || undefined,
      twitterTitle: postMeta['_yoast_wpseo_twitter-title'] || undefined,
      twitterDescription: postMeta['_yoast_wpseo_twitter-description'] || undefined,
      twitterImage: postMeta['_yoast_wpseo_twitter-image'] || undefined,
      contentScore: postMeta['_yoast_wpseo_content_score'] || undefined,
      isCornerstone: postMeta['_yoast_wpseo_is_cornerstone'] || undefined,
    };

    return {
      id: postId,
      title,
      slug: postName || generateSlug(title),
      content,
      excerpt: excerpt || description,
      status,
      date: postDate,
      dateGmt: postDateGmt,
      modified: postModified,
      modifiedGmt: postModifiedGmt,
      link,
      author: {
        login: author.login,
        email: author.email,
        displayName: author.displayName,
      },
      categories,
      tags,
      featuredImageId,
      seo,
    };
  } catch (error) {
    console.error('Error extracting post:', error);
    return null;
  }
}

/**
 * Generate slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
