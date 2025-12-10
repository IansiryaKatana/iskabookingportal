# Backup Script - Before Phase 1 Migration
# Purpose: Create database backup before running Phase 1 performance indexes migration
# Date: 2025-01-28

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Phase 1 Pre-Migration Backup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupDir = "backups"
$backupName = "backup_pre_phase1_$timestamp"

# Create backups directory if it doesn't exist
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    Write-Host "Created backups directory: $backupDir" -ForegroundColor Green
}

Write-Host "Backup Name: $backupName" -ForegroundColor Yellow
Write-Host ""

# Method 1: Check for Supabase CLI
Write-Host "Checking for Supabase CLI..." -ForegroundColor Yellow
if (Get-Command supabase -ErrorAction SilentlyContinue) {
    Write-Host "✓ Supabase CLI found" -ForegroundColor Green
    Write-Host ""
    Write-Host "To create a backup using Supabase CLI:" -ForegroundColor Cyan
    Write-Host "1. Make sure you're logged in: supabase login" -ForegroundColor White
    Write-Host "2. Link your project: supabase link --project-ref YOUR_PROJECT_REF" -ForegroundColor White
    Write-Host "3. Create backup: supabase db dump -f $backupDir\$backupName.sql" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✗ Supabase CLI not found" -ForegroundColor Yellow
    Write-Host ""
}

# Method 2: Supabase Dashboard Instructions
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RECOMMENDED: Supabase Dashboard Backup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 1: Go to Supabase Dashboard" -ForegroundColor Yellow
Write-Host "  URL: https://supabase.com/dashboard" -ForegroundColor White
Write-Host ""
Write-Host "Step 2: Navigate to Database → Backups" -ForegroundColor Yellow
Write-Host ""
Write-Host "Step 3: Click 'Create Backup' or 'New Backup'" -ForegroundColor Yellow
Write-Host ""
Write-Host "Step 4: Name it: pre-phase1-indexes-$timestamp" -ForegroundColor Yellow
Write-Host ""
Write-Host "Step 5: Wait for backup to complete" -ForegroundColor Yellow
Write-Host "        Estimated time: 1-5 minutes" -ForegroundColor Gray
Write-Host ""
Write-Host "Step 6: Verify backup appears in the list" -ForegroundColor Yellow
Write-Host ""

# Method 3: Generate SQL verification queries
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Pre-Migration Verification Queries" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run these queries in Supabase SQL Editor BEFORE migration:" -ForegroundColor Yellow
Write-Host ""

$verificationQueries = @'
-- 1. Check Current Indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN (
  'student_applications', 
  'docusign_envelopes', 
  'notifications', 
  'manual_payments', 
  'studios'
)
ORDER BY tablename, indexname;

-- 2. Check Table Row Counts
SELECT 
  'student_applications' as table_name, 
  COUNT(*) as row_count 
FROM public.student_applications
UNION ALL
SELECT 
  'docusign_envelopes', 
  COUNT(*) 
FROM public.docusign_envelopes
UNION ALL
SELECT 
  'notifications', 
  COUNT(*) 
FROM public.notifications
UNION ALL
SELECT 
  'manual_payments', 
  COUNT(*) 
FROM public.manual_payments
UNION ALL
SELECT 
  'studios', 
  COUNT(*) 
FROM public.studios;

-- 3. Check Database Size
SELECT 
  pg_size_pretty(pg_database_size(current_database())) as database_size;
'@

$verificationFile = "$backupDir\pre_migration_verification_queries.sql"
$verificationQueries | Out-File -FilePath $verificationFile -Encoding UTF8

Write-Host "✓ Saved verification queries to: $verificationFile" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backup Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backup Methods Available:" -ForegroundColor Yellow
Write-Host "  1. Supabase Dashboard (Recommended - Easiest)" -ForegroundColor White
Write-Host "  2. Supabase CLI (If installed)" -ForegroundColor White
Write-Host "  3. SQL Export (Manual - for critical tables)" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Create backup using Supabase Dashboard" -ForegroundColor White
Write-Host "  2. Run verification queries (saved to $verificationFile)" -ForegroundColor White
Write-Host "  3. Save query results for comparison" -ForegroundColor White
Write-Host "  4. Proceed with Phase 1 migration" -ForegroundColor White
Write-Host ""
Write-Host "Documentation: See docs/BACKUP_GUIDE_PHASE1.md for detailed instructions" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

