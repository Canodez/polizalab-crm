# Profile Image Upload Lambda Deployment Script (PowerShell)
# This script builds, packages, and deploys the Lambda function to AWS

$ErrorActionPreference = "Stop"

$FUNCTION_NAME = "polizalab-profile-image-upload"
$REGION = "us-east-1"
$ROLE_ARN = "arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role"
$S3_BUCKET = "polizalab-profile-images"
$AWS_CLI = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

Write-Host "Starting deployment of Profile Image Upload Lambda..." -ForegroundColor Green

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Yellow
npm run build

# Package Lambda
Write-Host "Packaging Lambda..." -ForegroundColor Yellow
if (Test-Path "profile-image-upload.zip") {
    Remove-Item "profile-image-upload.zip"
}
Compress-Archive -Path "index.js", "node_modules" -DestinationPath "profile-image-upload.zip"

# Check if function exists
try {
    & $AWS_CLI lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>$null
    $functionExists = $true
} catch {
    $functionExists = $false
}

if ($functionExists) {
    Write-Host "Updating existing Lambda function..." -ForegroundColor Yellow
    & $AWS_CLI lambda update-function-code `
        --function-name $FUNCTION_NAME `
        --zip-file fileb://profile-image-upload.zip `
        --region $REGION

    Write-Host "Updating function configuration..." -ForegroundColor Yellow
    & $AWS_CLI lambda update-function-configuration `
        --function-name $FUNCTION_NAME `
        --environment "Variables={S3_BUCKET=$S3_BUCKET}" `
        --region $REGION
} else {
    Write-Host "Creating new Lambda function..." -ForegroundColor Yellow
    & $AWS_CLI lambda create-function `
        --function-name $FUNCTION_NAME `
        --runtime nodejs20.x `
        --role $ROLE_ARN `
        --handler index.handler `
        --zip-file fileb://profile-image-upload.zip `
        --timeout 30 `
        --memory-size 256 `
        --environment "Variables={S3_BUCKET=$S3_BUCKET}" `
        --region $REGION
}

Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Configure API Gateway to route /profile/image/upload to this Lambda"
Write-Host "2. Ensure the Lambda execution role has S3 permissions"
Write-Host "3. Test the endpoint with a POST request"
