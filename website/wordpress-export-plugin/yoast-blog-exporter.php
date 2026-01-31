<?php
/**
 * Plugin Name: Yoast Blog & SEO Exporter
 * Plugin URI: https://github.com/your-repo/yoast-blog-exporter
 * Description: Safely export all blog posts with complete Yoast SEO data (meta titles, descriptions, keywords, schema, etc.) to JSON/CSV format. Read-only plugin - does not modify any data.
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://yoursite.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: yoast-blog-exporter
 * 
 * This plugin is read-only and safe to use. It only exports data and does not modify your WordPress installation.
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Main Plugin Class
 */
class Yoast_Blog_Exporter {
    
    /**
     * Plugin version
     */
    const VERSION = '1.0.0';
    
    /**
     * Initialize the plugin
     */
    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'handle_export'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
    }
    
    /**
     * Add admin menu item
     */
    public function add_admin_menu() {
        add_management_page(
            'Export Blog & SEO Data',
            'Export Blog & SEO',
            'export', // Only users with export capability
            'yoast-blog-exporter',
            array($this, 'render_admin_page')
        );
    }
    
    /**
     * Enqueue admin scripts and styles
     */
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'tools_page_yoast-blog-exporter') {
            return;
        }
        
        wp_enqueue_style(
            'yoast-blog-exporter-style',
            plugin_dir_url(__FILE__) . 'assets/style.css',
            array(),
            self::VERSION
        );
    }
    
    /**
     * Render admin page
     */
    public function render_admin_page() {
        // Security check
        if (!current_user_can('export')) {
            wp_die('You do not have sufficient permissions to access this page.');
        }
        
        ?>
        <div class="wrap">
            <h1>Export Blog Posts & Yoast SEO Data</h1>
            
            <div class="notice notice-info">
                <p><strong>Safe Export Plugin:</strong> This plugin only reads and exports data. It does not modify, delete, or change any content on your website.</p>
            </div>
            
            <div class="export-container">
                <h2>Export Options</h2>
                
                <form method="post" action="" id="export-form">
                    <?php wp_nonce_field('yoast_blog_export', 'yoast_export_nonce'); ?>
                    
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="export_format">Export Format</label>
                            </th>
                            <td>
                                <select name="export_format" id="export_format" required>
                                    <option value="json">JSON (Recommended - Most Complete)</option>
                                    <option value="csv">CSV (Spreadsheet Friendly)</option>
                                </select>
                                <p class="description">JSON includes all data including schema. CSV is easier to view in Excel.</p>
                            </td>
                        </tr>
                        
                        <tr>
                            <th scope="row">
                                <label for="post_status">Post Status</label>
                            </th>
                            <td>
                                <select name="post_status" id="post_status">
                                    <option value="publish">Published Only</option>
                                    <option value="all">All Statuses (Published, Draft, etc.)</option>
                                </select>
                            </td>
                        </tr>
                        
                        <tr>
                            <th scope="row">
                                <label for="include_media">Include Media URLs</label>
                            </th>
                            <td>
                                <input type="checkbox" name="include_media" id="include_media" value="1" checked>
                                <label for="include_media">Include featured image and attachment URLs</label>
                            </td>
                        </tr>
                        
                        <tr>
                            <th scope="row">
                                <label for="include_schema">Include Schema Data</label>
                            </th>
                            <td>
                                <input type="checkbox" name="include_schema" id="include_schema" value="1" checked>
                                <label for="include_schema">Include Yoast schema.org JSON-LD data</label>
                            </td>
                        </tr>
                    </table>
                    
                    <p class="submit">
                        <button type="submit" class="button button-primary button-large" id="export-button">
                            <span class="dashicons dashicons-download" style="vertical-align: middle;"></span>
                            Export Blog Posts & SEO Data
                        </button>
                    </p>
                </form>
                
                <div id="export-status" style="display: none; margin-top: 20px;">
                    <div class="notice notice-info inline">
                        <p><span class="spinner is-active" style="float: none; margin: 0 10px 0 0;"></span> <span id="status-message">Preparing export...</span></p>
                    </div>
                </div>
            </div>
            
            <div class="export-info" style="margin-top: 30px; padding: 15px; background: #f0f0f1; border-left: 4px solid #2271b1;">
                <h3>What Gets Exported:</h3>
                <ul>
                    <li>✅ Post title, content, excerpt, slug, date</li>
                    <li>✅ Yoast SEO meta title and description</li>
                    <li>✅ Focus keyword/keyphrase</li>
                    <li>✅ Canonical URL</li>
                    <li>✅ Open Graph tags (title, description, image)</li>
                    <li>✅ Twitter Card data</li>
                    <li>✅ Robots meta (noindex, nofollow)</li>
                    <li>✅ Schema.org JSON-LD structured data</li>
                    <li>✅ Featured image URL</li>
                    <li>✅ Categories and tags</li>
                    <li>✅ Author information</li>
                </ul>
            </div>
        </div>
        
        <script>
        document.getElementById('export-form').addEventListener('submit', function(e) {
            var button = document.getElementById('export-button');
            var status = document.getElementById('export-status');
            var message = document.getElementById('status-message');
            
            button.disabled = true;
            button.innerHTML = '<span class="spinner is-active" style="vertical-align: middle;"></span> Exporting...';
            status.style.display = 'block';
            message.textContent = 'Processing your export. This may take a moment...';
        });
        </script>
        <?php
    }
    
    /**
     * Handle export request
     */
    public function handle_export() {
        // Security checks
        if (!isset($_POST['yoast_export_nonce']) || !wp_verify_nonce($_POST['yoast_export_nonce'], 'yoast_blog_export')) {
            return;
        }
        
        if (!current_user_can('export')) {
            wp_die('You do not have sufficient permissions to export.');
        }
        
        if (!isset($_POST['export_format'])) {
            return;
        }
        
        $format = sanitize_text_field($_POST['export_format']);
        $post_status = isset($_POST['post_status']) ? sanitize_text_field($_POST['post_status']) : 'publish';
        $include_media = isset($_POST['include_media']);
        $include_schema = isset($_POST['include_schema']);
        
        // Get all posts
        $args = array(
            'post_type' => 'post',
            'posts_per_page' => -1,
            'post_status' => $post_status === 'all' ? 'any' : 'publish',
            'orderby' => 'date',
            'order' => 'DESC',
        );
        
        $posts = get_posts($args);
        
        if (empty($posts)) {
            wp_die('No posts found to export.');
        }
        
        // Prepare export data
        $export_data = array();
        
        foreach ($posts as $post) {
            $post_data = $this->get_post_export_data($post, $include_media, $include_schema);
            $export_data[] = $post_data;
        }
        
        // Export based on format
        if ($format === 'json') {
            $this->export_json($export_data);
        } else {
            $this->export_csv($export_data);
        }
    }
    
    /**
     * Get complete export data for a post
     */
    private function get_post_export_data($post, $include_media = true, $include_schema = true) {
        $data = array(
            // Basic post data
            'id' => $post->ID,
            'title' => $post->post_title,
            'slug' => $post->post_name,
            'content' => $post->post_content,
            'excerpt' => $post->post_excerpt,
            'status' => $post->post_status,
            'date' => $post->post_date,
            'date_gmt' => $post->post_date_gmt,
            'modified' => $post->post_modified,
            'modified_gmt' => $post->post_modified_gmt,
            'url' => get_permalink($post->ID),
            
            // Author
            'author' => array(
                'id' => $post->post_author,
                'name' => get_the_author_meta('display_name', $post->post_author),
                'email' => get_the_author_meta('user_email', $post->post_author),
            ),
            
            // Yoast SEO Meta
            'seo' => array(
                'meta_title' => get_post_meta($post->ID, '_yoast_wpseo_title', true),
                'meta_description' => get_post_meta($post->ID, '_yoast_wpseo_metadesc', true),
                'focus_keyword' => get_post_meta($post->ID, '_yoast_wpseo_focuskw', true),
                'canonical_url' => get_post_meta($post->ID, '_yoast_wpseo_canonical', true),
                'noindex' => get_post_meta($post->ID, '_yoast_wpseo_meta-robots-noindex', true),
                'nofollow' => get_post_meta($post->ID, '_yoast_wpseo_meta-robots-nofollow', true),
                'robots_advanced' => get_post_meta($post->ID, '_yoast_wpseo_meta-robots-adv', true),
            ),
            
            // Open Graph
            'open_graph' => array(
                'title' => get_post_meta($post->ID, '_yoast_wpseo_opengraph-title', true),
                'description' => get_post_meta($post->ID, '_yoast_wpseo_opengraph-description', true),
                'image' => $this->get_og_image_url($post->ID),
            ),
            
            // Twitter Card
            'twitter_card' => array(
                'title' => get_post_meta($post->ID, '_yoast_wpseo_twitter-title', true),
                'description' => get_post_meta($post->ID, '_yoast_wpseo_twitter-description', true),
                'image' => get_post_meta($post->ID, '_yoast_wpseo_twitter-image', true),
            ),
            
            // Categories and Tags
            'categories' => $this->get_post_categories($post->ID),
            'tags' => $this->get_post_tags($post->ID),
        );
        
        // Featured Image
        if ($include_media) {
            $thumbnail_id = get_post_thumbnail_id($post->ID);
            if ($thumbnail_id) {
                $data['featured_image'] = array(
                    'id' => $thumbnail_id,
                    'url' => wp_get_attachment_image_url($thumbnail_id, 'full'),
                    'alt' => get_post_meta($thumbnail_id, '_wp_attachment_image_alt', true),
                );
            }
            
            // Get all attached images
            $attachments = get_attached_media('image', $post->ID);
            $data['attachments'] = array();
            foreach ($attachments as $attachment) {
                $data['attachments'][] = array(
                    'id' => $attachment->ID,
                    'url' => wp_get_attachment_url($attachment->ID),
                    'title' => $attachment->post_title,
                    'alt' => get_post_meta($attachment->ID, '_wp_attachment_image_alt', true),
                );
            }
        }
        
        // Schema.org JSON-LD
        if ($include_schema) {
            $schema = $this->get_post_schema($post->ID);
            if (!empty($schema)) {
                $data['schema'] = $schema;
            }
        }
        
        return $data;
    }
    
    /**
     * Get Open Graph image URL
     */
    private function get_og_image_url($post_id) {
        $og_image_id = get_post_meta($post_id, '_yoast_wpseo_opengraph-image-id', true);
        if ($og_image_id) {
            return wp_get_attachment_image_url($og_image_id, 'full');
        }
        
        $og_image = get_post_meta($post_id, '_yoast_wpseo_opengraph-image', true);
        if ($og_image) {
            return $og_image;
        }
        
        // Fallback to featured image
        $thumbnail_id = get_post_thumbnail_id($post_id);
        if ($thumbnail_id) {
            return wp_get_attachment_image_url($thumbnail_id, 'full');
        }
        
        return '';
    }
    
    /**
     * Get post categories
     */
    private function get_post_categories($post_id) {
        $categories = get_the_category($post_id);
        $result = array();
        foreach ($categories as $category) {
            $result[] = array(
                'id' => $category->term_id,
                'name' => $category->name,
                'slug' => $category->slug,
            );
        }
        return $result;
    }
    
    /**
     * Get post tags
     */
    private function get_post_tags($post_id) {
        $tags = get_the_tags($post_id);
        if (!$tags) {
            return array();
        }
        
        $result = array();
        foreach ($tags as $tag) {
            $result[] = array(
                'id' => $tag->term_id,
                'name' => $tag->name,
                'slug' => $tag->slug,
            );
        }
        return $result;
    }
    
    /**
     * Get schema.org JSON-LD data for post
     */
    private function get_post_schema($post_id) {
        // Yoast stores schema in post meta
        $schema = get_post_meta($post_id, '_yoast_wpseo_schema_page_type', true);
        
        // Also check for JSON-LD stored in meta
        $schema_json = get_post_meta($post_id, '_yoast_wpseo_schema_article_type', true);
        
        // Try to get full schema data
        $all_meta = get_post_meta($post_id);
        $schema_data = array();
        
        foreach ($all_meta as $key => $value) {
            if (strpos($key, '_yoast_wpseo_schema') === 0) {
                $schema_data[$key] = is_array($value) ? $value[0] : $value;
            }
        }
        
        return !empty($schema_data) ? $schema_data : null;
    }
    
    /**
     * Export data as JSON
     */
    private function export_json($data) {
        $filename = 'wordpress-blog-seo-export-' . date('Y-m-d-His') . '.json';
        
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');
        
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    /**
     * Export data as CSV
     */
    private function export_csv($data) {
        $filename = 'wordpress-blog-seo-export-' . date('Y-m-d-His') . '.csv';
        
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');
        
        $output = fopen('php://output', 'w');
        
        // Add BOM for UTF-8 Excel compatibility
        fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
        
        // Headers
        $headers = array(
            'ID', 'Title', 'Slug', 'URL', 'Content', 'Excerpt', 'Status', 'Date',
            'Author Name', 'Author Email',
            'SEO Title', 'SEO Description', 'Focus Keyword', 'Canonical URL',
            'Noindex', 'Nofollow',
            'OG Title', 'OG Description', 'OG Image',
            'Twitter Title', 'Twitter Description', 'Twitter Image',
            'Featured Image URL', 'Featured Image Alt',
            'Categories', 'Tags',
        );
        
        fputcsv($output, $headers);
        
        // Data rows
        foreach ($data as $post) {
            $row = array(
                $post['id'],
                $post['title'],
                $post['slug'],
                $post['url'],
                $post['content'],
                $post['excerpt'],
                $post['status'],
                $post['date'],
                $post['author']['name'],
                $post['author']['email'],
                $post['seo']['meta_title'],
                $post['seo']['meta_description'],
                $post['seo']['focus_keyword'],
                $post['seo']['canonical_url'],
                $post['seo']['noindex'] ? 'Yes' : 'No',
                $post['seo']['nofollow'] ? 'Yes' : 'No',
                $post['open_graph']['title'],
                $post['open_graph']['description'],
                $post['open_graph']['image'],
                $post['twitter_card']['title'],
                $post['twitter_card']['description'],
                $post['twitter_card']['image'],
                isset($post['featured_image']) ? $post['featured_image']['url'] : '',
                isset($post['featured_image']) ? $post['featured_image']['alt'] : '',
                implode(', ', array_column($post['categories'], 'name')),
                implode(', ', array_column($post['tags'], 'name')),
            );
            
            fputcsv($output, $row);
        }
        
        fclose($output);
        exit;
    }
}

// Initialize the plugin
new Yoast_Blog_Exporter();
