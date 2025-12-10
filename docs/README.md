# Documentation Index

Welcome to the STUCOMMS Booking Portal documentation. This directory contains comprehensive documentation for the entire system.

## 📚 Documentation Files

### Getting Started

- **[Setup Guide](./SETUP_GUIDE.md)** - Step-by-step guide to set up the system from scratch
- **[Complete System & Database Documentation](./SYSTEM_AND_DATABASE_COMPLETE.md)** - Comprehensive system documentation covering architecture, database schema, setup, and deployment

### Reference Documentation

- **[Database Schema Quick Reference](./DATABASE_SCHEMA_QUICK_REFERENCE.md)** - Quick reference for database tables, relationships, and common queries
- **[Architecture Specification](./architecture-spec.md)** - Detailed system architecture and data model specification

### Feature Documentation

- **[Bulk Application Import Proposal](./BULK_APPLICATION_IMPORT_PROPOSAL.md)** - System for bulk importing student applications
- **[Comprehensive Bulk Import System](./COMPREHENSIVE_BULK_IMPORT_SYSTEM.md)** - Complete bulk import system for client onboarding
- **[Booking Calendar Implementation](./BOOKING_CALENDAR_IMPLEMENTATION.md)** - Airbnb-style calendar view for studio occupancy and bookings
- **[Manual Payment Entry System](./MANUAL_PAYMENT_ENTRY_IMPLEMENTATION.md)** - Pre-application payment recording and student verification system

## 🚀 Quick Start

1. **New to the project?** Start with [Setup Guide](./SETUP_GUIDE.md)
2. **Need database info?** Check [Database Schema Quick Reference](./DATABASE_SCHEMA_QUICK_REFERENCE.md)
3. **Want full details?** Read [Complete System & Database Documentation](./SYSTEM_AND_DATABASE_COMPLETE.md)

## 📖 Documentation Structure

```
docs/
├── README.md (this file)
├── SETUP_GUIDE.md                    # Getting started guide
├── SYSTEM_AND_DATABASE_COMPLETE.md    # Complete system documentation
├── DATABASE_SCHEMA_QUICK_REFERENCE.md # Database quick reference
├── architecture-spec.md              # Architecture specification
├── BULK_APPLICATION_IMPORT_PROPOSAL.md
├── COMPREHENSIVE_BULK_IMPORT_SYSTEM.md
├── BOOKING_CALENDAR_IMPLEMENTATION.md # Booking calendar feature
└── MANUAL_PAYMENT_ENTRY_IMPLEMENTATION.md # Manual payment entry system
```

## 🔍 Finding What You Need

### I want to...

**Set up the system for the first time**
→ [Setup Guide](./SETUP_GUIDE.md)

**Understand the database structure**
→ [Database Schema Quick Reference](./DATABASE_SCHEMA_QUICK_REFERENCE.md)
→ [Complete System & Database Documentation - Database Schema](./SYSTEM_AND_DATABASE_COMPLETE.md#database-schema)

**Deploy to production**
→ [Complete System & Database Documentation - Deployment Guide](./SYSTEM_AND_DATABASE_COMPLETE.md#deployment-guide)

**Understand the system architecture**
→ [Architecture Specification](./architecture-spec.md)
→ [Complete System & Database Documentation - System Architecture](./SYSTEM_AND_DATABASE_COMPLETE.md#system-architecture)

**Import bulk data**
→ [Comprehensive Bulk Import System](./COMPREHENSIVE_BULK_IMPORT_SYSTEM.md)
→ [Bulk Application Import Proposal](./BULK_APPLICATION_IMPORT_PROPOSAL.md)

**Find a specific database table or function**
→ [Database Schema Quick Reference](./DATABASE_SCHEMA_QUICK_REFERENCE.md)

**Understand integrations (Stripe, DocuSign, etc.)**
→ [Complete System & Database Documentation - Integration Points](./SYSTEM_AND_DATABASE_COMPLETE.md#integration-points)

## 📊 System Overview

The STUCOMMS Booking Portal is a comprehensive student accommodation booking and management system with:

- **Student Portal**: Application wizard, payments, document management
- **Admin Portal**: Full management system for staff
- **Partner Portal**: Referral and commission tracking
- **Public Pages**: Studio browsing and information

### Key Technologies

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Payments**: Stripe
- **E-Signatures**: DocuSign
- **UI**: Tailwind CSS + shadcn/ui

### Database

- **104+ migrations** covering all system features
- **40+ tables** for comprehensive data management
- **Row Level Security (RLS)** for data protection
- **Functions & Views** for complex queries

## 🛠️ Common Tasks

### Database Tasks

- **Apply migrations**: `npx supabase db push`
- **Generate types**: `npx supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts`
- **Seed data**: `npm run seed`
- **Reset database** (dev only): `npx supabase db reset`

### Development Tasks

- **Start dev server**: `npm run dev`
- **Build for production**: `npm run build`
- **Run tests**: `npm test`
- **Lint code**: `npm run lint`

## 📝 Contributing

When adding new features:

1. Create database migrations in `supabase/migrations/`
2. Update TypeScript types: `npx supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts`
3. Update relevant documentation
4. Test thoroughly

## 🔗 External Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [DocuSign API Documentation](https://developers.docusign.com/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## 📞 Support

For questions or issues:

1. Check the relevant documentation file
2. Review Supabase logs
3. Check browser console for errors
4. Review application logs

---

**Last Updated**: January 2025
**System Version**: 1.0.0
**Database Migrations**: 104+
