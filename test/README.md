# Integration and End-to-End Tests

This directory contains integration and end-to-end tests for the CloudFront routing fix implementation.

## Test Scripts

### 1. CloudFront Configuration Verification (`verify-cloudfront-config.ps1`)

Verifies that the CloudFront distribution is configured correctly for static site routing.

**What it checks:**
- No CustomErrorResponses for 404/403 errors (ensures real 404s are returned)
- CloudFront Function is associated with viewer-request event
- Cache behavior exists for `/_next/static/*` path pattern
- Cache policies are properly configured

**Usage:**
```powershell
# Run with default distribution ID
.\test\verify-cloudfront-config.ps1

# Run with custom distribution ID
.\test\verify-cloudfront-config.ps1 -DistributionId "YOUR_DISTRIBUTION_ID"
```

**Requirements:**
- AWS CLI v2 installed and configured
- Appropriate AWS permissions to read CloudFront configurations

**Exit codes:**
- `0`: All checks passed
- `1`: One or more checks failed

---

### 2. End-to-End Routing Tests (`e2e-routing-test.ps1`)

Tests the actual routing behavior of the deployed application.

**What it tests:**
- Root path (`/`) returns 200
- Routes without trailing slash (`/register`, `/login`) return 200
- Routes with trailing slash (`/register/`, `/login/`) return 200
- Protected routes (`/profile`) return 200 or auth error (401/403)
- Non-existent paths return 404 (not 200)
- Each route serves correct content (not home page)
- Static assets are accessible

**Usage:**
```powershell
# Run against production domain
.\test\e2e-routing-test.ps1

# Run against custom domain
.\test\e2e-routing-test.ps1 -Domain "https://your-domain.com"

# Run against CloudFront distribution directly
.\test\e2e-routing-test.ps1 -Domain "https://d4srl7zbv9blh.cloudfront.net"
```

**Requirements:**
- Internet connection to reach the deployed application
- No special AWS credentials needed (tests public endpoints)

**Exit codes:**
- `0`: All tests passed
- `1`: One or more tests failed

---

## Running All Tests

To run all integration and end-to-end tests:

```powershell
# Run CloudFront configuration verification
Write-Host "Running CloudFront configuration verification..." -ForegroundColor Cyan
.\test\verify-cloudfront-config.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "CloudFront configuration verification failed!" -ForegroundColor Red
    exit 1
}

# Run end-to-end routing tests
Write-Host "`nRunning end-to-end routing tests..." -ForegroundColor Cyan
.\test\e2e-routing-test.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "End-to-end routing tests failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ All integration and end-to-end tests passed!" -ForegroundColor Green
```

---

## When to Run These Tests

### During Development
- After making changes to CloudFront configuration
- After deploying new CloudFront Functions
- After updating cache policies

### Before Deployment
- Run `verify-cloudfront-config.ps1` to ensure configuration is correct
- Run `e2e-routing-test.ps1` against staging environment

### After Deployment
- Run both tests to verify deployment was successful
- Run `e2e-routing-test.ps1` periodically to monitor production health

### During Troubleshooting
- If users report routing issues, run `e2e-routing-test.ps1` to identify problems
- If caching seems incorrect, run `verify-cloudfront-config.ps1` to check configuration

---

## Troubleshooting

### CloudFront Configuration Verification Fails

**Problem:** "No function associations configured"
- **Solution:** Deploy the CloudFront Function using `scripts/deploy-cloudfront-function.ps1`
- **Solution:** Update the distribution using `scripts/update-cloudfront-distribution.ps1`

**Problem:** "CustomErrorResponses found"
- **Solution:** Update the distribution to remove CustomErrorResponses using `scripts/update-cloudfront-distribution.ps1`

**Problem:** "No cache behavior configured for /_next/static/*"
- **Solution:** Update the distribution using `scripts/update-cloudfront-distribution.ps1`

### End-to-End Routing Tests Fail

**Problem:** Routes return 404 instead of 200
- **Check:** Verify files exist in S3 bucket
- **Check:** Run `verify-cloudfront-config.ps1` to ensure CloudFront Function is associated
- **Solution:** Redeploy application using `scripts/deploy-to-s3.ps1`

**Problem:** Routes return 200 but serve home page content
- **Check:** CloudFront Function may not be working correctly
- **Solution:** Verify function code in `cloudfront-function/uri-rewrite.js`
- **Solution:** Redeploy function using `scripts/deploy-cloudfront-function.ps1`

**Problem:** Non-existent paths return 200 instead of 404
- **Check:** CustomErrorResponses may still be configured
- **Solution:** Run `verify-cloudfront-config.ps1` and remove CustomErrorResponses

**Problem:** Tests timeout or fail to connect
- **Check:** Domain is accessible from your network
- **Check:** CloudFront distribution is deployed and enabled
- **Solution:** Wait a few minutes for CloudFront changes to propagate

---

## Related Documentation

- [CloudFront Routing Fix Guide](../CLOUDFRONT-FIX-GUIDE.md)
- [Deployment Guide](../deployment/DEPLOYMENT-GUIDE.md)
- [Requirements Document](../.kiro/specs/cloudfront-routing-fix/requirements.md)
- [Design Document](../.kiro/specs/cloudfront-routing-fix/design.md)
- [Tasks Document](../.kiro/specs/cloudfront-routing-fix/tasks.md)

---

## Notes

- These tests are designed for Windows PowerShell
- AWS CLI v2 is required for CloudFront configuration verification
- Tests use minimal dependencies (no npm packages required)
- Tests are safe to run in production (read-only operations)
- Both scripts provide detailed output for debugging
