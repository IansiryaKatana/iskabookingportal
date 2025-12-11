# Supabase Database Password Setup Script
# This script helps you set up the SUPABASE_DB_PASSWORD environment variable

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Supabase Database Password Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "To get your database password:" -ForegroundColor Yellow
Write-Host "1. Go to: https://supabase.com/dashboard/project/pzptocwdaqpczexlbajr/settings/database" -ForegroundColor White
Write-Host "2. Scroll to 'Database password' section" -ForegroundColor White
Write-Host "3. Click 'Reset database password' (if you don't know it)" -ForegroundColor White
Write-Host "4. Copy the password shown (⚠️ Only shown once!)" -ForegroundColor Red
Write-Host ""

$password = Read-Host "Enter your Supabase database password" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

if ([string]::IsNullOrWhiteSpace($passwordPlain)) {
    Write-Host "Password cannot be empty!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setting environment variable for current session..." -ForegroundColor Cyan
$env:SUPABASE_DB_PASSWORD = $passwordPlain

Write-Host "✓ Environment variable set for current PowerShell session" -ForegroundColor Green
Write-Host ""

# Option to save to .env.local
$saveToFile = Read-Host "Do you want to save this to .env.local file? (y/n)"
if ($saveToFile -eq 'y' -or $saveToFile -eq 'Y') {
    $envFile = ".env.local"
    $content = ""
    
    if (Test-Path $envFile) {
        $content = Get-Content $envFile -Raw
        # Remove existing SUPABASE_DB_PASSWORD line if present
        $content = $content -replace "SUPABASE_DB_PASSWORD=.*\r?\n", ""
    }
    
    # Add or update SUPABASE_DB_PASSWORD
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        $content = $content.TrimEnd() + "`n"
    }
    $content += "SUPABASE_DB_PASSWORD=$passwordPlain`n"
    
    Set-Content -Path $envFile -Value $content -NoNewline
    Write-Host "✓ Password saved to .env.local" -ForegroundColor Green
    Write-Host "⚠️  Make sure .env.local is in .gitignore (it should be)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Testing connection..." -ForegroundColor Cyan
$testResult = supabase db pull --dry-run 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Connection successful!" -ForegroundColor Green
} else {
    Write-Host "✗ Connection failed. Please verify your password." -ForegroundColor Red
    Write-Host "You can run 'supabase db pull' manually to test." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Note: To make this permanent, you can:" -ForegroundColor Cyan
Write-Host "1. Add SUPABASE_DB_PASSWORD to your system environment variables" -ForegroundColor White
Write-Host "2. Or use .env.local file (already done if you chose yes above)" -ForegroundColor White
Write-Host ""



