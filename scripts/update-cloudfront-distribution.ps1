# Update CloudFront Distribution Configuration
# This script updates the CloudFront distribution with:
# - CloudFront Function association for URI rewriting
# - Cache policies for HTML and versioned assets
# - Removal of CustomErrorResponses (SPA-style error handling)
# - Cache behavior for /_next/static/* path pattern
# Requirements: 2.3, 2.4, 5.5, 5.6, 6.3, 6.4

param(
    [string]$DistributionId = "E1WB95BQGR0YAT",
    [string]$FunctionArnFile = "cloudfront-function-arn.txt",
    [string]$CachePolicyIdsFile = "cloudfront-cache-policy-ids.json",
    [string]$BackupConfigFile = "cloudfront-config/distribution-backup.json",
    [string]$UpdatedConfigFile = "cloudfront-config/distribution-updated.json"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CloudFront Distribution Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Use AWS CLI v2
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Check if AWS CLI v2 is available
if (-not (Test-Path $awsCmd)) {
    Write-Host "ERROR: AWS CLI v2 not found at: $awsCmd" -ForegroundColor Red
    Write-Host "Please install AWS CLI v2 from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Using AWS CLI v2: $awsCmd" -ForegroundColor Green
Write-Host ""

# Check if required files exist
if (-not (Test-Path $FunctionArnFile)) {
    Write-Host "ERROR: CloudFront Function ARN file not found: $FunctionArnFile" -ForegroundColor Red
    Write-Host "Please run deploy-cloudfront-function.ps1 first" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $CachePolicyIdsFile)) {
    Write-Host "ERROR: Cache policy IDs file not found: $CachePolicyIdsFile" -ForegroundColor Red
    Write-Host "Please run deploy-cache-policies.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Read CloudFront Function ARN
$functionArn = Get-Content -Path $FunctionArnFile -Raw
$functionArn = $functionArn.Trim()
Write-Host "CloudFront Function ARN: $functionArn" -ForegroundColor White

# Read Cache Policy IDs
$cachePolicyIds = Get-Content -Path $CachePolicyIdsFile -Raw | ConvertFrom-Json
$htmlPolicyId = $cachePolicyIds.HtmlPolicyId
$assetsPolicyId = $cachePolicyIds.AssetsPolicyId

Write-Host "HTML Cache Policy ID: $htmlPolicyId" -ForegroundColor White
Write-Host "Assets Cache Policy ID: $assetsPolicyId" -ForegroundColor White
Write-Host ""

# Step 1: Backup current configuration (if not already backed up)
if (-not (Test-Path $BackupConfigFile)) {
    Write-Host "Step 1: Backing up current distribution configuration..." -ForegroundColor Cyan
    
    try {
        $backupResult = & $awsCmd cloudfront get-distribution-config `
            --id $DistributionId `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Failed to get distribution configuration" -ForegroundColor Red
            Write-Host $backupResult -ForegroundColor Red
            exit 1
        }
        
        # Ensure backup directory exists
        $backupDir = Split-Path -Parent $BackupConfigFile
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        
        $backupResult | Out-File -FilePath $BackupConfigFile -Encoding UTF8
        Write-Host "OK Configuration backed up to: $BackupConfigFile" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR: Failed to backup configuration" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Step 1: Using existing backup at: $BackupConfigFile" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Get current distribution configuration
Write-Host "Step 2: Retrieving current distribution configuration..." -ForegroundColor Cyan

try {
    $configResult = & $awsCmd cloudfront get-distribution-config `
        --id $DistributionId `
        --output json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to get distribution configuration" -ForegroundColor Red
        Write-Host $configResult -ForegroundColor Red
        exit 1
    }
    
    $distConfig = $configResult | ConvertFrom-Json
    $etag = $distConfig.ETag
    $config = $distConfig.DistributionConfig
    
    Write-Host "OK Configuration retrieved successfully" -ForegroundColor Green
    Write-Host "  ETag: $etag" -ForegroundColor White
}
catch {
    Write-Host "ERROR: Failed to parse distribution configuration" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Modify configuration
Write-Host "Step 3: Modifying distribution configuration..." -ForegroundColor Cyan

# 3.1: Remove CustomErrorResponses (SPA-style error handling)
Write-Host "  - Removing CustomErrorResponses..." -ForegroundColor White
$config.CustomErrorResponses = @{
    Quantity = 0
    Items = @()
}
Write-Host "    OK CustomErrorResponses removed" -ForegroundColor Green

# 3.2: Add CloudFront Function association to DefaultCacheBehavior
Write-Host "  - Adding CloudFront Function to DefaultCacheBehavior..." -ForegroundColor White

# Initialize FunctionAssociations if it doesn't exist
if (-not $config.DefaultCacheBehavior.PSObject.Properties['FunctionAssociations']) {
    $config.DefaultCacheBehavior | Add-Member -MemberType NoteProperty -Name 'FunctionAssociations' -Value @{
        Quantity = 0
        Items = @()
    }
}

# Check if function is already associated
$existingFunction = $config.DefaultCacheBehavior.FunctionAssociations.Items | Where-Object { $_.FunctionARN -eq $functionArn }

if (-not $existingFunction) {
    $config.DefaultCacheBehavior.FunctionAssociations = @{
        Quantity = 1
        Items = @(
            @{
                FunctionARN = $functionArn
                EventType = "viewer-request"
            }
        )
    }
    Write-Host "    OK CloudFront Function associated" -ForegroundColor Green
} else {
    Write-Host "    OK CloudFront Function already associated" -ForegroundColor Yellow
}

# 3.3: Update cache policy for DefaultCacheBehavior (HTML files)
Write-Host "  - Updating cache policy for HTML files..." -ForegroundColor White

# Remove legacy TTL settings when using cache policy
if ($config.DefaultCacheBehavior.PSObject.Properties['MinTTL']) {
    $config.DefaultCacheBehavior.PSObject.Properties.Remove('MinTTL')
}
if ($config.DefaultCacheBehavior.PSObject.Properties['MaxTTL']) {
    $config.DefaultCacheBehavior.PSObject.Properties.Remove('MaxTTL')
}
if ($config.DefaultCacheBehavior.PSObject.Properties['DefaultTTL']) {
    $config.DefaultCacheBehavior.PSObject.Properties.Remove('DefaultTTL')
}
if ($config.DefaultCacheBehavior.PSObject.Properties['ForwardedValues']) {
    $config.DefaultCacheBehavior.PSObject.Properties.Remove('ForwardedValues')
}

# Add CachePolicyId property if it doesn't exist
if (-not $config.DefaultCacheBehavior.PSObject.Properties['CachePolicyId']) {
    $config.DefaultCacheBehavior | Add-Member -MemberType NoteProperty -Name 'CachePolicyId' -Value $htmlPolicyId
} else {
    $config.DefaultCacheBehavior.CachePolicyId = $htmlPolicyId
}

Write-Host "    OK HTML cache policy updated" -ForegroundColor Green

# 3.4: Add or update cache behavior for /_next/static/*
Write-Host "  - Configuring cache behavior for /_next/static/*..." -ForegroundColor White

# Initialize CacheBehaviors if it doesn't exist
if (-not $config.PSObject.Properties['CacheBehaviors']) {
    $config | Add-Member -MemberType NoteProperty -Name 'CacheBehaviors' -Value ([PSCustomObject]@{
        Quantity = 0
        Items = @()
    })
} elseif (-not $config.CacheBehaviors.PSObject.Properties['Items']) {
    $config.CacheBehaviors | Add-Member -MemberType NoteProperty -Name 'Items' -Value @()
}

# Check if /_next/static/* behavior already exists
$existingBehavior = $config.CacheBehaviors.Items | Where-Object { $_.PathPattern -eq "/_next/static/*" }

if ($existingBehavior) {
    # Update existing behavior
    $existingBehavior.CachePolicyId = $assetsPolicyId
    
    # Add function association if not present
    if (-not $existingBehavior.PSObject.Properties['FunctionAssociations']) {
        $existingBehavior | Add-Member -MemberType NoteProperty -Name 'FunctionAssociations' -Value @{
            Quantity = 0
            Items = @()
        }
    }
    
    $existingFunc = $existingBehavior.FunctionAssociations.Items | Where-Object { $_.FunctionARN -eq $functionArn }
    if (-not $existingFunc) {
        $existingBehavior.FunctionAssociations = @{
            Quantity = 1
            Items = @(
                @{
                    FunctionARN = $functionArn
                    EventType = "viewer-request"
                }
            )
        }
    }
    
    Write-Host "    OK Existing cache behavior updated" -ForegroundColor Green
} else {
    # Create new cache behavior
    $newBehavior = @{
        PathPattern = "/_next/static/*"
        TargetOriginId = $config.DefaultCacheBehavior.TargetOriginId
        ViewerProtocolPolicy = "redirect-to-https"
        AllowedMethods = @{
            Quantity = 2
            Items = @("GET", "HEAD")
            CachedMethods = @{
                Quantity = 2
                Items = @("GET", "HEAD")
            }
        }
        SmoothStreaming = $false
        Compress = $true
        FieldLevelEncryptionId = ""
        CachePolicyId = $assetsPolicyId
        LambdaFunctionAssociations = @{
            Quantity = 0
        }
        FunctionAssociations = @{
            Quantity = 1
            Items = @(
                @{
                    FunctionARN = $functionArn
                    EventType = "viewer-request"
                }
            )
        }
    }
    
    # Add to cache behaviors
    if ($config.CacheBehaviors.Items -is [array]) {
        $config.CacheBehaviors.Items += $newBehavior
    } else {
        $config.CacheBehaviors.Items = @($newBehavior)
    }
    $config.CacheBehaviors.Quantity = $config.CacheBehaviors.Items.Count
    
    Write-Host "    OK New cache behavior created" -ForegroundColor Green
}

Write-Host ""

# Step 4: Save updated configuration
Write-Host "Step 4: Saving updated configuration..." -ForegroundColor Cyan

try {
    # Ensure output directory exists
    $updateDir = Split-Path -Parent $UpdatedConfigFile
    if (-not (Test-Path $updateDir)) {
        New-Item -ItemType Directory -Path $updateDir -Force | Out-Null
    }
    
    # Save configuration (without ETag)
    # Use ASCII encoding to avoid BOM issues
    $configJson = $config | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($UpdatedConfigFile, $configJson, [System.Text.Encoding]::ASCII)
    Write-Host "OK Updated configuration saved to: $UpdatedConfigFile" -ForegroundColor Green
}
catch {
    Write-Host "ERROR: Failed to save updated configuration" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 5: Apply configuration to CloudFront distribution
Write-Host "Step 5: Applying configuration to CloudFront distribution..." -ForegroundColor Cyan
Write-Host "  This may take a few minutes..." -ForegroundColor Yellow

try {
    # Get absolute path for AWS CLI
    $absoluteConfigPath = (Resolve-Path $UpdatedConfigFile).Path
    
    $updateResult = & $awsCmd cloudfront update-distribution `
        --id $DistributionId `
        --if-match $etag `
        --distribution-config "file://$absoluteConfigPath" `
        --output json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to update distribution" -ForegroundColor Red
        Write-Host "Error details:" -ForegroundColor Red
        Write-Host $updateResult -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "1. Check if the ETag is still valid (distribution may have been modified)" -ForegroundColor White
        Write-Host "2. Verify the configuration file format is correct" -ForegroundColor White
        Write-Host "3. Check AWS CLI permissions" -ForegroundColor White
        Write-Host "4. Review the configuration file at: $UpdatedConfigFile" -ForegroundColor White
        exit 1
    }
    
    $updateJson = $updateResult | ConvertFrom-Json
    $newEtag = $updateJson.ETag
    
    Write-Host "OK Distribution updated successfully!" -ForegroundColor Green
    Write-Host "  New ETag: $newEtag" -ForegroundColor White
}
catch {
    Write-Host "ERROR: Failed to apply configuration" -ForegroundColor Red
    Write-Host "Exception Message: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Exception Type: $($_.Exception.GetType().FullName)" -ForegroundColor Red
    if ($updateResult) {
        Write-Host "AWS CLI Output:" -ForegroundColor Red
        Write-Host $updateResult -ForegroundColor Red
    }
    exit 1
}

Write-Host ""

# Step 6: Wait for distribution deployment
Write-Host "Step 6: Waiting for distribution deployment..." -ForegroundColor Cyan
Write-Host "  Note: This can take 5-15 minutes. You can skip this wait if needed." -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to skip waiting (distribution will still deploy in background)" -ForegroundColor Yellow
Write-Host ""

try {
    $waitResult = & $awsCmd cloudfront wait distribution-deployed `
        --id $DistributionId 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK Distribution deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "! Wait command timed out or was interrupted" -ForegroundColor Yellow
        Write-Host "  Distribution is still deploying in the background" -ForegroundColor White
        Write-Host "  Check status in AWS Console or run: aws cloudfront get-distribution --id $DistributionId" -ForegroundColor White
    }
}
catch {
    Write-Host "! Wait interrupted" -ForegroundColor Yellow
    Write-Host "  Distribution is still deploying in the background" -ForegroundColor White
}

Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Distribution Update Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "OK CustomErrorResponses removed (no more SPA-style error handling)" -ForegroundColor Green
Write-Host "OK CloudFront Function associated with viewer-request event" -ForegroundColor Green
Write-Host "OK HTML cache policy applied (TTL=0, no caching)" -ForegroundColor Green
Write-Host "OK Assets cache policy applied to /_next/static/* (TTL=1 year)" -ForegroundColor Green
Write-Host ""
Write-Host "Distribution ID: $DistributionId" -ForegroundColor White
Write-Host "Function ARN: $functionArn" -ForegroundColor White
Write-Host "HTML Policy ID: $htmlPolicyId" -ForegroundColor White
Write-Host "Assets Policy ID: $assetsPolicyId" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Wait for distribution deployment to complete (if not already done)" -ForegroundColor White
Write-Host "2. Update deployment scripts to set correct Cache-Control headers" -ForegroundColor White
Write-Host "3. Deploy your application with the new configuration" -ForegroundColor White
Write-Host "4. Create cache invalidation after deployment" -ForegroundColor White
Write-Host "5. Test all routes to verify correct behavior" -ForegroundColor White
Write-Host ""
Write-Host "Rollback:" -ForegroundColor Yellow
Write-Host "If issues occur, restore from backup: $BackupConfigFile" -ForegroundColor White
Write-Host ""

exit 0

