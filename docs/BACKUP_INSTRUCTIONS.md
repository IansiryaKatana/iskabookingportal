# Backup Instructions - Urban Hub Booking Portal
**Date:** November 2025  
**Before Major Implementation**

## Codebase Backup

### Git Backup (Recommended)
The codebase is already version controlled with Git. To create a backup:

```bash
# Ensure all changes are committed
git add .
git commit -m "Backup before major feature implementation - Studio Availability, Payment Tracking, Rebooking, etc."

# Create a backup tag
git tag -a backup-pre-major-features -m "Backup before implementing studio availability, payment tracking, rebooking, and finance enhancements"

# Push to remote (if you have a remote repository)
git push origin main
git push origin backup-pre-major-features
```

### Manual Backup (Alternative)
If you prefer a manual backup:

```bash
# Create backup directory
mkdir -p ../urban-hub-backup-$(date +%Y%m%d)

# Copy entire project
cp -r . ../urban-hub-backup-$(date +%Y%m%d)/
```

## Database Backup

### Supabase Dashboard Method (Recommended)
1. Go to Supabase Dashboard → Your Project
2. Navigate to **Settings** → **Database**
3. Click **Backups** tab
4. Click **Create Backup** or use existing scheduled backup
5. Download the backup file

### Supabase CLI Method
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project (if not already linked)
npx supabase link --project-ref YOUR_PROJECT_REF

# Create database backup
npx supabase db dump -f backup-$(date +%Y%m%d).sql
```

### pg_dump Method (Direct PostgreSQL)
```bash
# Get connection string from Supabase Dashboard → Settings → Database
# Connection string format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" > backup-$(date +%Y%m%d).sql
```

## What to Backup

### Codebase
- ✅ All source files (`src/`)
- ✅ Configuration files (`supabase/`, `package.json`, etc.)
- ✅ Environment variables (`.env.local` - store securely, not in git)
- ✅ Documentation (`docs/`)

### Database
- ✅ All tables and data
- ✅ RLS policies
- ✅ Functions and triggers
- ✅ Storage buckets metadata (files stored separately)

### Storage
- ✅ Supabase Storage buckets:
  - `studio-media/`
  - `documents/`
  - `contracts/`
- Note: Large files may need separate backup strategy

## Verification

After backup, verify:
1. ✅ Git commit successful
2. ✅ Database backup file exists and is readable
3. ✅ Storage files accessible
4. ✅ Can restore from backup if needed

## Restoration

### Restore Codebase
```bash
# From git tag
git checkout backup-pre-major-features

# Or from manual backup
cp -r ../urban-hub-backup-YYYYMMDD/* .
```

### Restore Database
```bash
# Using Supabase CLI
npx supabase db reset
psql "postgresql://..." < backup-YYYYMMDD.sql

# Or via Supabase Dashboard → Database → Restore
```

## Important Notes

- **Environment Variables**: Backup `.env.local` separately (not in git)
- **Secrets**: API keys, passwords stored in Supabase Secrets (backed up separately)
- **Storage Files**: May need manual download if very large
- **Test Restore**: Consider testing restore process before major changes

---

**Backup Created:** [Date will be filled when backup is created]  
**Backup Location:** [Will be updated]  
**Status:** Ready for implementation

