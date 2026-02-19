# Deploy to S3 with Correct Cache-Control Headers
# This script uploads the Next.js static export to S3 with appropriate cache headers
# and creates a CloudFront invalidation to ensure changes are visible immediately.

param(
    [string]$BucketName = "polizalab-crm-frontend",
    [string]$DistributionId = "E1WB95BQGR0YAT",
    [string]$SourceDir = "out",
    [switch]$DryRun
)

# Use AWS CLI v2 explicitly (required for modern AWS features)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Verify AWS CLI v2 is available
if (-not (Test-Path $awsCmd)) {
    Write-Host "ERROR: AWS CLI v2 not found at: $awsCmd" -ForegroundColor Red
    Write-Host "Please install AWS CLI v2 from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Verify source directory exists
if (-not (Test-Path $SourceDir)) {
    Write-Host "ERROR: Source directory not found: $SourceDir" -ForegroundColor Red
    Write-Host "Please run 'npm run build' first to generate the static export" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploying to S3 with Cache-Control Headers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Bucket: $BucketName" -ForegroundColor White
Write-Host "Distribution: $DistributionId" -ForegroundColor White
Write-Host "Source: $SourceDir" -ForegroundColor White
if ($DryRun) {
    Write-Host "Mode: DRY RUN (no changes will be made)" -ForegroundColor Yellow
}
Write-Host ""

# Step 1: Upload versioned assets with immutable cache headers
Write-Host "[1/3] Uploading versioned assets (/_next/static/*, etc.)..." -ForegroundColor Cyan

$syncArgs = @(
    "s3", "sync",
    "$SourceDir/",
    "s3://$BucketName/",
    "--cache-control", "public, max-age=31536000, immutable",
    "--exclude", "*.html",
    "--exclude", "*.json"
)

if ($DryRun) {
    $syncArgs += "--dryrun"
}

$output = & $awsCmd $syncArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload versioned assets" -ForegroundColor Red
    Write-Host $output -ForegroundColor Red
    exit 1
}
Write-Host $output -ForegroundColor Gray
Write-Host "Versioned assets uploaded successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Upload HTML and JSON files with no-cache headers
Write-Host "[2/3] Uploading HTML and JSON files..." -ForegroundColor Cyan

$syncArgs = @(
    "s3", "sync",
    "$SourceDir/",
    "s3://$BucketName/",
    "--cache-control", "no-cache, max-age=0, must-revalidate",
    "--exclude", "*",
    "--include", "*.html",
    "--include", "*.json"
)

if ($DryRun) {
    $syncArgs += "--dryrun"
}

$output = & $awsCmd $syncArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload HTML and JSON files" -ForegroundColor Red
    Write-Host $output -ForegroundColor Red
    exit 1
}
Write-Host $output -ForegroundColor Gray
Write-Host "HTML and JSON files uploaded successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Create CloudFront invalidation
if (-not $DryRun) {
    Write-Host "[3/3] Creating CloudFront invalidation..." -ForegroundColor Cyan
    
    $invalidationOutput = & $awsCmd cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" --output json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create CloudFront invalidation" -ForegroundColor Red
        Write-Host $invalidationOutput -ForegroundColor Red
        exit 1
    }
    
    $invalidation = $invalidationOutput | ConvertFrom-Json
    $invalidationId = $invalidation.Invalidation.Id
    
    Write-Host "Invalidation created: $invalidationId" -ForegroundColor Green
    Write-Host ""
    Write-Host "Waiting for invalidation to complete..." -ForegroundColor Cyan
    
    $waitOutput = & $awsCmd cloudfront wait invalidation-completed --distribution-id $DistributionId --id $invalidationId 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Failed to wait for invalidation completion" -ForegroundColor Yellow
        Write-Host $waitOutput -ForegroundColor Yellow
        Write-Host "The invalidation is still in progress. Check AWS Console for status." -ForegroundColor Yellow
    } else {
        Write-Host "Invalidation completed successfully" -ForegroundColor Green
    }
    Write-Host ""
} else {
    Write-Host "[3/3] Skipping CloudFront invalidation (dry run mode)" -ForegroundColor Yellow
    Write-Host ""
}

# Success summary
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Visit https://crm.antesdefirmar.org to verify deployment" -ForegroundColor White
Write-Host "2. Check browser DevTools Network tab for correct Cache-Control headers" -ForegroundColor White
Write-Host "3. Test all routes: /, /register, /login, /profile" -ForegroundColor White
Write-Host ""

exit 0
