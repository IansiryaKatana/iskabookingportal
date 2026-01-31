-- Allow anon/authenticated to INSERT reviews (status defaults to 'pending')
-- Staff can approve via admin.
DROP POLICY IF EXISTS "website_reviews anon insert" ON website_reviews;
DROP POLICY IF EXISTS "website_reviews authenticated insert" ON website_reviews;
CREATE POLICY "website_reviews anon insert" ON website_reviews FOR INSERT TO anon
  WITH CHECK (status = 'pending');
CREATE POLICY "website_reviews authenticated insert" ON website_reviews FOR INSERT TO authenticated
  WITH CHECK (status = 'pending');

GRANT INSERT ON website_reviews TO anon, authenticated;

-- Add SEO page for /reviews (if seo_pages has unique on page_path)
INSERT INTO seo_pages (
  page_path, page_type, meta_title, meta_description, focus_keyword, canonical_url,
  og_title, og_description, og_image_url, twitter_title, twitter_description, twitter_image_url, robots_meta
) VALUES (
  '/reviews', 'page',
  'Reviews | Urban Hub Student Accommodation Preston',
  'Read honest reviews from students and residents at Urban Hub Preston. See what others say about our student accommodation, studios and facilities.',
  'student accommodation reviews Preston', NULL,
  'Reviews | Urban Hub Student Accommodation Preston',
  'Read honest reviews from students and residents at Urban Hub Preston.',
  NULL, 'Reviews | Urban Hub Preston', 'Read honest reviews from students and residents.', NULL,
  'index, follow'
) ON CONFLICT (page_path) DO NOTHING;

-- Seed sample reviews for Urban Hub Preston student accommodation (all approved)
INSERT INTO website_reviews (
  reviewer_name,
  reviewer_email,
  rating,
  title,
  content,
  status,
  featured,
  verified_purchase,
  created_at
) VALUES
(
  'Sophie M.',
  'sophie.m@example.com',
  5,
  'Best decision I made for uni!',
  'Moved in September for my second year at UCLan and honestly could not be happier. The Gold studio is perfect – enough space for my desk and bed without feeling cramped. The common areas are brilliant for meeting people, and having Tesco right downstairs is a game-changer for late-night snacks. Staff are so helpful and the building always feels secure. Would 100% recommend to anyone looking at Preston accommodation.',
  'approved',
  true,
  true,
  now() - interval '45 days'
),
(
  'James T.',
  'james.t@example.com',
  5,
  'Clean, modern and great location',
  'Stayed here for the 24/25 academic year. The studios are really well finished – proper en-suite, decent kitchenette, and the WiFi is solid for online lectures. Walking distance to UCLan campus and the town centre. The rooftop terrace is a nice touch when the weather is good. Maintenance sorted any small issues within a day. Happy resident!',
  'approved',
  true,
  true,
  now() - interval '38 days'
),
(
  'Aisha K.',
  'aisha.k@example.com',
  5,
  'Feels like home away from home',
  'International student here – Urban Hub made the transition so much easier. The team helped with all my questions before I even arrived. My Rhodium studio has loads of natural light and the snug areas are perfect for studying with friends. Love that bills are included so no nasty surprises. Will definitely be staying next year.',
  'approved',
  false,
  true,
  now() - interval '30 days'
),
(
  'Ollie R.',
  'ollie.r@example.com',
  4,
  'Great value for Preston',
  'Compared to other places I viewed, Urban Hub offered the best balance of price and quality. Game room is a bonus, and the cafe on-site is handy when you can''t be bothered to cook. Only minor gripe was waiting a bit for the lift at peak times, but otherwise no complaints. Solid 4 stars.',
  'approved',
  false,
  true,
  now() - interval '22 days'
),
(
  'Emma L.',
  'emma.l@example.com',
  5,
  'Perfect for first-years',
  'I was nervous about moving away from home but Urban Hub made it easy. Met loads of people in the first week thanks to the social spaces. My Silver studio is cosy but has everything I need. The 24/7 reception gives peace of mind and the staff remembered my name within days. Really glad I chose here.',
  'approved',
  true,
  true,
  now() - interval '15 days'
),
(
  'Liam H.',
  'liam.h@example.com',
  4,
  'Good vibes and good facilities',
  'Third year now and still happy. The study zones are quiet when you need to focus, and the social areas are great for unwinding. Aldi and the gym are nearby which is ideal. Occasionally had to chase a repair but it always got sorted. Overall a solid choice for student life in Preston.',
  'approved',
  false,
  true,
  now() - interval '8 days'
);
