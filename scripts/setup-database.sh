#!/bin/bash

# STUCOMMS Booking Portal - Database Setup Script
# This script helps set up the database for the first time

set -e

echo "🚀 STUCOMMS Booking Portal - Database Setup"
echo "============================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo "   Install it with: npm install -g supabase"
    exit 1
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local file not found."
    echo "   Please create it with your Supabase credentials:"
    echo "   VITE_SUPABASE_URL=your_url"
    echo "   VITE_SUPABASE_PUBLISHABLE_KEY=your_key"
    echo "   SUPABASE_SERVICE_ROLE_KEY=your_service_key"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📋 Setup Steps:"
echo "1. Link to Supabase project"
echo "2. Apply database migrations"
echo "3. Generate TypeScript types"
echo "4. (Optional) Seed initial data"
echo ""

# Step 1: Link to Supabase
echo "Step 1: Linking to Supabase project..."
echo "   If you haven't linked yet, you'll need your project reference ID."
read -p "   Have you already linked? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    read -p "   Enter your Supabase project reference ID: " PROJECT_REF
    supabase link --project-ref "$PROJECT_REF"
fi

# Step 2: Apply migrations
echo ""
echo "Step 2: Applying database migrations..."
read -p "   Apply all migrations? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    supabase db push
    echo "✅ Migrations applied successfully"
else
    echo "⏭️  Skipping migrations"
fi

# Step 3: Generate TypeScript types
echo ""
echo "Step 3: Generating TypeScript types..."
read -p "   Generate types? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts
    echo "✅ TypeScript types generated"
else
    echo "⏭️  Skipping type generation"
fi

# Step 4: Seed data
echo ""
echo "Step 4: Seed initial data..."
read -p "   Seed database with sample data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run seed
    echo "✅ Database seeded successfully"
else
    echo "⏭️  Skipping seed"
fi

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure storage bucket policies in Supabase Dashboard"
echo "2. Set up Stripe webhook endpoints"
echo "3. Configure DocuSign environment variables"
echo "4. Set up email sending (if using transactional emails)"
echo ""
echo "📚 See docs/SYSTEM_AND_DATABASE_COMPLETE.md for full documentation"

