-- Migration: Create Blog, SEO, and Media Management Tables
-- Description: Tables for blog posts, categories, SEO data, and media library

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. SEO PAGES TABLE
-- ============================================
-- Stores SEO metadata for all pages (blog posts, static pages, etc.)
CREATE TABLE IF NOT EXISTS seo_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_path TEXT UNIQUE NOT NULL, -- e.g., "/blog/my-post", "/studios"
    page_type TEXT NOT NULL DEFAULT 'post', -- 'post', 'page', 'custom'
    meta_title TEXT,
    meta_description TEXT,
    focus_keyword TEXT,
    canonical_url TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image_url TEXT,
    twitter_title TEXT,
    twitter_description TEXT,
    twitter_image_url TEXT,
    schema_json JSONB, -- Schema.org JSON-LD structured data
    robots_meta TEXT DEFAULT 'index, follow', -- "noindex, nofollow", etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by page path
CREATE INDEX IF NOT EXISTS idx_seo_pages_path ON seo_pages(page_path);
CREATE INDEX IF NOT EXISTS idx_seo_pages_type ON seo_pages(page_type);

-- ============================================
-- 2. BLOG CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blog_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    seo_page_id UUID REFERENCES seo_pages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(slug);

-- ============================================
-- 3. BLOG POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL, -- HTML content
    featured_image_url TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT, -- Store name for imported posts
    author_email TEXT, -- Store email for imported posts
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'archived'
    published_at TIMESTAMPTZ,
    category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
    seo_page_id UUID REFERENCES seo_pages(id) ON DELETE SET NULL,
    wordpress_id TEXT, -- Original WordPress post ID for reference
    wordpress_url TEXT, -- Original WordPress URL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for blog posts
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_wordpress_id ON blog_posts(wordpress_id);

-- ============================================
-- 4. BLOG TAGS TABLE (Many-to-Many with Posts)
-- ============================================
CREATE TABLE IF NOT EXISTS blog_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_tags_slug ON blog_tags(slug);

-- Junction table for blog posts and tags
CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES blog_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- ============================================
-- 5. MEDIA LIBRARY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS media_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name TEXT NOT NULL,
    file_path TEXT, -- Supabase Storage path
    file_url TEXT NOT NULL, -- Public URL
    file_type TEXT NOT NULL, -- 'image', 'video', 'document'
    file_size BIGINT,
    mime_type TEXT,
    alt_text TEXT, -- For SEO
    caption TEXT,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    wordpress_attachment_id TEXT, -- Original WordPress attachment ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for media library
CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(file_type);
CREATE INDEX IF NOT EXISTS idx_media_library_wordpress_id ON media_library(wordpress_attachment_id);

-- ============================================
-- 6. CONTENT BLOCKS TABLE (For flexible page content)
-- ============================================
CREATE TABLE IF NOT EXISTS content_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_path TEXT NOT NULL,
    block_type TEXT NOT NULL, -- 'hero', 'text', 'image', 'cta', etc.
    block_order INTEGER NOT NULL DEFAULT 0,
    block_data JSONB NOT NULL, -- Flexible content structure
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_blocks_page_path ON content_blocks(page_path);
CREATE INDEX IF NOT EXISTS idx_content_blocks_order ON content_blocks(page_path, block_order);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_seo_pages_updated_at BEFORE UPDATE ON seo_pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_categories_updated_at BEFORE UPDATE ON blog_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_blocks_updated_at BEFORE UPDATE ON content_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE seo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;

-- SEO Pages: Public read, authenticated write
CREATE POLICY "SEO pages are viewable by everyone" ON seo_pages
    FOR SELECT USING (true);

CREATE POLICY "SEO pages are editable by authenticated users" ON seo_pages
    FOR ALL USING (auth.role() = 'authenticated');

-- Blog Categories: Public read, authenticated write
CREATE POLICY "Blog categories are viewable by everyone" ON blog_categories
    FOR SELECT USING (true);

CREATE POLICY "Blog categories are editable by authenticated users" ON blog_categories
    FOR ALL USING (auth.role() = 'authenticated');

-- Blog Posts: Public read for published, authenticated write
CREATE POLICY "Published blog posts are viewable by everyone" ON blog_posts
    FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');

CREATE POLICY "Blog posts are editable by authenticated users" ON blog_posts
    FOR ALL USING (auth.role() = 'authenticated');

-- Blog Tags: Public read, authenticated write
CREATE POLICY "Blog tags are viewable by everyone" ON blog_tags
    FOR SELECT USING (true);

CREATE POLICY "Blog tags are editable by authenticated users" ON blog_tags
    FOR ALL USING (auth.role() = 'authenticated');

-- Blog Post Tags: Public read, authenticated write
CREATE POLICY "Blog post tags are viewable by everyone" ON blog_post_tags
    FOR SELECT USING (true);

CREATE POLICY "Blog post tags are editable by authenticated users" ON blog_post_tags
    FOR ALL USING (auth.role() = 'authenticated');

-- Media Library: Public read, authenticated write
CREATE POLICY "Media library is viewable by everyone" ON media_library
    FOR SELECT USING (true);

CREATE POLICY "Media library is editable by authenticated users" ON media_library
    FOR ALL USING (auth.role() = 'authenticated');

-- Content Blocks: Public read, authenticated write
CREATE POLICY "Content blocks are viewable by everyone" ON content_blocks
    FOR SELECT USING (true);

CREATE POLICY "Content blocks are editable by authenticated users" ON content_blocks
    FOR ALL USING (auth.role() = 'authenticated');
