# CloudFront Routing Fix - Rollback Procedures

This document provides step-by-step procedures to rollback changes made by the CloudFront routing and caching fix implementation. Use these procedures if issues arise after deployment or if you need to restore the previous configuration.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Rollback (All Changes)](#quick-rollback-all-changes)
4. [Selective Rollback Procedures](#selective-rollback-procedures)
5. [Verification Steps](#verification-steps)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The CloudFront routing fix implementation made the following changes:

1. **CloudFront Function**: Created `uri-rewrite-function` for URI rewriting
2. **Cache Policies**: Created two custom cache policies (HTML and Assets)
3. **Distribution Configuration**: Updated CloudFront distribution with:
   - Function associations
   - Cache behaviors for `/_next/static/*`
   - Removed CustomErrorResponses
   - Updated cache policy references
4. **S3 Objects**: Updated Cache-Control headers on all S3 objects
5. **Profile Lambda**: Enhanced with idempotent upsert logic

Each component can be rolled back independently or all at once.

---

## Prerequisites

Before starting rollback procedures, ensure you have:

- **AWS CLI v2** installed and configured
  - Path: `C:\Program Files\Amazon\AWSCLIV2\aws.exe`
  - Verify: `aws --version` (should show `aws-cli/2.x.x`)
- **AWS credentials** with appropriate permissions:
  - CloudFront: `cloudfront:*`
  - S3: `s3:*`
  - Lambda: `lambda:*`
- **Backup files** (created during deployment):
  - `cloudfront-config/distribution-backup.json`
  - `lambda-deploy/profile_handler_backup.py` (if Lambda was updated)
- **PowerShell** (Windows) or **Bash** (Linux/Mac)

---

## Quick Rollback (All Changes)

Use this procedure to rollback all changes at once. This is the fastest way to restore the previous state.

### Step 1: Restore CloudFront Distribution Configuration

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"
$backupFile = "cloudfront-config/distribution-backup.json"

# Get current ETag
$currentConfig = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json
$etag = $currentConfig.ETag

# Restore from backup
$backupConfig = Get-Content -Path $backupFile -Raw | ConvertFrom-Json
$backupDistConfig = $backupConfig.DistributionConfig

# Save to temp file for AWS CLI
$backupDistConfig | ConvertTo-Json -Depth 20 | Out-File -FilePath "temp-rollback-config.json" -Encoding ASCII

# Apply backup configuration
$absolutePath = (Resolve-Path "temp-rollback-config.json").Path
& $awsCmd cloudfront update-distribution `
    --id $distributionId `
    --if-match $etag `
    --distribution-config "file://$absolutePath"

# Wait for deployment
Write-Host "Waiting for distribution deployment (this may take 5-15 minutes)..."
& $awsCmd cloudfront wait distribution-deployed --id $distributionId

Write-Host "CloudFront distribution restored successfully!" -ForegroundColor Green

# Clean up temp file
Remove-Item "temp-rollback-config.json"
```

```bash
# Bash (Linux/Mac)
aws_cmd="aws"
distribution_id="E1WB95BQGR0YAT"
backup_file="cloudfront-config/distribution-backup.json"

# Get current ETag
etag=$(aws cloudfront get-distribution-config --id $distribution_id --query 'ETag' --output text)

# Extract DistributionConfig from backup
jq '.DistributionConfig' $backup_file > temp-rollback-config.json

# Apply backup configuration
aws cloudfront update-distribution \
    --id $distribution_id \
    --if-match $etag \
    --distribution-config file://temp-rollback-config.json

# Wait for deployment
echo "Waiting for distribution deployment (this may take 5-15 minutes)..."
aws cloudfront wait distribution-deployed --id $distribution_id

echo "CloudFront distribution restored successfully!"

# Clean up temp file
rm temp-rollback-config.json
```

### Step 2: Restore S3 Cache-Control Headers (Optional)

If you need to restore the original Cache-Control headers on S3 objects:

```powershell
# PowerShell (Windows)
$bucketName = "polizalab-crm-frontend"

# Set all objects to default cache headers (1 day)
& $awsCmd s3 sync s3://$bucketName/ s3://$bucketName/ `
    --metadata-directive REPLACE `
    --cache-control "public, max-age=86400"

Write-Host "S3 Cache-Control headers restored to default" -ForegroundColor Green
```

```bash
# Bash (Linux/Mac)
bucket_name="polizalab-crm-frontend"

# Set all objects to default cache headers (1 day)
aws s3 sync s3://$bucket_name/ s3://$bucket_name/ \
    --metadata-directive REPLACE \
    --cache-control "public, max-age=86400"

echo "S3 Cache-Control headers restored to default"
```

### Step 3: Create Cache Invalidation

```powershell
# PowerShell (Windows)
& $awsCmd cloudfront create-invalidation --distribution-id $distributionId --paths "/*"
Write-Host "Cache invalidation created" -ForegroundColor Green
```

```bash
# Bash (Linux/Mac)
aws cloudfront create-invalidation --distribution-id $distribution_id --paths "/*"
echo "Cache invalidation created"
```

### Step 4: Restore Profile Lambda (If Updated)

```powershell
# PowerShell (Windows)
$functionName = "profile-handler"
$backupFile = "lambda-deploy/profile_handler_backup.py"

if (Test-Path $backupFile) {
    # Create deployment package
    Compress-Archive -Path $backupFile -DestinationPath "lambda-deploy/profile-handler-rollback.zip" -Force
    
    # Update Lambda function
    & $awsCmd lambda update-function-code `
        --function-name $functionName `
        --zip-file "fileb://lambda-deploy/profile-handler-rollback.zip"
    
    Write-Host "Profile Lambda restored from backup" -ForegroundColor Green
} else {
    Write-Host "No Lambda backup found, skipping..." -ForegroundColor Yellow
}
```

```bash
# Bash (Linux/Mac)
function_name="profile-handler"
backup_file="lambda-deploy/profile_handler_backup.py"

if [ -f "$backup_file" ]; then
    # Create deployment package
    cd lambda-deploy
    zip profile-handler-rollback.zip profile_handler_backup.py
    
    # Update Lambda function
    aws lambda update-function-code \
        --function-name $function_name \
        --zip-file fileb://profile-handler-rollback.zip
    
    echo "Profile Lambda restored from backup"
    cd ..
else
    echo "No Lambda backup found, skipping..."
fi
```

---

## Selective Rollback Procedures

Use these procedures to rollback specific components without affecting others.

### Rollback 1: Remove CloudFront Function Association

This removes the URI rewriting function but keeps other changes.

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Get current configuration
$configResult = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json
$etag = $configResult.ETag
$config = $configResult.DistributionConfig

# Remove function association from DefaultCacheBehavior
$config.DefaultCacheBehavior.FunctionAssociations = @{
    Quantity = 0
    Items = @()
}

# Remove function association from /_next/static/* behavior
$staticBehavior = $config.CacheBehaviors.Items | Where-Object { $_.PathPattern -eq "/_next/static/*" }
if ($staticBehavior) {
    $staticBehavior.FunctionAssociations = @{
        Quantity = 0
        Items = @()
    }
}

# Save and apply
$config | ConvertTo-Json -Depth 20 | Out-File -FilePath "temp-config.json" -Encoding ASCII
$absolutePath = (Resolve-Path "temp-config.json").Path

& $awsCmd cloudfront update-distribution `
    --id $distributionId `
    --if-match $etag `
    --distribution-config "file://$absolutePath"

Write-Host "CloudFront Function associations removed" -ForegroundColor Green
Remove-Item "temp-config.json"
```

### Rollback 2: Restore CustomErrorResponses (SPA-style)

This restores the SPA-style error handling that redirects 404s to index.html.

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Get current configuration
$configResult = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json
$etag = $configResult.ETag
$config = $configResult.DistributionConfig

# Add CustomErrorResponses for SPA-style routing
$config.CustomErrorResponses = @{
    Quantity = 2
    Items = @(
        @{
            ErrorCode = 403
            ResponsePagePath = "/index.html"
            ResponseCode = "200"
            ErrorCachingMinTTL = 300
        },
        @{
            ErrorCode = 404
            ResponsePagePath = "/index.html"
            ResponseCode = "200"
            ErrorCachingMinTTL = 300
        }
    )
}

# Save and apply
$config | ConvertTo-Json -Depth 20 | Out-File -FilePath "temp-config.json" -Encoding ASCII
$absolutePath = (Resolve-Path "temp-config.json").Path

& $awsCmd cloudfront update-distribution `
    --id $distributionId `
    --if-match $etag `
    --distribution-config "file://$absolutePath"

Write-Host "CustomErrorResponses restored (SPA-style routing)" -ForegroundColor Green
Remove-Item "temp-config.json"
```

### Rollback 3: Remove Custom Cache Policies

This removes the custom cache policies and reverts to default caching behavior.

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Get current configuration
$configResult = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json
$etag = $configResult.ETag
$config = $configResult.DistributionConfig

# Remove CachePolicyId from DefaultCacheBehavior and restore legacy TTL settings
$config.DefaultCacheBehavior.PSObject.Properties.Remove('CachePolicyId')
$config.DefaultCacheBehavior | Add-Member -MemberType NoteProperty -Name 'MinTTL' -Value 0
$config.DefaultCacheBehavior | Add-Member -MemberType NoteProperty -Name 'DefaultTTL' -Value 86400
$config.DefaultCacheBehavior | Add-Member -MemberType NoteProperty -Name 'MaxTTL' -Value 31536000
$config.DefaultCacheBehavior | Add-Member -MemberType NoteProperty -Name 'ForwardedValues' -Value @{
    QueryString = $false
    Cookies = @{ Forward = "none" }
    Headers = @{ Quantity = 0 }
}

# Remove /_next/static/* cache behavior
$config.CacheBehaviors.Items = $config.CacheBehaviors.Items | Where-Object { $_.PathPattern -ne "/_next/static/*" }
$config.CacheBehaviors.Quantity = $config.CacheBehaviors.Items.Count

# Save and apply
$config | ConvertTo-Json -Depth 20 | Out-File -FilePath "temp-config.json" -Encoding ASCII
$absolutePath = (Resolve-Path "temp-config.json").Path

& $awsCmd cloudfront update-distribution `
    --id $distributionId `
    --if-match $etag `
    --distribution-config "file://$absolutePath"

Write-Host "Custom cache policies removed, reverted to legacy TTL settings" -ForegroundColor Green
Remove-Item "temp-config.json"

# Optionally delete the custom cache policies
Write-Host "To delete custom cache policies, run:" -ForegroundColor Yellow
Write-Host "  aws cloudfront delete-cache-policy --id <policy-id> --if-match <etag>" -ForegroundColor White
Write-Host "  (Get policy IDs from cloudfront-cache-policy-ids.json)" -ForegroundColor White
```

### Rollback 4: Remove /_next/static/* Cache Behavior

This removes only the cache behavior for versioned assets.

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Get current configuration
$configResult = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json
$etag = $configResult.ETag
$config = $configResult.DistributionConfig

# Remove /_next/static/* cache behavior
$config.CacheBehaviors.Items = $config.CacheBehaviors.Items | Where-Object { $_.PathPattern -ne "/_next/static/*" }
$config.CacheBehaviors.Quantity = $config.CacheBehaviors.Items.Count

# Save and apply
$config | ConvertTo-Json -Depth 20 | Out-File -FilePath "temp-config.json" -Encoding ASCII
$absolutePath = (Resolve-Path "temp-config.json").Path

& $awsCmd cloudfront update-distribution `
    --id $distributionId `
    --if-match $etag `
    --distribution-config "file://$absolutePath"

Write-Host "/_next/static/* cache behavior removed" -ForegroundColor Green
Remove-Item "temp-config.json"
```

### Rollback 5: Delete CloudFront Function

This permanently deletes the CloudFront Function. Only do this after removing all associations.

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$functionName = "uri-rewrite-function"

# Get function info to get ETag
$functionInfo = & $awsCmd cloudfront describe-function --name $functionName --output json | ConvertFrom-Json
$etag = $functionInfo.ETag

# Delete function
& $awsCmd cloudfront delete-function --name $functionName --if-match $etag

Write-Host "CloudFront Function deleted: $functionName" -ForegroundColor Green
```

```bash
# Bash (Linux/Mac)
function_name="uri-rewrite-function"

# Get function info to get ETag
etag=$(aws cloudfront describe-function --name $function_name --query 'ETag' --output text)

# Delete function
aws cloudfront delete-function --name $function_name --if-match $etag

echo "CloudFront Function deleted: $function_name"
```

**Warning**: Only delete the function after removing all associations from the distribution. Otherwise, the deletion will fail.

### Rollback 6: Delete Custom Cache Policies

This permanently deletes the custom cache policies. Only do this after removing all references.

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Read policy IDs from file
$policyIds = Get-Content -Path "cloudfront-cache-policy-ids.json" -Raw | ConvertFrom-Json

# Delete HTML cache policy
$htmlPolicyId = $policyIds.HtmlPolicyId
$htmlPolicyInfo = & $awsCmd cloudfront get-cache-policy --id $htmlPolicyId --output json | ConvertFrom-Json
$htmlEtag = $htmlPolicyInfo.ETag

& $awsCmd cloudfront delete-cache-policy --id $htmlPolicyId --if-match $htmlEtag
Write-Host "HTML cache policy deleted: $htmlPolicyId" -ForegroundColor Green

# Delete Assets cache policy
$assetsPolicyId = $policyIds.AssetsPolicyId
$assetsPolicyInfo = & $awsCmd cloudfront get-cache-policy --id $assetsPolicyId --output json | ConvertFrom-Json
$assetsEtag = $assetsPolicyInfo.ETag

& $awsCmd cloudfront delete-cache-policy --id $assetsPolicyId --if-match $assetsEtag
Write-Host "Assets cache policy deleted: $assetsPolicyId" -ForegroundColor Green
```

```bash
# Bash (Linux/Mac)
# Read policy IDs from file
html_policy_id=$(jq -r '.HtmlPolicyId' cloudfront-cache-policy-ids.json)
assets_policy_id=$(jq -r '.AssetsPolicyId' cloudfront-cache-policy-ids.json)

# Delete HTML cache policy
html_etag=$(aws cloudfront get-cache-policy --id $html_policy_id --query 'ETag' --output text)
aws cloudfront delete-cache-policy --id $html_policy_id --if-match $html_etag
echo "HTML cache policy deleted: $html_policy_id"

# Delete Assets cache policy
assets_etag=$(aws cloudfront get-cache-policy --id $assets_policy_id --query 'ETag' --output text)
aws cloudfront delete-cache-policy --id $assets_policy_id --if-match $assets_etag
echo "Assets cache policy deleted: $assets_policy_id"
```

**Warning**: Only delete cache policies after removing all references from distributions. Otherwise, the deletion will fail.

---

## Verification Steps

After performing rollback, verify the changes:

### 1. Verify CloudFront Configuration

```powershell
# PowerShell (Windows)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Get distribution configuration
$config = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json

# Check CustomErrorResponses
$errorResponses = $config.DistributionConfig.CustomErrorResponses.Quantity
Write-Host "CustomErrorResponses count: $errorResponses" -ForegroundColor White

# Check function associations
$functionAssociations = $config.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Quantity
Write-Host "Function associations count: $functionAssociations" -ForegroundColor White

# Check cache behaviors
$cacheBehaviors = $config.DistributionConfig.CacheBehaviors.Quantity
Write-Host "Cache behaviors count: $cacheBehaviors" -ForegroundColor White
```

### 2. Test Routes

```bash
# Test root path
curl -I https://crm.antesdefirmar.org/

# Test /register
curl -I https://crm.antesdefirmar.org/register

# Test non-existent path
curl -I https://crm.antesdefirmar.org/nonexistent
```

### 3. Check Cache-Control Headers

```bash
# Check HTML file
curl -I https://crm.antesdefirmar.org/index.html | grep -i cache-control

# Check versioned asset
curl -I https://crm.antesdefirmar.org/_next/static/chunks/main.js | grep -i cache-control
```

### 4. Verify Profile Lambda

```bash
# Test profile endpoint (requires authentication)
curl -H "Authorization: Bearer <token>" https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod/profile
```

---

## Troubleshooting

### Issue: "ETag mismatch" error during rollback

**Cause**: The distribution was modified after the backup was created.

**Solution**:
1. Get the current ETag:
   ```powershell
   $config = & $awsCmd cloudfront get-distribution-config --id $distributionId --output json | ConvertFrom-Json
   $etag = $config.ETag
   ```
2. Use this ETag in the update command

### Issue: "Cannot delete cache policy - still in use"

**Cause**: The cache policy is still referenced by a distribution.

**Solution**:
1. Remove all references to the cache policy from distributions first
2. Wait for distribution deployment to complete
3. Then delete the cache policy

### Issue: "Cannot delete function - still associated"

**Cause**: The function is still associated with a distribution.

**Solution**:
1. Remove all function associations from distributions first
2. Wait for distribution deployment to complete
3. Then delete the function

### Issue: Routes still not working after rollback

**Cause**: CloudFront cache may still contain old responses.

**Solution**:
1. Create a cache invalidation:
   ```powershell
   & $awsCmd cloudfront create-invalidation --distribution-id $distributionId --paths "/*"
   ```
2. Wait for invalidation to complete (5-10 minutes)
3. Test again

### Issue: S3 objects have wrong Cache-Control headers

**Cause**: Headers were not updated during rollback.

**Solution**:
1. Re-upload objects with correct headers using `deploy-to-s3.ps1`
2. Or manually update headers:
   ```powershell
   & $awsCmd s3 sync s3://$bucketName/ s3://$bucketName/ `
       --metadata-directive REPLACE `
       --cache-control "public, max-age=86400"
   ```

### Issue: Profile Lambda not working after rollback

**Cause**: Lambda code was not properly restored.

**Solution**:
1. Verify the backup file exists: `lambda-deploy/profile_handler_backup.py`
2. Manually update the Lambda function code in AWS Console
3. Or redeploy the original Lambda code

---

## Emergency Contact

If rollback procedures fail or you need assistance:

1. **Check AWS CloudWatch Logs** for error details
2. **Review AWS Console** for distribution status
3. **Contact AWS Support** if infrastructure issues persist
4. **Restore from AWS Backup** if available

---

## Rollback Checklist

Use this checklist to track rollback progress:

- [ ] Backup current state (before rollback)
- [ ] Restore CloudFront distribution configuration
- [ ] Wait for distribution deployment (5-15 minutes)
- [ ] Restore S3 Cache-Control headers (if needed)
- [ ] Create cache invalidation
- [ ] Restore Profile Lambda (if updated)
- [ ] Verify CloudFront configuration
- [ ] Test all routes (/, /register, /login, /profile)
- [ ] Check Cache-Control headers
- [ ] Verify Profile Lambda functionality
- [ ] Monitor CloudWatch Logs for errors
- [ ] Document any issues encountered
- [ ] Clean up temporary files

---

## Notes

- **Backup files are critical**: Always keep backup files until you're certain the new configuration is stable
- **Distribution deployment takes time**: CloudFront changes can take 5-15 minutes to deploy globally
- **Cache invalidation is important**: Always create an invalidation after configuration changes
- **Test thoroughly**: Verify all routes and functionality after rollback
- **Document changes**: Keep a log of what was rolled back and why

---

## Related Documentation

- [OAC Migration Guide](OAC-MIGRATION.md) - Optional migration from OAI to OAC
- [Deployment Guide](../deployment/DEPLOYMENT-GUIDE.md) - Original deployment procedures
- [CloudFront Fix Guide](../CLOUDFRONT-FIX-GUIDE.md) - Implementation details

---

**Last Updated**: 2026-02-19
**Version**: 1.0.0
