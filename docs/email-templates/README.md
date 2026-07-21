# Email Templates — authoring guide

Emails are **not web pages**. Apple Mail, Titan and iOS use full browser engines, but
**Gmail and Outlook strip most modern CSS**. A template that looks perfect in Titan can be
completely broken in Gmail/Outlook. Follow the rules below and every client renders correctly.

## Files here
- `urban-hub-international-emailer.html` — the live "Your Journey to Preston" template,
  rebuilt as a bulletproof, table-based email. **Use this as the starter for new campaigns.**
- `urban-hub-logo.png` — the UH logo as PNG (see "Logos" below).

The original (pre-fix) HTML is backed up in the database table
`public._email_template_backups` (see "Restore" below).

## DO
- **Lay out with `<table>`** (`role="presentation"`), not `<div>` + flexbox/grid.
- **Put every style inline** via `style="..."` on the element. Do not rely on CSS classes.
- Keep the body **600px wide**, centered inside a full-width background table.
- Use **web-safe fonts** with a fallback stack: `'Inter Tight', Arial, Helvetica, sans-serif`.
  (Custom fonts silently fall back to Arial in Gmail/Outlook — that's fine.)
- Use **solid hex colors** everywhere (e.g. `#ef0505`). Give every image an explicit
  `width` attribute and `alt` text.
- For **background images with text on top**, add the Outlook VML fallback
  (`<!--[if gte mso 9]> <v:rect>…<v:fill>…<v:textbox> … <![endif]-->`) plus a solid
  `bgcolor` so text stays readable if the image is blocked.
- Build **buttons** as a colored `<td>` with a padded `<a>` inside (not a styled `<div>`).

## DON'T
- ❌ **CSS custom properties** (`:root { --red }`, `var(--red)`) — ignored by Gmail/Outlook.
  This was the main reason the old template broke.
- ❌ Styling only in `<head><style>` with classes — unreliable in Outlook, stripped by some clients.
- ❌ `display:flex` / `display:grid`, `clamp()`, `min()`, `box-shadow`, `linear-gradient()`.
- ❌ `::before` / `::after` content (pins, checkmarks, decorative icons vanish).
- ❌ `rgba()` for **text** color (renders invisible in Outlook). Use a solid hex instead.
- ❌ `.webp` images (Outlook can't render them). Use `.png` / `.jpg`.

## Logos
- The app's branding logo is `branding/logo.webp` (the real UH logo). It renders in Gmail,
  Apple Mail, Titan and mobile, so the template uses it per request.
- **Outlook desktop cannot display WebP** — it shows the `alt` text ("Urban Hub") instead.
- To make the logo appear in Outlook too, host a PNG (this folder's `urban-hub-logo.png`)
  at a public URL and swap the two `<img src>` values in the template. Ask and this can be wired up.

## Test before sending
Always send a **[TEST]** to at least one Gmail and one Outlook inbox and confirm layout,
colors, images and buttons before running a real campaign.

## Restore the original template
```sql
update public.email_templates
set body_html = (select body_html from public._email_template_backups where backup_id = 1)
where id = 'cb092819-5f63-4e50-a0ed-5f4e58de38d7';
```
