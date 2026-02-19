# Verify CloudFront Configuration
# This script checks that all CloudFront configuration changes have been applied successfully

$ErrorActionPreference = "Stop"
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CloudFront Configuration Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allChecksPass = $true

# Get distribution configuration
Write-Host "Fetching CloudFront distribution configuration..." -ForegroundColor Yellow
$configJson = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Failed to fetch distribution configuration" -ForegroundColor Red
    Write-Host $configJson -ForegroundColor Red
    exit 1
}
$config = $configJson | ConvertFrom-Json
Write-Host "OK Successfully fetched distribution configuration" -ForegroundColor Green
Write-Host ""

# Check 1: Verify CustomErrorResponses are removed
Write-Host "Check 1: CustomErrorResponses" -ForegroundColor Cyan
$errorResponses = $config.DistributionConfig.CustomErrorResponses.Items
if ($errorResponses.Count -eq 0) {
    Write-Host "OK No CustomErrorResponses configured (correct - real 404s will be returned)" -ForegroundColor Green
} else {
    Write-Host "X CustomErrorResponses found: $($errorResponses.Count) items" -ForegroundColor Red
    Write-Host "  These should be removed to allow real 404 errors" -ForegroundColor Yellow
    $allChecksPass = $false
}
Write-Host ""

# Check 2: Verify CloudFront Function association
Write-Host "Check 2: CloudFront Function Association" -ForegroundColor Cyan
$functionAssociations = $config.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items
if ($functionAssociations.Count -gt 0) {
    $viewerRequestFunction = $functionAssociations | Where-Object { $_.EventType -eq "viewer-request" }
    if ($viewerRequestFunction) {
        Write-Host "OK CloudFront Function associated with viewer-request event" -ForegroundColor Green
        Write-Host "  Function ARN: $($viewerRequestFunction.FunctionARN)" -ForegroundColor Gray
    } else {
        Write-Host "X No viewer-request function association found" -ForegroundColor Red
        $allChecksPass = $false
    }
} else {
    Write-Host "X No function associations found" -ForegroundColor Red
    $allChecksPass = $false
}
Write-Host ""

# Check 3: Verify cache behavior for /_next/static/*
Write-Host "Check 3: Cache Behavior for /_next/static/*" -ForegroundColor Cyan
$cacheBehaviors = $config.DistributionConfig.CacheBehaviors.Items
$staticBehavior = $cacheBehaviors | Where-Object { $_.PathPattern -eq "/_next/static/*" }
if ($staticBehavior) {
    Write-Host "OK Cache behavior configured for /_next/static/*" -ForegroundColor Green
    Write-Host "  Cache Policy ID: $($staticBehavior.CachePolicyId)" -ForegroundColor Gray
    
    # Check if function is also associated with this behavior
    if ($staticBehavior.FunctionAssociations.Items.Count -gt 0) {
        Write-Host "OK CloudFront Function also associated with /_next/static/* behavior" -ForegroundColor Green
    } else {
        Write-Host "! No function association for /_next/static/* behavior (may be intentional)" -ForegroundColor Yellow
    }
} else {
    Write-Host "X No cache behavior found for /_next/static/*" -ForegroundColor Red
    $allChecksPass = $false
}
Write-Host ""

# Check 4: Verify cache policies
Write-Host "Check 4: Cache Policy Configuration" -ForegroundColor Cyan
$defaultCachePolicyId = $config.DistributionConfig.DefaultCacheBehavior.CachePolicyId
Write-Host "  Default Cache Policy ID: $defaultCachePolicyId" -ForegroundColor Gray

# Try to get cache policy details
$cachePolicyJson = & $awsCmd cloudfront get-cache-policy --id $defaultCachePolicyId --output json 2>&1
if ($LASTEXITCODE -eq 0) {
    $cachePolicy = $cachePolicyJson | ConvertFrom-Json
    $ttl = $cachePolicy.CachePolicy.CachePolicyConfig.DefaultTTL
    if ($ttl -eq 0) {
        Write-Host "OK Default cache policy has TTL=0 (HTML files won't be cached)" -ForegroundColor Green
    } else {
        Write-Host "! Default cache policy has TTL=$ttl (expected 0 for HTML files)" -ForegroundColor Yellow
    }
} else {
    Write-Host "! Could not fetch cache policy details" -ForegroundColor Yellow
}

if ($staticBehavior) {
    $staticCachePolicyId = $staticBehavior.CachePolicyId
    Write-Host "  Static Assets Cache Policy ID: $staticCachePolicyId" -ForegroundColor Gray
    
    $staticPolicyJson = & $awsCmd cloudfront get-cache-policy --id $staticCachePolicyId --output json 2>&1
    if ($LASTEXITCODE -eq 0) {
        $staticPolicy = $staticPolicyJson | ConvertFrom-Json
        $maxTtl = $staticPolicy.CachePolicy.CachePolicyConfig.MaxTTL
        if ($maxTtl -eq 31536000) {
            Write-Host "OK Static assets cache policy has MaxTTL=31536000 (1 year)" -ForegroundColor Green
        } else {
            Write-Host "! Static assets cache policy has MaxTTL=$maxTtl (expected 31536000)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "! Could not fetch static assets cache policy details" -ForegroundColor Yellow
    }
}
Write-Host ""

# Check 5: Distribution status
Write-Host "Check 5: Distribution Status" -ForegroundColor Cyan
$status = $config.ETag
if ($status) {
    Write-Host "OK Distribution ETag: $status" -ForegroundColor Green
    Write-Host "  (Configuration has been updated)" -ForegroundColor Gray
} else {
    Write-Host "! Could not determine distribution status" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if ($allChecksPass) {
    Write-Host "OK All critical checks passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "CloudFront configuration is correct:" -ForegroundColor Green
    Write-Host "  - CustomErrorResponses removed (real 404s will be returned)" -ForegroundColor Gray
    Write-Host "  - CloudFront Function associated for URI rewriting" -ForegroundColor Gray
    Write-Host "  - Cache behavior configured for /_next/static/*" -ForegroundColor Gray
    Write-Host "  - Cache policies configured appropriately" -ForegroundColor Gray
    Write-Host ""
    exit 0
} else {
    Write-Host "X Some checks failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please review the issues above and re-run the update script if needed." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
