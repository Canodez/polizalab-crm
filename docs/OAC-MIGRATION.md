# OAC Migration Guide

## Overview

This guide provides step-by-step instructions for migrating from Origin Access Identity (OAI) to Origin Access Control (OAC) for your CloudFront distribution. OAC is the modern, recommended approach for securing S3 origins with CloudFront.

**Current Status**: This deployment uses OAI, which continues to work and is fully supported by AWS. Migration to OAC is optional but recommended for new best practices.

## Table of Contents

1. [OAI vs OAC: Key Differences](#oai-vs-oac-key-differences)
2. [Prerequisites](#prerequisites)
3. [Migration Steps](#migration-steps)
4. [Verification](#verification)
5. [Rollback Instructions](#rollback-instructions)
6. [Troubleshooting](#troubleshooting)

## OAI vs OAC: Key Differences

### Origin Access Identity (OAI) - Legacy

**What it is**: A special CloudFront user that can access your S3 bucket. The S3 bucket policy grants permissions to this CloudFront user.

**Characteristics**:
- Legacy approach (still supported)
- Uses S3 bucket policies with CloudFront principal
- Limited to S3 origins
- Does not support all S3 features (e.g., SSE-KMS encryption)
- Simpler configuration

**Current Implementation**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity XXXXX"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::polizalab-crm-frontend/*"
    }
  ]
}
```

### Origin Access Control (OAC) - Modern

**What it is**: A more secure and feature-rich method for CloudFront to access S3 origins using AWS Signature Version 4 (SigV4).

**Advantages**:
- Modern, recommended approach
- Supports all S3 features including SSE-KMS encryption
- Better security with SigV4 signing
- Supports S3 bucket policies with more granular controls
- Future-proof for new AWS features

**Implementation**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::polizalab-crm-frontend/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

### When to Migrate

**Migrate if**:
- You need SSE-KMS encryption for S3 objects
- You want to use the latest AWS security best practices
- You're setting up a new distribution (use OAC from the start)
- You need more granular access controls

**Stay with OAI if**:
- Current setup works perfectly
- You want to minimize changes to production
- You don't need advanced S3 features

## Prerequisites

Before starting the migration, ensure you have:

1. **AWS CLI v2 installed and configured**
   ```powershell
   & "C:\Program Files\Amazon\AWSCLIV2\aws.exe" --version
   # Should show: aws-cli/2.x.x or higher
   ```

2. **Required information**:
   - Distribution ID: `E1WB95BQGR0YAT`
   - S3 Bucket: `polizalab-crm-frontend`
   - AWS Account ID: (get with `aws sts get-caller-identity --query Account --output text`)
   - Current OAI ID: (get from CloudFront distribution config)

3. **Permissions**:
   - `cloudfront:CreateOriginAccessControl`
   - `cloudfront:GetDistribution`
   - `cloudfront:UpdateDistribution`
   - `s3:PutBucketPolicy`
   - `s3:GetBucketPolicy`

4. **Backup current configuration**:
   ```powershell
   # Backup distribution config
   & "C:\Program Files\Amazon\AWSCLIV2\aws.exe" cloudfront get-distribution-config `
     --id E1WB95BQGR0YAT `
     --output json > cloudfront-config-backup-oai.json
   
   # Backup S3 bucket policy
   & "C:\Program Files\Amazon\AWSCLIV2\aws.exe" s3api get-bucket-policy `
     --bucket polizalab-crm-frontend `
     --query Policy --output text > s3-bucket-policy-backup.json
   ```

## Migration Steps

### Step 1: Get AWS Account ID

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$accountId = & $awsCmd sts get-caller-identity --query Account --output text
Write-Host "AWS Account ID: $accountId"
```

### Step 2: Create Origin Access Control (OAC)

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Create OAC configuration file
$oacConfig = @"
{
  "Name": "polizalab-crm-frontend-oac",
  "Description": "OAC for PolizaLab CRM Frontend S3 bucket",
  "SigningProtocol": "sigv4",
  "SigningBehavior": "always",
  "OriginAccessControlOriginType": "s3"
}
"@

$oacConfig | Out-File -FilePath "oac-config.json" -Encoding utf8

# Create the OAC
$oacResult = & $awsCmd cloudfront create-origin-access-control `
  --origin-access-control-config file://oac-config.json `
  --output json | ConvertFrom-Json

$oacId = $oacResult.OriginAccessControl.Id
Write-Host "Created OAC with ID: $oacId"
Write-Host "OAC ARN: $($oacResult.OriginAccessControl.OriginAccessControlConfig.Id)"

# Save OAC ID for later use
$oacId | Out-File -FilePath "oac-id.txt" -Encoding utf8
```

### Step 3: Update S3 Bucket Policy

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$accountId = & $awsCmd sts get-caller-identity --query Account --output text
$distributionId = "E1WB95BQGR0YAT"
$bucketName = "polizalab-crm-frontend"

# Create new bucket policy for OAC
$bucketPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$bucketName/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::${accountId}:distribution/$distributionId"
        }
      }
    }
  ]
}
"@

$bucketPolicy | Out-File -FilePath "s3-bucket-policy-oac.json" -Encoding utf8

# Apply the new bucket policy
& $awsCmd s3api put-bucket-policy `
  --bucket $bucketName `
  --policy file://s3-bucket-policy-oac.json

Write-Host "✓ Updated S3 bucket policy for OAC"
```

### Step 4: Update CloudFront Distribution

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"
$oacId = Get-Content "oac-id.txt" -Raw | ForEach-Object { $_.Trim() }

# Get current distribution configuration
$configResult = & $awsCmd cloudfront get-distribution-config `
  --id $distributionId `
  --output json | ConvertFrom-Json

$config = $configResult.DistributionConfig
$etag = $configResult.ETag

# Update the origin to use OAC instead of OAI
# Remove S3OriginConfig (OAI)
$config.Origins.Items[0].PSObject.Properties.Remove('S3OriginConfig')

# Add OriginAccessControlId (OAC)
$config.Origins.Items[0] | Add-Member -NotePropertyName "OriginAccessControlId" -NotePropertyValue $oacId -Force

# Save updated configuration
$config | ConvertTo-Json -Depth 10 | Out-File -FilePath "distribution-config-oac.json" -Encoding utf8

# Update the distribution
& $awsCmd cloudfront update-distribution `
  --id $distributionId `
  --distribution-config file://distribution-config-oac.json `
  --if-match $etag

Write-Host "✓ Updated CloudFront distribution to use OAC"
Write-Host "⏳ Distribution is deploying... This may take 15-20 minutes"
```

### Step 5: Wait for Distribution Deployment

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

Write-Host "Waiting for distribution deployment to complete..."

do {
  $status = & $awsCmd cloudfront get-distribution `
    --id $distributionId `
    --query "Distribution.Status" `
    --output text
  
  Write-Host "Current status: $status"
  
  if ($status -ne "Deployed") {
    Start-Sleep -Seconds 30
  }
} while ($status -ne "Deployed")

Write-Host "✓ Distribution deployment complete"
```

### Step 6: Create Cache Invalidation

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Create invalidation to clear cache
$invalidationResult = & $awsCmd cloudfront create-invalidation `
  --distribution-id $distributionId `
  --paths "/*" `
  --output json | ConvertFrom-Json

$invalidationId = $invalidationResult.Invalidation.Id
Write-Host "Created invalidation: $invalidationId"

# Wait for invalidation to complete
Write-Host "Waiting for invalidation to complete..."

do {
  $invalidationStatus = & $awsCmd cloudfront get-invalidation `
    --distribution-id $distributionId `
    --id $invalidationId `
    --query "Invalidation.Status" `
    --output text
  
  Write-Host "Invalidation status: $invalidationStatus"
  
  if ($invalidationStatus -ne "Completed") {
    Start-Sleep -Seconds 10
  }
} while ($invalidationStatus -ne "Completed")

Write-Host "✓ Cache invalidation complete"
```

## Verification

After migration, verify that everything works correctly:

### 1. Verify OAC Configuration

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Check distribution origin configuration
$origin = & $awsCmd cloudfront get-distribution-config `
  --id $distributionId `
  --query "DistributionConfig.Origins.Items[0]" `
  --output json | ConvertFrom-Json

if ($origin.OriginAccessControlId) {
  Write-Host "✓ OAC is configured: $($origin.OriginAccessControlId)" -ForegroundColor Green
} else {
  Write-Host "✗ OAC is NOT configured" -ForegroundColor Red
}

if ($origin.S3OriginConfig) {
  Write-Host "⚠ OAI is still present (should be removed)" -ForegroundColor Yellow
}
```

### 2. Verify S3 Bucket Policy

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$bucketName = "polizalab-crm-frontend"

# Get bucket policy
$policy = & $awsCmd s3api get-bucket-policy `
  --bucket $bucketName `
  --query Policy --output text | ConvertFrom-Json

# Check if policy uses CloudFront service principal
$statement = $policy.Statement | Where-Object { $_.Principal.Service -eq "cloudfront.amazonaws.com" }

if ($statement) {
  Write-Host "✓ Bucket policy uses CloudFront service principal" -ForegroundColor Green
} else {
  Write-Host "✗ Bucket policy does NOT use CloudFront service principal" -ForegroundColor Red
}
```

### 3. Test Website Access

```powershell
$domain = "https://crm.antesdefirmar.org"

# Test root path
$response = Invoke-WebRequest -Uri "$domain/" -Method Head -UseBasicParsing
if ($response.StatusCode -eq 200) {
  Write-Host "✓ Root path accessible" -ForegroundColor Green
} else {
  Write-Host "✗ Root path returned: $($response.StatusCode)" -ForegroundColor Red
}

# Test /register
$response = Invoke-WebRequest -Uri "$domain/register" -Method Head -UseBasicParsing
if ($response.StatusCode -eq 200) {
  Write-Host "✓ /register accessible" -ForegroundColor Green
} else {
  Write-Host "✗ /register returned: $($response.StatusCode)" -ForegroundColor Red
}

# Test /login
$response = Invoke-WebRequest -Uri "$domain/login" -Method Head -UseBasicParsing
if ($response.StatusCode -eq 200) {
  Write-Host "✓ /login accessible" -ForegroundColor Green
} else {
  Write-Host "✗ /login returned: $($response.StatusCode)" -ForegroundColor Red
}
```

### 4. Test Direct S3 Access (Should Fail)

```powershell
$bucketName = "polizalab-crm-frontend"
$s3Url = "https://$bucketName.s3.amazonaws.com/index.html"

try {
  $response = Invoke-WebRequest -Uri $s3Url -Method Head -UseBasicParsing -ErrorAction Stop
  Write-Host "⚠ Direct S3 access is allowed (should be blocked)" -ForegroundColor Yellow
} catch {
  if ($_.Exception.Response.StatusCode -eq 403) {
    Write-Host "✓ Direct S3 access is blocked (correct)" -ForegroundColor Green
  } else {
    Write-Host "? Unexpected response: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
```

## Rollback Instructions

If you encounter issues after migration, you can rollback to OAI:

### Step 1: Restore S3 Bucket Policy

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$bucketName = "polizalab-crm-frontend"

# Restore original bucket policy
& $awsCmd s3api put-bucket-policy `
  --bucket $bucketName `
  --policy file://s3-bucket-policy-backup.json

Write-Host "✓ Restored original S3 bucket policy"
```

### Step 2: Restore CloudFront Distribution Configuration

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Get current ETag
$currentETag = & $awsCmd cloudfront get-distribution-config `
  --id $distributionId `
  --query "ETag" `
  --output text

# Restore original distribution config
$backupConfig = Get-Content "cloudfront-config-backup-oai.json" | ConvertFrom-Json
$originalConfig = $backupConfig.DistributionConfig

# Save to file
$originalConfig | ConvertTo-Json -Depth 10 | Out-File -FilePath "distribution-config-restore.json" -Encoding utf8

# Update distribution
& $awsCmd cloudfront update-distribution `
  --id $distributionId `
  --distribution-config file://distribution-config-restore.json `
  --if-match $currentETag

Write-Host "✓ Restored original CloudFront distribution configuration"
Write-Host "⏳ Distribution is deploying... This may take 15-20 minutes"
```

### Step 3: Wait for Deployment and Invalidate Cache

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$distributionId = "E1WB95BQGR0YAT"

# Wait for deployment
Write-Host "Waiting for distribution deployment to complete..."
do {
  $status = & $awsCmd cloudfront get-distribution `
    --id $distributionId `
    --query "Distribution.Status" `
    --output text
  
  if ($status -ne "Deployed") {
    Start-Sleep -Seconds 30
  }
} while ($status -ne "Deployed")

Write-Host "✓ Distribution deployment complete"

# Create invalidation
& $awsCmd cloudfront create-invalidation `
  --distribution-id $distributionId `
  --paths "/*"

Write-Host "✓ Cache invalidation created"
```

### Step 4: Delete OAC (Optional)

```powershell
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$oacId = Get-Content "oac-id.txt" -Raw | ForEach-Object { $_.Trim() }

# Get OAC ETag
$oacETag = & $awsCmd cloudfront get-origin-access-control `
  --id $oacId `
  --query "ETag" `
  --output text

# Delete OAC
& $awsCmd cloudfront delete-origin-access-control `
  --id $oacId `
  --if-match $oacETag

Write-Host "✓ Deleted OAC"
```

## Troubleshooting

### Issue: 403 Forbidden after migration

**Cause**: S3 bucket policy not updated correctly or CloudFront distribution still deploying

**Solution**:
1. Verify bucket policy includes CloudFront service principal
2. Verify AWS:SourceArn condition matches your distribution ARN
3. Wait for CloudFront distribution to fully deploy (15-20 minutes)
4. Create cache invalidation

### Issue: Distribution update fails with "InvalidArgument"

**Cause**: Configuration JSON format issue or missing required fields

**Solution**:
1. Verify JSON syntax is correct
2. Ensure all required fields are present in DistributionConfig
3. Check that ETag matches current distribution version
4. Get fresh distribution config and try again

### Issue: OAC not found after creation

**Cause**: OAC ID not saved correctly or wrong region

**Solution**:
1. List all OACs: `aws cloudfront list-origin-access-controls`
2. Find your OAC by name: "polizalab-crm-frontend-oac"
3. Save the correct ID to oac-id.txt

### Issue: S3 bucket policy update fails

**Cause**: Invalid policy JSON or insufficient permissions

**Solution**:
1. Validate JSON syntax using online validator
2. Verify AWS Account ID is correct
3. Verify Distribution ID is correct
4. Check IAM permissions for s3:PutBucketPolicy

### Issue: Website works but direct S3 access still allowed

**Cause**: Bucket policy allows public access or has multiple statements

**Solution**:
1. Review complete bucket policy
2. Remove any statements that allow public access
3. Ensure only CloudFront service principal has access
4. Check bucket ACLs and Block Public Access settings

## Additional Resources

- [AWS Documentation: Using OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [AWS Blog: Introducing Origin Access Control](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-introduces-origin-access-control-oac/)
- [Migrating from OAI to OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html#migrate-from-oai-to-oac)

## Summary

This migration guide provides a complete path from OAI to OAC with:
- Clear explanation of differences and benefits
- Step-by-step migration instructions
- Comprehensive verification procedures
- Complete rollback instructions
- Troubleshooting for common issues

**Remember**: Migration is optional. OAI continues to work and is fully supported. Migrate when you need OAC-specific features or want to adopt the latest AWS best practices.
