# CloudFront Configuration Verification Script
# Verifies CloudFront distribution configuration for routing fix
# Requirements: 2.3, 5.5, 6.3

param(
    [string]$DistributionId = "E1WB95BQGR0YAT"
)

$ErrorActionPreference = "Stop"
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CloudFront Configuration Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get distribution configuration
Write-Host "Fetching CloudFront distribution configuration..." -ForegroundColor Yellow
try {
    $configJson = & $awsCmd cloudfront get-distribution-config --id $DistributionId --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to fetch distribution configuration" -ForegroundColor Red
        Write-Host $configJson -ForegroundColor Red
        exit 1
    }
    $config = $configJson | ConvertFrom-Json
} catch {
    Write-Host "✗ Error parsing distribution configuration: $_" -ForegroundColor Red
    exit 1
}

$failures = @()
$warnings = @()

# Check 1: Verify no CustomErrorResponses for 404
Write-Host "Checking CustomErrorResponses..." -ForegroundColor Yellow
$errorResponses = $config.DistributionConfig.CustomErrorResponses.Items
if ($errorResponses.Count -eq 0) {
    Write-Host "  ✓ No CustomErrorResponses configured (correct - real 404s will be returned)" -ForegroundColor Green
} else {
    $has404Response = $false
    foreach ($response in $errorResponses) {
        if ($response.ErrorCode -eq 404 -or $response.ErrorCode -eq 403) {
            $has404Response = $true
            $failures += "CustomErrorResponse found for error code $($response.ErrorCode) -> $($response.ResponseCode)"
        }
    }
    if ($has404Response) {
        Write-Host "  ✗ CustomErrorResponses found (should be removed for proper 404 handling)" -ForegroundColor Red
    } else {
        Write-Host "  ⚠ CustomErrorResponses exist but not for 404/403" -ForegroundColor Yellow
        $warnings += "CustomErrorResponses exist: $($errorResponses.Count) items"
    }
}

# Check 2: Verify CloudFront Function association
Write-Host "Checking CloudFront Function association..." -ForegroundColor Yellow
$functionAssociations = $config.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items
if ($functionAssociations.Count -gt 0) {
    $viewerRequestFunction = $functionAssociations | Where-Object { $_.EventType -eq "viewer-request" }
    if ($viewerRequestFunction) {
        Write-Host "  ✓ CloudFront Function associated with viewer-request event" -ForegroundColor Green
        Write-Host "    Function ARN: $($viewerRequestFunction.FunctionARN)" -ForegroundColor Gray
    } else {
        $failures += "No viewer-request function association found"
        Write-Host "  ✗ No viewer-request function association found" -ForegroundColor Red
    }
} else {
    $failures += "No function associations configured"
    Write-Host "  ✗ No function associations configured" -ForegroundColor Red
}

# Check 3: Verify cache behavior for /_next/static/*
Write-Host "Checking cache behavior for /_next/static/*..." -ForegroundColor Yellow
$cacheBehaviors = $config.DistributionConfig.CacheBehaviors.Items
$staticBehavior = $cacheBehaviors | Where-Object { $_.PathPattern -eq "/_next/static/*" }
if ($staticBehavior) {
    Write-Host "  ✓ Cache behavior configured for /_next/static/*" -ForegroundColor Green
    Write-Host "    Cache Policy ID: $($staticBehavior.CachePolicyId)" -ForegroundColor Gray
    
    # Verify function association on this behavior too
    $staticFunctionAssociations = $staticBehavior.FunctionAssociations.Items
    if ($staticFunctionAssociations.Count -gt 0) {
        $staticViewerRequestFunction = $staticFunctionAssociations | Where-Object { $_.EventType -eq "viewer-request" }
        if ($staticViewerRequestFunction) {
            Write-Host "    ✓ Function associated with /_next/static/* behavior" -ForegroundColor Green
        } else {
            $warnings += "No viewer-request function on /_next/static/* behavior"
            Write-Host "    ⚠ No viewer-request function on /_next/static/* behavior" -ForegroundColor Yellow
        }
    } else {
        $warnings += "No function associations on /_next/static/* behavior"
        Write-Host "    ⚠ No function associations on /_next/static/* behavior" -ForegroundColor Yellow
    }
} else {
    $failures += "No cache behavior configured for /_next/static/*"
    Write-Host "  ✗ No cache behavior configured for /_next/static/*" -ForegroundColor Red
}

# Check 4: Verify default cache behavior has appropriate cache policy
Write-Host "Checking default cache behavior cache policy..." -ForegroundColor Yellow
$defaultCachePolicyId = $config.DistributionConfig.DefaultCacheBehavior.CachePolicyId
if ($defaultCachePolicyId) {
    Write-Host "  ✓ Cache policy configured on default behavior" -ForegroundColor Green
    Write-Host "    Cache Policy ID: $defaultCachePolicyId" -ForegroundColor Gray
} else {
    $warnings += "No cache policy on default behavior (using legacy cache settings)"
    Write-Host "  ⚠ No cache policy on default behavior (using legacy cache settings)" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($failures.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✓ All CloudFront configuration checks passed!" -ForegroundColor Green
    exit 0
} elseif ($failures.Count -eq 0) {
    Write-Host "⚠ Configuration is valid but has warnings:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
    exit 0
} else {
    Write-Host "✗ Configuration verification failed:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    if ($warnings.Count -gt 0) {
        Write-Host ""
        Write-Host "Warnings:" -ForegroundColor Yellow
        foreach ($warning in $warnings) {
            Write-Host "  - $warning" -ForegroundColor Yellow
        }
    }
    exit 1
}
