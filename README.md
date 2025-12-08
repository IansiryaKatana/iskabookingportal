# STUCOMMS Booking Portal

This repository contains the source code for the STUCOMMS Booking Portal, a comprehensive student accommodation booking and management system built as a SaaS platform. It enables students to explore studio accommodation options, review amenities, and manage bookings end-to-end via Supabase and Stripe integrations.

## 📚 Documentation

- **[Complete System & Database Documentation](./docs/SYSTEM_AND_DATABASE_COMPLETE.md)** - Comprehensive guide covering system architecture, database schema, setup, and deployment
- **[Database Schema Quick Reference](./docs/DATABASE_SCHEMA_QUICK_REFERENCE.md)** - Quick reference for database tables, relationships, and common queries
- **[Architecture Specification](./docs/architecture-spec.md)** - Detailed system architecture and data model

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Supabase CLI (optional, for local development)

### Quick Start

```sh
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Set up database (choose one):
# Option 1: Automated setup script
npm run setup:db  # or ./scripts/setup-database.sh (Linux/Mac) / .\scripts\setup-database.ps1 (Windows)

# Option 2: Manual setup
npx supabase link --project-ref your-project-ref
npx supabase db push
npx supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts

# (Optional) Seed initial data
npm run seed

# Start development server
npm run dev
```

The app runs on `http://localhost:5173` by default.

## Tech Stack

### Frontend
- **Framework**: Vite + React 18 + TypeScript
- **UI**: Tailwind CSS + shadcn/ui component primitives
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router DOM

### Backend
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Edge Functions**: Supabase Edge Functions (Deno)

### Integrations
- **Payments**: Stripe
- **E-Signatures**: DocuSign (via Edge Functions)
- **Error Tracking**: Sentry
- **PDF Generation**: jsPDF

## Project Structure

```
├── src/
│   ├── pages/              # Route components (admin, portal, partner, public)
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # shadcn/ui primitives
│   │   ├── admin/         # Admin-specific components
│   │   ├── portal/        # Student portal components
│   │   └── partner/       # Partner portal components
│   ├── hooks/             # Custom React hooks
│   ├── contexts/          # React contexts (Auth, etc.)
│   ├── integrations/      # External service clients
│   │   └── supabase/      # Supabase client & types
│   └── utils/             # Helper utilities
├── supabase/
│   ├── migrations/        # Database migrations (SQL)
│   └── functions/         # Edge Functions (Deno/TypeScript)
├── scripts/               # Utility scripts (seed, setup, etc.)
└── docs/                  # Documentation
```

## Key Features

### Student Portal
- Studio discovery and browsing
- Application wizard (6 steps)
- Studio selection with reservation
- Stripe payment integration
- DocuSign contract signing
- Document upload and management
- Payment history and schedule
- Contract management
- Notifications

### Admin Portal
- Academic year management
- Studio grade and media management
- Studio inventory management
- Contract and payment plan configuration
- Application review and approval
- Document verification
- Studio allocation (manual and auto)
- Payment management (Stripe + manual)
- Financial forecasting
- Reports and analytics
- Bulk messaging system
- Email template management
- Partner and commission management
- Cashback campaign management
- Refund processing
- Audit logs
- User management
- Branding customization

### Partner Portal
- Referral code management
- Referred students tracking
- Commission tracking
- Payment status monitoring
- Profile management

## Database Setup

The system uses PostgreSQL via Supabase with 104+ migrations. See [Complete System & Database Documentation](./docs/SYSTEM_AND_DATABASE_COMPLETE.md) for full schema details.

### Quick Database Setup

```bash
# Link to your Supabase project
npx supabase link --project-ref your-project-ref

# Apply all migrations
npx supabase db push

# Generate TypeScript types
npx supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts

# (Optional) Seed sample data
npm run seed
```

### Database Schema

The database includes:
- **User Management**: Profiles, roles, authentication
- **Academic Structure**: Academic years, studio grades, studios, amenities
- **Pricing**: Payment plans, installments, contracts, pricing per grade/year
- **Applications**: Student applications, steps, documents, signatures
- **Payments**: Stripe payments, manual payments, refunds
- **Partner System**: Partners, referrals, commissions, referral codes
- **Cashback**: Campaigns and application cashbacks
- **Notifications**: In-app notifications and email templates
- **Financial**: Forecasting and reporting
- **Branding**: Settings, navigation, opening hours

See [Database Schema Quick Reference](./docs/DATABASE_SCHEMA_QUICK_REFERENCE.md) for details.

## Deployment

### Environment Variables

**Frontend** (`.env.production`):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

**Supabase Edge Functions** (set via Supabase Dashboard or CLI):
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set DOCUSIGN_CLIENT_ID=...
# ... other secrets
```

### Build & Deploy

```bash
# Build frontend
npm run build

# Deploy database migrations
npx supabase db push

# Deploy edge functions
npx supabase functions deploy function-name
```

Deploy the `dist/` folder to your preferred hosting provider (Netlify, Vercel, etc.).

See [Complete System & Database Documentation](./docs/SYSTEM_AND_DATABASE_COMPLETE.md#deployment-guide) for detailed deployment instructions.

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
