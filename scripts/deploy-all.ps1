# Master Deployment Script
# This script orchestrates all deployment steps for the CloudFront routing and caching fix
# Execution order: Function → Policies → Distribution → S3 → Lambda
# Requirements: All

param(
    [Parameter(Mandatory=$false)]
    [string]$DistributionId = "E1WB95BQGR0YAT",
    
    [Parameter(Mandatory=$false)]
    [string]$BucketName = "polizalab-crm-frontend",
    
    [Parameter(Mandatory=$false)]
    [string]$LambdaFunctionName = "ProfileHandler",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipLambda,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipS3
)

$ErrorActionPreference = "Stop"

# Color output functions
function Write-StepHeader {
    param([string]$Message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-SuccessMsg {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-InfoMsg {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor White
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

# Track deployment progress
$deploymentSteps = @{
    "Build" = $false
    "CloudFrontFunction" = $false
    "CachePolicies" = $false
    "Distribution" = $false
    "S3Upload" = $false
    "Lambda" = $false
}

$startTime = Get-Date

# Display deployment configuration
Write-StepHeader "CloudFront Routing and Caching Fix - Master Deployment"

Write-InfoMsg "Deployment Configuration:"
Write-InfoMsg "  Distribution ID: $DistributionId"
Write-InfoMsg "  S3 Bucket: $BucketName"
Write-InfoMsg "  Lambda Function: $LambdaFunctionName"
Write-InfoMsg "  Region: $Region"
Write-InfoMsg ""
Write-InfoMsg "Options:"
Write-InfoMsg "  Skip Build: $SkipBuild"
Write-InfoMsg "  Skip Lambda: $SkipLambda"
Write-InfoMsg "  Skip S3: $SkipS3"
Write-Host ""

# Verify AWS CLI v2 is available
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
if (-not (Test-Path $awsCmd)) {
    Write-ErrorMsg "AWS CLI v2 not found at: $awsCmd"
    Write-ErrorMsg "Please install AWS CLI v2 from: https://aws.amazon.com/cli/"
    exit 1
}
Write-SuccessMsg "AWS CLI v2 verified"

# Verify all required scripts exist
$requiredScripts = @(
    "scripts/deploy-cloudfront-function.ps1",
    "scripts/deploy-cache-policies.ps1",
    "scripts/update-cloudfront-distribution.ps1",
    "scripts/deploy-to-s3.ps1",
    "scripts/deploy-profile-lambda.ps1"
)

Write-InfoMsg "Verifying required scripts..."
foreach ($script in $requiredScripts) {
    if (-not (Test-Path $script)) {
        Write-ErrorMsg "Required script not found: $script"
        exit 1
    }
}
Write-SuccessMsg "All required scripts found"
Write-Host ""

# Prompt for confirmation
Write-WarningMsg "This script will deploy infrastructure changes to AWS."
Write-WarningMsg "Please ensure you have:"
Write-WarningMsg "  1. AWS credentials configured"
Write-WarningMsg "  2. Appropriate permissions for CloudFront, S3, and Lambda"
Write-WarningMsg "  3. Reviewed the changes in each deployment script"
Write-Host ""
$confirmation = Read-Host "Continue with deployment? (yes/no)"
if ($confirmation -ne "yes") {
    Write-InfoMsg "Deployment cancelled by user"
    exit 0
}
Write-Host ""

try {
    # Step 0: Build Next.js application (if not skipped)
    if (-not $SkipBuild) {
        Write-StepHeader "Step 0: Building Next.js Application"
        
        Write-InfoMsg "Running npm run build..."
        $buildOutput = npm run build 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Build failed"
            Write-Host $buildOutput -ForegroundColor Red
            throw "Build failed with exit code $LASTEXITCODE"
        }
        
        Write-SuccessMsg "Build completed successfully"
        $deploymentSteps["Build"] = $true
        
        # Verify output directory exists
        if (-not (Test-Path "out")) {
            Write-ErrorMsg "Build output directory 'out' not found"
            throw "Build output directory missing"
        }
        Write-SuccessMsg "Build output directory verified"
    } else {
        Write-StepHeader "Step 0: Skipping Build (--SkipBuild flag set)"
        Write-WarningMsg "Ensure 'out' directory exists with latest build"
        
        if (-not (Test-Path "out")) {
            Write-ErrorMsg "Build output directory 'out' not found"
            Write-ErrorMsg "Please run 'npm run build' first or remove --SkipBuild flag"
            throw "Build output directory missing"
        }
    }
    
    # Step 1: Deploy CloudFront Function
    Write-StepHeader "Step 1: Deploying CloudFront Function"
    
    Write-InfoMsg "Executing deploy-cloudfront-function.ps1..."
    & ".\scripts\deploy-cloudfront-function.ps1"
    
    if ($LASTEXITCODE -ne 0) {
        throw "CloudFront Function deployment failed with exit code $LASTEXITCODE"
    }
    
    Write-SuccessMsg "CloudFront Function deployed successfully"
    $deploymentSteps["CloudFrontFunction"] = $true
    
    # Verify function ARN file was created
    if (-not (Test-Path "cloudfront-function-arn.txt")) {
        throw "CloudFront Function ARN file not found"
    }
    $functionArn = Get-Content "cloudfront-function-arn.txt" -Raw
    Write-InfoMsg "Function ARN: $($functionArn.Trim())"
    
    # Step 2: Deploy Cache Policies
    Write-StepHeader "Step 2: Deploying Cache Policies"
    
    Write-InfoMsg "Executing deploy-cache-policies.ps1..."
    & ".\scripts\deploy-cache-policies.ps1"
    
    if ($LASTEXITCODE -ne 0) {
        throw "Cache Policies deployment failed with exit code $LASTEXITCODE"
    }
    
    Write-SuccessMsg "Cache Policies deployed successfully"
    $deploymentSteps["CachePolicies"] = $true
    
    # Verify policy IDs file was created
    if (-not (Test-Path "cloudfront-cache-policy-ids.json")) {
        throw "Cache Policy IDs file not found"
    }
    $policyIds = Get-Content "cloudfront-cache-policy-ids.json" -Raw | ConvertFrom-Json
    Write-InfoMsg "HTML Policy ID: $($policyIds.HtmlPolicyId)"
    Write-InfoMsg "Assets Policy ID: $($policyIds.AssetsPolicyId)"
    
    # Step 3: Update CloudFront Distribution
    Write-StepHeader "Step 3: Updating CloudFront Distribution"
    
    Write-InfoMsg "Executing update-cloudfront-distribution.ps1..."
    Write-WarningMsg "This step may take 5-15 minutes for CloudFront to deploy changes"
    & ".\scripts\update-cloudfront-distribution.ps1" -DistributionId $DistributionId
    
    if ($LASTEXITCODE -ne 0) {
        throw "CloudFront Distribution update failed with exit code $LASTEXITCODE"
    }
    
    Write-SuccessMsg "CloudFront Distribution updated successfully"
    $deploymentSteps["Distribution"] = $true
    
    # Step 4: Deploy to S3 (if not skipped)
    if (-not $SkipS3) {
        Write-StepHeader "Step 4: Deploying to S3"
        
        Write-InfoMsg "Executing deploy-to-s3.ps1..."
        & ".\scripts\deploy-to-s3.ps1" -BucketName $BucketName -DistributionId $DistributionId
        
        if ($LASTEXITCODE -ne 0) {
            throw "S3 deployment failed with exit code $LASTEXITCODE"
        }
        
        Write-SuccessMsg "S3 deployment completed successfully"
        $deploymentSteps["S3Upload"] = $true
    } else {
        Write-StepHeader "Step 4: Skipping S3 Deployment (--SkipS3 flag set)"
        Write-WarningMsg "Remember to deploy to S3 manually when ready"
    }
    
    # Step 5: Deploy Profile Lambda (if not skipped)
    if (-not $SkipLambda) {
        Write-StepHeader "Step 5: Deploying Profile Lambda"
        
        Write-InfoMsg "Executing deploy-profile-lambda.ps1..."
        & ".\scripts\deploy-profile-lambda.ps1" -FunctionName $LambdaFunctionName -Region $Region
        
        if ($LASTEXITCODE -ne 0) {
            throw "Profile Lambda deployment failed with exit code $LASTEXITCODE"
        }
        
        Write-SuccessMsg "Profile Lambda deployed successfully"
        $deploymentSteps["Lambda"] = $true
    } else {
        Write-StepHeader "Step 5: Skipping Lambda Deployment (--SkipLambda flag set)"
        Write-WarningMsg "Remember to deploy Lambda function manually when ready"
    }
    
    # Deployment completed successfully
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-StepHeader "Deployment Completed Successfully!"
    
    Write-SuccessMsg "All deployment steps completed"
    Write-InfoMsg "Total deployment time: $($duration.ToString('mm\:ss'))"
    Write-Host ""
    
    # Display deployment summary
    Write-InfoMsg "Deployment Summary:"
    Write-InfoMsg "==================="
    foreach ($step in $deploymentSteps.Keys | Sort-Object) {
        $status = if ($deploymentSteps[$step]) { "[OK] COMPLETED" } else { "[SKIP] SKIPPED" }
        $color = if ($deploymentSteps[$step]) { "Green" } else { "Yellow" }
        Write-Host "  $step : $status" -ForegroundColor $color
    }
    Write-Host ""
    
    # Next steps
    Write-InfoMsg "Next Steps:"
    Write-InfoMsg "==========="
    Write-InfoMsg "1. Wait for CloudFront distribution deployment to complete (if not already done)"
    Write-InfoMsg "   Check status: aws cloudfront get-distribution --id $DistributionId"
    Write-InfoMsg ""
    Write-InfoMsg "2. Test the deployment:"
    Write-InfoMsg "   - Visit https://crm.antesdefirmar.org"
    Write-InfoMsg "   - Test routes: /, /register, /login, /profile"
    Write-InfoMsg "   - Check Cache-Control headers in browser DevTools"
    Write-InfoMsg ""
    Write-InfoMsg "3. Verify CloudFront configuration:"
    Write-InfoMsg "   Run: .\scripts\verify-cloudfront-config.ps1"
    Write-InfoMsg ""
    Write-InfoMsg "4. Monitor for errors:"
    Write-InfoMsg "   - CloudFront access logs"
    Write-InfoMsg "   - Lambda CloudWatch logs"
    Write-InfoMsg "   - Browser console errors"
    Write-Host ""
    
    # Rollback information
    Write-WarningMsg "Rollback Information:"
    Write-WarningMsg "====================="
    Write-WarningMsg "If issues occur, you can rollback using:"
    Write-WarningMsg "  - CloudFront: Restore from cloudfront-config/distribution-backup.json"
    Write-WarningMsg "  - S3: Previous files are not deleted, only overwritten"
    Write-WarningMsg "  - Lambda: Use AWS Console to restore previous version"
    Write-Host ""
    
    exit 0
    
} catch {
    # Deployment failed
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-StepHeader "Deployment Failed"
    
    Write-ErrorMsg "Deployment failed after $($duration.ToString('mm\:ss'))"
    Write-ErrorMsg "Error: $($_.Exception.Message)"
    Write-Host ""
    
    # Display what was completed
    Write-InfoMsg "Completed Steps:"
    Write-InfoMsg "================"
    $completedSteps = $deploymentSteps.Keys | Where-Object { $deploymentSteps[$_] } | Sort-Object
    if ($completedSteps.Count -gt 0) {
        foreach ($step in $completedSteps) {
            Write-Host "  [OK] $step" -ForegroundColor Green
        }
    } else {
        Write-InfoMsg "  No steps completed"
    }
    Write-Host ""
    
    # Display what failed
    Write-ErrorMsg "Failed/Skipped Steps:"
    Write-ErrorMsg "===================="
    $failedSteps = $deploymentSteps.Keys | Where-Object { -not $deploymentSteps[$_] } | Sort-Object
    foreach ($step in $failedSteps) {
        Write-Host "  [X] $step" -ForegroundColor Red
    }
    Write-Host ""
    
    # Troubleshooting tips
    Write-InfoMsg "Troubleshooting:"
    Write-InfoMsg "================"
    Write-InfoMsg "1. Check AWS credentials: aws sts get-caller-identity"
    Write-InfoMsg "2. Verify IAM permissions for CloudFront, S3, and Lambda"
    Write-InfoMsg "3. Review error messages above for specific issues"
    Write-InfoMsg "4. Check individual script logs for detailed error information"
    Write-InfoMsg "5. Ensure all prerequisite files exist (cloudfront-function/uri-rewrite.js, etc.)"
    Write-Host ""
    
    # Rollback recommendation
    Write-WarningMsg "Rollback Recommendation:"
    Write-WarningMsg "========================"
    if ($deploymentSteps["Distribution"]) {
        Write-WarningMsg "CloudFront distribution was modified. Consider rolling back:"
        Write-WarningMsg "  aws cloudfront update-distribution --id $DistributionId --if-match <etag> --distribution-config file://cloudfront-config/distribution-backup.json"
    }
    Write-Host ""
    
    exit 1
}
