# PolizaLab MVP - AWS Infrastructure Setup Script (PowerShell)
# This script automates the creation of AWS resources using AWS CLI

$ErrorActionPreference = "Stop"

# Configuration
$AWS_REGION = "us-east-1"
$PROJECT_NAME = "polizalab"
$ENVIRONMENT = "dev"

# Resource names
$USER_POOL_NAME = "$PROJECT_NAME-users"
$APP_CLIENT_NAME = "$PROJECT_NAME-web-client"
$USERS_TABLE = "Users"
$POLICIES_TABLE = "Policies"
$BUCKET_NAME = "$PROJECT_NAME-documents-$ENVIRONMENT"

Write-Host "========================================" -ForegroundColor Blue
Write-Host "PolizaLab MVP - AWS Infrastructure Setup" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Check if AWS CLI is installed
try {
    $null = aws --version
    Write-Host "✓ AWS CLI is installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: AWS CLI is not installed" -ForegroundColor Red
    Write-Host "Please install AWS CLI: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Check if AWS credentials are configured
try {
    $AWS_ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
    Write-Host "✓ AWS Account ID: $AWS_ACCOUNT_ID" -ForegroundColor Green
    Write-Host "✓ AWS Region: $AWS_REGION" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: AWS credentials are not configured" -ForegroundColor Red
    Write-Host "Please run: aws configure" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Confirm before proceeding
$confirmation = Read-Host "Do you want to proceed with infrastructure setup? (y/n)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Setup cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Starting infrastructure setup..." -ForegroundColor Yellow
Write-Host ""

# ============================================
# 1. Create Cognito User Pool
# ============================================
Write-Host "[1/3] Creating Cognito User Pool..." -ForegroundColor Blue

try {
    $USER_POOL_ID = aws cognito-idp create-user-pool `
        --pool-name $USER_POOL_NAME `
        --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" `
        --auto-verified-attributes email `
        --username-attributes email `
        --mfa-configuration OFF `
        --account-recovery-setting "RecoveryMechanisms=[{Priority=1,Name=verified_email}]" `
        --region $AWS_REGION `
        --query 'UserPool.Id' `
        --output text 2>$null
    
    if ([string]::IsNullOrEmpty($USER_POOL_ID)) {
        throw "Failed to create user pool"
    }
} catch {
    Write-Host "User Pool may already exist, attempting to retrieve..." -ForegroundColor Yellow
    $USER_POOL_ID = aws cognito-idp list-user-pools --max-results 60 --region $AWS_REGION `
        --query "UserPools[?Name=='$USER_POOL_NAME'].Id" --output text
}

if ([string]::IsNullOrEmpty($USER_POOL_ID)) {
    Write-Host "✗ Failed to create or find User Pool" -ForegroundColor Red
    exit 1
}

Write-Host "✓ User Pool ID: $USER_POOL_ID" -ForegroundColor Green

# Create App Client
Write-Host "Creating Cognito App Client..." -ForegroundColor Blue

try {
    $APP_CLIENT_ID = aws cognito-idp create-user-pool-client `
        --user-pool-id $USER_POOL_ID `
        --client-name $APP_CLIENT_NAME `
        --no-generate-secret `
        --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH `
        --region $AWS_REGION `
        --query 'UserPoolClient.ClientId' `
        --output text 2>$null
    
    if ([string]::IsNullOrEmpty($APP_CLIENT_ID)) {
        throw "Failed to create app client"
    }
} catch {
    Write-Host "App Client may already exist, attempting to retrieve..." -ForegroundColor Yellow
    $APP_CLIENT_ID = aws cognito-idp list-user-pool-clients `
        --user-pool-id $USER_POOL_ID `
        --region $AWS_REGION `
        --query "UserPoolClients[?ClientName=='$APP_CLIENT_NAME'].ClientId" `
        --output text
}

if ([string]::IsNullOrEmpty($APP_CLIENT_ID)) {
    Write-Host "✗ Failed to create or find App Client" -ForegroundColor Red
    exit 1
}

Write-Host "✓ App Client ID: $APP_CLIENT_ID" -ForegroundColor Green
Write-Host ""

# ============================================
# 2. Create DynamoDB Tables
# ============================================
Write-Host "[2/3] Creating DynamoDB Tables..." -ForegroundColor Blue

# Create Users table
try {
    aws dynamodb create-table `
        --table-name $USERS_TABLE `
        --attribute-definitions AttributeName=userId,AttributeType=S `
        --key-schema AttributeName=userId,KeyType=HASH `
        --billing-mode PAY_PER_REQUEST `
        --region $AWS_REGION 2>$null | Out-Null
    Write-Host "✓ Users table created" -ForegroundColor Green
} catch {
    Write-Host "Users table may already exist" -ForegroundColor Yellow
}

# Create Policies table
try {
    aws dynamodb create-table `
        --table-name $POLICIES_TABLE `
        --attribute-definitions AttributeName=policyId,AttributeType=S AttributeName=userId,AttributeType=S AttributeName=createdAt,AttributeType=S `
        --key-schema AttributeName=policyId,KeyType=HASH `
        --global-secondary-indexes "IndexName=userId-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" `
        --billing-mode PAY_PER_REQUEST `
        --region $AWS_REGION 2>$null | Out-Null
    Write-Host "✓ Policies table created" -ForegroundColor Green
} catch {
    Write-Host "Policies table may already exist" -ForegroundColor Yellow
}

# Wait for tables to be active
Write-Host "Waiting for tables to become active..." -ForegroundColor Yellow
aws dynamodb wait table-exists --table-name $USERS_TABLE --region $AWS_REGION
aws dynamodb wait table-exists --table-name $POLICIES_TABLE --region $AWS_REGION
Write-Host "✓ Tables are active" -ForegroundColor Green
Write-Host ""

# ============================================
# 3. Create S3 Bucket
# ============================================
Write-Host "[3/3] Creating S3 Bucket..." -ForegroundColor Blue

try {
    aws s3api create-bucket `
        --bucket $BUCKET_NAME `
        --region $AWS_REGION 2>$null | Out-Null
    Write-Host "✓ Bucket created: $BUCKET_NAME" -ForegroundColor Green
} catch {
    Write-Host "Bucket already exists: $BUCKET_NAME" -ForegroundColor Yellow
}

# Enable encryption
aws s3api put-bucket-encryption `
    --bucket $BUCKET_NAME `
    --server-side-encryption-configuration '{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"AES256\"}}]}' 2>$null | Out-Null

# Block public access
aws s3api put-public-access-block `
    --bucket $BUCKET_NAME `
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" 2>$null | Out-Null

Write-Host "✓ Bucket configured with encryption and blocked public access" -ForegroundColor Green

# Configure CORS
$corsConfig = @'
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}
'@

$corsConfig | Out-File -FilePath "$env:TEMP\cors-config.json" -Encoding utf8

aws s3api put-bucket-cors `
    --bucket $BUCKET_NAME `
    --cors-configuration "file://$env:TEMP\cors-config.json" 2>$null | Out-Null

Remove-Item "$env:TEMP\cors-config.json"

Write-Host "✓ CORS configured" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Blue
Write-Host "AWS Infrastructure Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Environment Variables:" -ForegroundColor Yellow
Write-Host ""
Write-Host "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID"
Write-Host "NEXT_PUBLIC_COGNITO_CLIENT_ID=$APP_CLIENT_ID"
Write-Host "NEXT_PUBLIC_COGNITO_REGION=$AWS_REGION"
Write-Host "NEXT_PUBLIC_S3_BUCKET_NAME=$BUCKET_NAME"
Write-Host "NEXT_PUBLIC_AWS_REGION=$AWS_REGION"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Copy the environment variables above to your .env.local file"
Write-Host "2. Create IAM roles for Lambda functions (see docs/aws-infrastructure-setup.md)"
Write-Host "3. Create and deploy Lambda functions"
Write-Host "4. Create API Gateway and configure routes"
Write-Host ""
Write-Host "Setup script completed successfully!" -ForegroundColor Green
