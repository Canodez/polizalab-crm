# CloudFront Function Deployment Script
# This script creates and publishes a CloudFront Function for URI rewriting
# Requirements: 5.1, 5.5, 5.6

param(
    [Parameter(Mandatory=$false)]
    [string]$FunctionName = "uri-rewrite-function",
    
    [Parameter(Mandatory=$false)]
    [string]$FunctionCodePath = "cloudfront-function/uri-rewrite.js",
    
    [Parameter(Mandatory=$false)]
    [string]$Comment = "URI rewriting function for static route resolution"
)

# AWS CLI v2 path (required for CloudFront Functions)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Color output functions
function Write-SuccessMsg {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-InfoMsg {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Main script
Write-InfoMsg "Starting CloudFront Function deployment..."
Write-InfoMsg "Function Name: $FunctionName"
Write-InfoMsg "Function Code: $FunctionCodePath"

# Check if AWS CLI v2 is installed
if (-not (Test-Path $awsCmd)) {
    Write-ErrorMsg "AWS CLI v2 not found at: $awsCmd"
    Write-ErrorMsg "Please install AWS CLI v2 from: https://aws.amazon.com/cli/"
    exit 1
}

try {
    $awsVersion = & $awsCmd --version 2>&1
    Write-InfoMsg "AWS CLI found: $awsVersion"
    
    # Verify it's AWS CLI v2
    if ($awsVersion -notmatch "aws-cli/2\.") {
        Write-ErrorMsg "AWS CLI v2 is required for CloudFront Functions"
        Write-ErrorMsg "Current version: $awsVersion"
        exit 1
    }
    Write-SuccessMsg "AWS CLI v2 verified"
} catch {
    Write-ErrorMsg "Failed to execute AWS CLI: $_"
    exit 1
}

# Check if function code file exists
if (-not (Test-Path $FunctionCodePath)) {
    Write-ErrorMsg "Function code file not found: $FunctionCodePath"
    exit 1
}
Write-SuccessMsg "Function code file found"

# Read function code
try {
    $functionCode = Get-Content -Path $FunctionCodePath -Raw
    Write-SuccessMsg "Function code loaded successfully"
} catch {
    Write-ErrorMsg "Failed to read function code: $_"
    exit 1
}

# Check if function already exists
Write-InfoMsg "Checking if function already exists..."
$existingFunction = & $awsCmd cloudfront describe-function --name $FunctionName 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-InfoMsg "Function already exists. Updating function code..."
    
    # Get current ETag
    $functionInfo = & $awsCmd cloudfront describe-function --name $FunctionName --output json | ConvertFrom-Json
    $etag = $functionInfo.ETag
    
    # Update function code
    try {
        $updateResult = & $awsCmd cloudfront update-function `
            --name $FunctionName `
            --function-code "fileb://$FunctionCodePath" `
            --function-config "Comment=$Comment,Runtime=cloudfront-js-1.0" `
            --if-match $etag `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to update function: $updateResult"
            exit 1
        }
        
        $updateJson = $updateResult | ConvertFrom-Json
        $newEtag = $updateJson.ETag
        Write-SuccessMsg "Function code updated successfully"
        
        # Publish the updated function
        Write-InfoMsg "Publishing updated function..."
        $publishResult = & $awsCmd cloudfront publish-function `
            --name $FunctionName `
            --if-match $newEtag `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to publish function: $publishResult"
            exit 1
        }
        
        $publishJson = $publishResult | ConvertFrom-Json
        $functionArn = $publishJson.FunctionSummary.FunctionMetadata.FunctionARN
        
        Write-SuccessMsg "Function published successfully"
        Write-SuccessMsg "Function ARN: $functionArn"
        
        # Output ARN to file for use in other scripts
        $functionArn | Out-File -FilePath "cloudfront-function-arn.txt" -NoNewline
        Write-SuccessMsg "Function ARN saved to: cloudfront-function-arn.txt"
        
    } catch {
        Write-ErrorMsg "Error during function update: $_"
        exit 1
    }
    
} else {
    Write-InfoMsg "Function does not exist. Creating new function..."
    
    # Create new function
    try {
        $createResult = & $awsCmd cloudfront create-function `
            --name $FunctionName `
            --function-code "fileb://$FunctionCodePath" `
            --function-config "Comment=$Comment,Runtime=cloudfront-js-1.0" `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to create function: $createResult"
            exit 1
        }
        
        $createJson = $createResult | ConvertFrom-Json
        $etag = $createJson.ETag
        Write-SuccessMsg "Function created successfully"
        
        # Publish the new function
        Write-InfoMsg "Publishing function..."
        $publishResult = & $awsCmd cloudfront publish-function `
            --name $FunctionName `
            --if-match $etag `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to publish function: $publishResult"
            exit 1
        }
        
        $publishJson = $publishResult | ConvertFrom-Json
        $functionArn = $publishJson.FunctionSummary.FunctionMetadata.FunctionARN
        
        Write-SuccessMsg "Function published successfully"
        Write-SuccessMsg "Function ARN: $functionArn"
        
        # Output ARN to file for use in other scripts
        $functionArn | Out-File -FilePath "cloudfront-function-arn.txt" -NoNewline
        Write-SuccessMsg "Function ARN saved to: cloudfront-function-arn.txt"
        
    } catch {
        Write-ErrorMsg "Error during function creation: $_"
        exit 1
    }
}

Write-SuccessMsg "CloudFront Function deployment completed successfully!"
Write-InfoMsg ""
Write-InfoMsg "Next steps:"
Write-InfoMsg "1. Associate this function with your CloudFront distribution"
Write-InfoMsg "2. Use the ARN from cloudfront-function-arn.txt"
Write-InfoMsg "3. Run the distribution update script to apply the function"

exit 0
