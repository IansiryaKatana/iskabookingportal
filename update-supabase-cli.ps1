# Supabase CLI Update Script
# This script downloads and installs the latest Supabase CLI

Write-Host "Checking for latest Supabase CLI version..." -ForegroundColor Cyan

# Get latest release info
try {
    $response = Invoke-WebRequest -Uri "https://api.github.com/repos/supabase/cli/releases/latest" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    $latestVersion = $json.tag_name -replace 'v', ''
    
    Write-Host "Latest version: $latestVersion" -ForegroundColor Green
    
    # Check current version
    $currentVersion = ""
    try {
        $currentVersion = (supabase --version 2>&1 | Out-String).Trim()
        Write-Host "Current version: $currentVersion" -ForegroundColor Yellow
    } catch {
        Write-Host "Supabase CLI not found or error checking version" -ForegroundColor Yellow
    }
    
    # Find Windows binary
    $asset = $json.assets | Where-Object { 
        $_.name -like "*windows*amd64*" -or $_.name -like "*windows*x86_64*" 
    }
    
    if (-not $asset) {
        Write-Host "Error: Windows binary not found in release assets" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`nDownloading $($asset.name)..." -ForegroundColor Cyan
    $ProgressPreference = 'SilentlyContinue'
    $downloadPath = "$env:TEMP\supabase_cli.tar.gz"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $downloadPath
    
    Write-Host "Extracting..." -ForegroundColor Cyan
    $extractPath = "$env:TEMP\supabase_extracted"
    if (Test-Path $extractPath) {
        Remove-Item $extractPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
    tar -xzf $downloadPath -C $extractPath
    
    # Find the supabase.exe file
    $exeFile = Get-ChildItem $extractPath -Recurse -Filter "supabase.exe" | Select-Object -First 1
    
    if (-not $exeFile) {
        Write-Host "Error: supabase.exe not found in extracted files" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Installing to $env:APPDATA\npm\supabase.exe..." -ForegroundColor Cyan
    Copy-Item $exeFile.FullName -Destination "$env:APPDATA\npm\supabase.exe" -Force
    
    # Cleanup
    Remove-Item $downloadPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    
    Write-Host "`nVerifying installation..." -ForegroundColor Cyan
    $newVersion = (supabase --version 2>&1 | Out-String).Trim()
    Write-Host "`n✓ Supabase CLI updated successfully!" -ForegroundColor Green
    Write-Host "  New version: $newVersion" -ForegroundColor Green
    
} catch {
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

