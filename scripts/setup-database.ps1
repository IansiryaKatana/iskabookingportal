# STUCOMMS Booking Portal - Database Setup Script (PowerShell)
# This script helps set up the database for the first time

Write-Host "🚀 STUCOMMS Booking Portal - Database Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
try {
    $null = Get-Command supabase -ErrorAction Stop
} catch {
    Write-Host "❌ Supabase CLI is not installed." -ForegroundColor Red
    Write-Host "   Install it with: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "⚠️  .env.local file not found." -ForegroundColor Yellow
    Write-Host "   Please create it with your Supabase credentials:"
    Write-Host "   VITE_SUPABASE_URL=your_url"
    Write-Host "   VITE_SUPABASE_PUBLISHABLE_KEY=your_key"
    Write-Host "   SUPABASE_SERVICE_ROLE_KEY=your_service_key"
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

Write-Host "📋 Setup Steps:"
Write-Host "1. Link to Supabase project"
Write-Host "2. Apply database migrations"
Write-Host "3. Generate TypeScript types"
Write-Host "4. (Optional) Seed initial data"
Write-Host ""

# Step 1: Link to Supabase
Write-Host "Step 1: Linking to Supabase project..."
Write-Host "   If you haven't linked yet, you'll need your project reference ID."
$linked = Read-Host "   Have you already linked? (y/n)"
if ($linked -ne "y" -and $linked -ne "Y") {
    $projectRef = Read-Host "   Enter your Supabase project reference ID"
    supabase link --project-ref $projectRef
}

# Step 2: Apply migrations
Write-Host ""
Write-Host "Step 2: Applying database migrations..."
$applyMigrations = Read-Host "   Apply all migrations? (y/n)"
if ($applyMigrations -eq "y" -or $applyMigrations -eq "Y") {
    supabase db push
    Write-Host "✅ Migrations applied successfully" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping migrations" -ForegroundColor Yellow
}

# Step 3: Generate TypeScript types
Write-Host ""
Write-Host "Step 3: Generating TypeScript types..."
$generateTypes = Read-Host "   Generate types? (y/n)"
if ($generateTypes -eq "y" -or $generateTypes -eq "Y") {
    supabase gen types typescript --linked > src/integrations/supabase/types.generated.ts
    Write-Host "✅ TypeScript types generated" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping type generation" -ForegroundColor Yellow
}

# Step 4: Seed data
Write-Host ""
Write-Host "Step 4: Seed initial data..."
$seedData = Read-Host "   Seed database with sample data? (y/n)"
if ($seedData -eq "y" -or $seedData -eq "Y") {
    npm run seed
    Write-Host "✅ Database seeded successfully" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping seed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Configure storage bucket policies in Supabase Dashboard"
Write-Host "2. Set up Stripe webhook endpoints"
Write-Host "3. Configure DocuSign environment variables"
Write-Host "4. Set up email sending (if using transactional emails)"
Write-Host ""
Write-Host "📚 See docs/SYSTEM_AND_DATABASE_COMPLETE.md for full documentation" -ForegroundColor Cyan

