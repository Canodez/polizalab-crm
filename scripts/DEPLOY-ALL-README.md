# Master Deployment Script - Usage Guide

## Overview

The `deploy-all.ps1` script orchestrates all deployment steps for the CloudFront routing and caching fix in the correct order:

1. **Build** - Build Next.js application (optional)
2. **CloudFront Function** - Deploy URI rewriting function
3. **Cache Policies** - Create/update cache policies for HTML and assets
4. **Distribution** - Update CloudFront distribution configuration
5. **S3 Upload** - Deploy static files with correct Cache-Control headers
6. **Lambda** - Deploy Profile Lambda with idempotent upsert logic

## Prerequisites

Before running the script, ensure you have:

1. **AWS CLI v2** installed at `C:\Program Files\Amazon\AWSCLIV2\aws.exe`
2. **AWS credentials** configured with appropriate permissions:
   - CloudFront: Full access (create/update functions, policies, distributions)
   - S3: Full access to the bucket
   - Lambda: Update function code
3. **Node.js and npm** installed (if not using `--SkipBuild`)
4. **All required files** in place:
   - `cloudfront-function/uri-rewrite.js`
   - `cloudfront-config/cache-policy-html.json`
   - `cloudfront-config/cache-policy-assets.json`
   - `lambda-deploy/profile_handler.py`

## Basic Usage

### Full Deployment (Recommended for first-time setup)

```powershell
.\scripts\deploy-all.ps1
```

This will:
- Build the Next.js application
- Deploy all infrastructure components
- Upload files to S3
- Deploy Lambda function
- Create CloudFront invalidation

### Quick Deployment (Skip build if already built)

```powershell
.\scripts\deploy-all.ps1 -SkipBuild
```

Use this when you've already run `npm run build` and just want to deploy.

## Parameters

### Required Parameters (with defaults)

- **`-DistributionId`** (default: `E1WB95BQGR0YAT`)
  - CloudFront distribution ID to update

- **`-BucketName`** (default: `polizalab-crm-frontend`)
  - S3 bucket name for static files

- **`-LambdaFunctionName`** (default: `ProfileHandler`)
  - Lambda function name to update

- **`-Region`** (default: `us-east-1`)
  - AWS region for Lambda deployment

### Optional Flags

- **`-SkipBuild`**
  - Skip the Next.js build step
  - Use when `out/` directory already contains latest build

- **`-SkipS3`**
  - Skip S3 upload and CloudFront invalidation
  - Use for infrastructure-only updates

- **`-SkipLambda`**
  - Skip Lambda function deployment
  - Use when Lambda doesn't need updating

## Usage Examples

### Example 1: Full deployment with custom distribution

```powershell
.\scripts\deploy-all.ps1 -DistributionId "E2ABCDEF123456"
```

### Example 2: Infrastructure-only update (no S3 or build)

```powershell
.\scripts\deploy-all.ps1 -SkipBuild -SkipS3
```

Use this when you only want to update CloudFront configuration without deploying new files.

### Example 3: Deploy everything except Lambda

```powershell
.\scripts\deploy-all.ps1 -SkipLambda
```

### Example 4: Quick redeploy (build already done, skip Lambda)

```powershell
.\scripts\deploy-all.ps1 -SkipBuild -SkipLambda
```

## Execution Flow

The script executes steps in this order:

```
Step 0: Build Next.js Application (optional)
   ↓
Step 1: Deploy CloudFront Function
   ↓ (creates cloudfront-function-arn.txt)
Step 2: Deploy Cache Policies
   ↓ (creates cloudfront-cache-policy-ids.json)
Step 3: Update CloudFront Distribution
   ↓ (uses ARN and policy IDs from previous steps)
Step 4: Deploy to S3 (optional)
   ↓ (uploads files with correct Cache-Control headers)
Step 5: Deploy Profile Lambda (optional)
   ↓
Deployment Complete!
```

## Output Files

The script creates/uses these files:

- **`cloudfront-function-arn.txt`** - CloudFront Function ARN (Step 1)
- **`cloudfront-cache-policy-ids.json`** - Cache policy IDs (Step 2)
- **`cloudfront-config/distribution-backup.json`** - Backup of original config (Step 3)
- **`cloudfront-config/distribution-updated.json`** - Updated config (Step 3)

## Error Handling

If any step fails:

1. The script will **stop immediately** and display:
   - Error message
   - Completed steps (✓)
   - Failed/skipped steps (✗)
   - Troubleshooting tips
   - Rollback recommendations

2. You can **resume** by:
   - Fixing the issue
   - Re-running the script (completed steps will be skipped if resources already exist)

## Rollback

If deployment causes issues:

### CloudFront Distribution

```powershell
# Get current ETag
$config = aws cloudfront get-distribution-config --id E1WB95BQGR0YAT | ConvertFrom-Json
$etag = $config.ETag

# Restore from backup
aws cloudfront update-distribution `
  --id E1WB95BQGR0YAT `
  --if-match $etag `
  --distribution-config file://cloudfront-config/distribution-backup.json
```

### S3 Files

S3 files are overwritten, not deleted. To rollback:
- Redeploy previous version
- Or manually restore from S3 versioning (if enabled)

### Lambda Function

Use AWS Console to restore previous Lambda version:
1. Go to Lambda console
2. Select ProfileHandler function
3. Click "Versions" tab
4. Select previous version
5. Click "Actions" → "Publish new version"

## Verification

After deployment, verify everything works:

### 1. Check CloudFront Configuration

```powershell
.\scripts\verify-cloudfront-config.ps1
```

### 2. Test Routes

Visit these URLs and verify they work:
- https://crm.antesdefirmar.org/
- https://crm.antesdefirmar.org/register
- https://crm.antesdefirmar.org/login
- https://crm.antesdefirmar.org/profile

### 3. Check Cache-Control Headers

Open browser DevTools → Network tab:
- HTML files should have: `Cache-Control: no-cache, max-age=0, must-revalidate`
- `/_next/static/*` files should have: `Cache-Control: public, max-age=31536000, immutable`

### 4. Test Profile Lambda

```powershell
# Test with curl or Postman
curl -H "Authorization: Bearer <token>" https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod/profile
```

## Timing

Expected execution times:

- **Build**: 1-3 minutes
- **CloudFront Function**: 10-30 seconds
- **Cache Policies**: 10-20 seconds
- **Distribution Update**: 5-15 minutes (CloudFront deployment)
- **S3 Upload**: 30 seconds - 2 minutes
- **Lambda Deploy**: 30-60 seconds

**Total**: 10-20 minutes for full deployment

## Troubleshooting

### "AWS CLI v2 not found"

Install AWS CLI v2 from: https://aws.amazon.com/cli/

### "Build failed"

```powershell
# Run build manually to see detailed errors
npm run build
```

### "Failed to update distribution"

- Check if distribution is already deploying (wait for it to complete)
- Verify ETag is still valid
- Check IAM permissions

### "S3 upload failed"

- Verify bucket exists: `aws s3 ls s3://polizalab-crm-frontend/`
- Check IAM permissions for S3
- Ensure `out/` directory exists

### "Lambda deployment failed"

- Verify Lambda function exists in AWS Console
- Check IAM permissions for Lambda
- Ensure `lambda-deploy/profile_handler.py` exists

## Best Practices

1. **Always test in staging first** (if available)
2. **Run with `-SkipS3` first** to verify infrastructure changes
3. **Monitor CloudWatch Logs** after deployment
4. **Keep backups** of working configurations
5. **Document any custom changes** you make to the scripts

## Support

For issues or questions:
1. Check the error message and troubleshooting section
2. Review individual script logs
3. Check AWS Console for resource status
4. Verify all prerequisites are met

## Related Scripts

- `deploy-cloudfront-function.ps1` - Deploy CloudFront Function only
- `deploy-cache-policies.ps1` - Deploy cache policies only
- `update-cloudfront-distribution.ps1` - Update distribution only
- `deploy-to-s3.ps1` - Deploy to S3 only
- `deploy-profile-lambda.ps1` - Deploy Lambda only
- `verify-cloudfront-config.ps1` - Verify CloudFront configuration

Each script can be run independently if needed.
