# Full Supabase migration pack dump
# Requires: SUPABASE_DB_PASSWORD env var set to the current database password
# Uses portable pg_dump in .tools/pgsql (no Docker required)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DateStamp = Get-Date -Format "yyyy-MM-dd"
$DumpDir = Join-Path $ProjectRoot "supabase-dump\$DateStamp"
$PgDump = Join-Path $ProjectRoot ".tools\pgsql\pgsql\bin\pg_dump.exe"

if (-not $env:SUPABASE_DB_PASSWORD) {
  Write-Error "Set SUPABASE_DB_PASSWORD first. Reset in Dashboard -> Settings -> Database if unsure."
}

if (-not (Test-Path $PgDump)) {
  Write-Error "pg_dump not found at $PgDump. Re-run setup or install PostgreSQL client tools."
}

New-Item -ItemType Directory -Force -Path $DumpDir | Out-Null
Set-Location $ProjectRoot

$env:PGHOST = "aws-1-ap-southeast-1.pooler.supabase.com"
$env:PGPORT = "5432"
$env:PGUSER = "postgres.pzptocwdaqpczexlbajr"
$env:PGPASSWORD = $env:SUPABASE_DB_PASSWORD
$env:PGDATABASE = "postgres"

$excludeSchema = "information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault"

Write-Host "1/4 Schema dump..."
& $PgDump --schema-only --quote-all-identifiers --role=postgres --exclude-schema=$excludeSchema -f "$DumpDir\schema.sql"

Write-Host "2/4 Data dump (all schemas incl. auth, storage metadata)..."
$dataExclude = "information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor"
& $PgDump --data-only --quote-all-identifiers --role=postgres --exclude-schema=$dataExclude --exclude-table=auth.schema_migrations --exclude-table=storage.migrations --exclude-table=supabase_functions.migrations --schema="*" -f "$DumpDir\data.sql"

Write-Host "3/4 Auth-only data dump (separate file for ordered restore)..."
& $PgDump --data-only --quote-all-identifiers --role=postgres --schema=auth --exclude-table=auth.schema_migrations -f "$DumpDir\auth_data.sql"

if (-not $env:SKIP_STORAGE_DUMP) {
  Write-Host "4/4 Storage files..."
  node (Join-Path $ProjectRoot "scripts\dump-storage.mjs") (Join-Path $DumpDir "storage")
} else {
  Write-Host "4/4 Storage files skipped (SKIP_STORAGE_DUMP set)"
}

Write-Host "`nDone. Dump folder: $DumpDir"
Get-ChildItem $DumpDir -File | ForEach-Object { Write-Host ("  {0,-20} {1:N2} MB" -f $_.Name, ($_.Length / 1MB)) }
