INSERT INTO public.signup_deny_networks (cidr, reason)
VALUES (
  '154.219.105.37/32',
  'Captcha-less signup/recover/password probe, 14 Sep 2026'
)
ON CONFLICT (cidr) DO NOTHING;

DELETE FROM auth.sessions s
WHERE s.ip IS NOT NULL
  AND s.ip <<= '154.219.105.37/32';
