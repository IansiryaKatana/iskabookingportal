-- Social media settings table
create table if not exists public.social_media_settings (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  url text,
  is_enabled boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_media_platform_check check (platform in ('instagram', 'tiktok', 'linkedin', 'facebook', 'whatsapp'))
);

-- Enable RLS
alter table public.social_media_settings enable row level security;

-- Public read access
create policy "Public read social media settings" on public.social_media_settings
  for select using (true);

-- Staff can manage social media settings
create policy "Staff manage social media settings" on public.social_media_settings
  for all using (public.is_staff())
  with check (public.is_staff());

-- Add update timestamp trigger
drop trigger if exists set_timestamp_social_media_settings on public.social_media_settings;
create trigger set_timestamp_social_media_settings
before update on public.social_media_settings
for each row execute function public.set_current_timestamp_updated_at();

-- Insert default social media platforms
insert into public.social_media_settings (platform, url, is_enabled, display_order)
values
  ('instagram', 'https://www.instagram.com/urbanhub', true, 1),
  ('tiktok', 'https://www.tiktok.com/@urbanhub', true, 2),
  ('linkedin', 'https://www.linkedin.com/company/urbanhub', true, 3),
  ('facebook', 'https://www.facebook.com/urbanhub', true, 4),
  ('whatsapp', 'https://wa.me/447123456789', true, 5)
on conflict (platform) do nothing;

