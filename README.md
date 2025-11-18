# Urban Hub Booking Portal

This repository contains the source code for the Urban Hub Booking Portal, a Vite + React application that enables students to explore studio accommodation options, review amenities, and manage bookings end-to-end via Supabase and Stripe integrations.

## Getting Started

```sh
npm install
npm run dev
```

The app runs on `http://localhost:5173` by default.

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui component primitives
- Supabase for authentication and data
- Stripe for payments

- DocuSign for tenancy and guarantor agreements (via Supabase Edge Functions)

## Project Structure Highlights

- `src/pages` contains routed views such as the landing page.
- `src/components` hosts reusable UI elements and sections.
- `src/integrations` contains Supabase and Stripe helpers.
- `supabase/functions` includes serverless edge functions deployed with Supabase.

## Deployment

Deploy the production build to your preferred hosting provider. Remember to configure Supabase environment variables and Stripe keys before going live.

## DocuSign Configuration

The `docusign-envelopes` Supabase Edge Function requires the following environment variables (set them in the Supabase dashboard or via `supabase secrets set`):

- `DOCUSIGN_CLIENT_ID`
- `DOCUSIGN_USER_ID` (API User ID / GUID)
- `DOCUSIGN_ACCOUNT_ID`
- `DOCUSIGN_PRIVATE_KEY` (PKCS8 PEM, newline-escaped)
- `DOCUSIGN_AUTH_SERVER` (`https://account-d.docusign.com` for demo, `https://account.docusign.com` for prod)
- `DOCUSIGN_BASE_URL` (`https://demo.docusign.net/restapi` or production equivalent)
- `DOCUSIGN_TENANCY_TEMPLATE_ID`
- `DOCUSIGN_GUARANTOR_TEMPLATE_ID`
- Optional role overrides:
  - `DOCUSIGN_TENANCY_STUDENT_ROLE`
  - `DOCUSIGN_TENANCY_WITNESS_ROLE`
  - `DOCUSIGN_GUARANTOR_ROLE`
- Optional but recommended:
  - `DOCUSIGN_SIGNING_RETURN_URL` (where users land after embedded signing)

Redirect URIs expected by DocuSign:

- `http://localhost:8080/api/docusign/oauth/callback`
- `https://portal.urbanhub.uk/api/docusign/oauth/callback`

Make sure you’ve generated a client secret/RSA keypair for the integration key and granted consent for the impersonated user before switching to production.
