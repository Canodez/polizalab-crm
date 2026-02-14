#!/bin/bash

# PolizaLab MVP - AWS Infrastructure Setup Script
# This script automates the creation of AWS resources using AWS CLI

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-east-1"
PROJECT_NAME="polizalab"
ENVIRONMENT="dev"

# Resource names
USER_POOL_NAME="${PROJECT_NAME}-users"
APP_CLIENT_NAME="${PROJECT_NAME}-web-client"
USERS_TABLE="Users"
POLICIES_TABLE="Policies"
BUCKET_NAME="${PROJECT_NAME}-documents-${ENVIRONMENT}"
API_NAME="${PROJECT_NAME}-api"

# Lambda functions
AUTH_LAMBDA="polizalab-auth-handler"
PROFILE_LAMBDA="polizalab-profile-handler"
POLICY_LAMBDA="polizalab-policy-handler"
DOC_PROCESSOR_LAMBDA="polizalab-document-processor"

# IAM roles
AUTH_PROFILE_ROLE="PolizaLabAuthProfileLambdaRole"
POLICY_ROLE="PolizaLabPolicyLambdaRole"
DOC_PROCESSOR_ROLE="PolizaLabDocProcessorLambdaRole"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}PolizaLab MVP - AWS Infrastructure Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials are not configured${NC}"
    echo "Please run: aws configure"
    exit 1
fi

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✓ AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"
echo -e "${GREEN}✓ AWS Region: ${AWS_REGION}${NC}"
echo ""

# Confirm before proceeding
read -p "Do you want to proceed with infrastructure setup? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting infrastructure setup...${NC}"
echo ""

# ============================================
# 1. Create Cognito User Pool
# ============================================
echo -e "${BLUE}[1/10] Creating Cognito User Pool...${NC}"

USER_POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "${USER_POOL_NAME}" \
    --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
    --auto-verified-attributes email \
    --username-attributes email \
    --mfa-configuration OFF \
    --account-recovery-setting "RecoveryMechanisms=[{Priority=1,Name=verified_email}]" \
    --region "${AWS_REGION}" \
    --query 'UserPool.Id' \
    --output text 2>/dev/null || echo "")

if [ -z "$USER_POOL_ID" ]; then
    echo -e "${YELLOW}User Pool may already exist, attempting to retrieve...${NC}"
    USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 --region "${AWS_REGION}" \
        --query "UserPools[?Name=='${USER_POOL_NAME}'].Id" --output text)
fi

if [ -z "$USER_POOL_ID" ]; then
    echo -e "${RED}✗ Failed to create or find User Pool${NC}"
    exit 1
fi

echo -e "${GREEN}✓ User Pool ID: ${USER_POOL_ID}${NC}"

# Create App Client
echo -e "${BLUE}Creating Cognito App Client...${NC}"

APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "${USER_POOL_ID}" \
    --client-name "${APP_CLIENT_NAME}" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --region "${AWS_REGION}" \
    --query 'UserPoolClient.ClientId' \
    --output text 2>/dev/null || echo "")

if [ -z "$APP_CLIENT_ID" ]; then
    echo -e "${YELLOW}App Client may already exist, attempting to retrieve...${NC}"
    APP_CLIENT_ID=$(aws cognito-idp list-user-pool-clients \
        --user-pool-id "${USER_POOL_ID}" \
        --region "${AWS_REGION}" \
        --query "UserPoolClients[?ClientName=='${APP_CLIENT_NAME}'].ClientId" \
        --output text)
fi

if [ -z "$APP_CLIENT_ID" ]; then
    echo -e "${RED}✗ Failed to create or find App Client${NC}"
    exit 1
fi

echo -e "${GREEN}✓ App Client ID: ${APP_CLIENT_ID}${NC}"
echo ""

# ============================================
# 2. Create DynamoDB Tables
# ============================================
echo -e "${BLUE}[2/10] Creating DynamoDB Tables...${NC}"

# Create Users table
aws dynamodb create-table \
    --table-name "${USERS_TABLE}" \
    --attribute-definitions AttributeName=userId,AttributeType=S \
    --key-schema AttributeName=userId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${AWS_REGION}" \
    &> /dev/null || echo -e "${YELLOW}Users table may already exist${NC}"

echo -e "${GREEN}✓ Users table created/exists${NC}"

# Create Policies table
aws dynamodb create-table \
    --table-name "${POLICIES_TABLE}" \
    --attribute-definitions \
        AttributeName=policyId,AttributeType=S \
        AttributeName=userId,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
    --key-schema AttributeName=policyId,KeyType=HASH \
    --global-secondary-indexes \
        "IndexName=userId-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
    --billing-mode PAY_PER_REQUEST \
    --region "${AWS_REGION}" \
    &> /dev/null || echo -e "${YELLOW}Policies table may already exist${NC}"

echo -e "${GREEN}✓ Policies table created/exists${NC}"

# Wait for tables to be active
echo -e "${YELLOW}Waiting for tables to become active...${NC}"
aws dynamodb wait table-exists --table-name "${USERS_TABLE}" --region "${AWS_REGION}"
aws dynamodb wait table-exists --table-name "${POLICIES_TABLE}" --region "${AWS_REGION}"
echo -e "${GREEN}✓ Tables are active${NC}"
echo ""

# ============================================
# 3. Create S3 Bucket
# ============================================
echo -e "${BLUE}[3/10] Creating S3 Bucket...${NC}"

# Check if bucket name is available (must be globally unique)
if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3api create-bucket \
        --bucket "${BUCKET_NAME}" \
        --region "${AWS_REGION}" \
        &> /dev/null
    echo -e "${GREEN}✓ Bucket created: ${BUCKET_NAME}${NC}"
else
    echo -e "${YELLOW}Bucket already exists: ${BUCKET_NAME}${NC}"
fi

# Enable encryption
aws s3api put-bucket-encryption \
    --bucket "${BUCKET_NAME}" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
    &> /dev/null

# Block public access
aws s3api put-public-access-block \
    --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    &> /dev/null

echo -e "${GREEN}✓ Bucket configured with encryption and blocked public access${NC}"

# Configure CORS
cat > /tmp/cors-config.json <<EOF
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
EOF

aws s3api put-bucket-cors \
    --bucket "${BUCKET_NAME}" \
    --cors-configuration file:///tmp/cors-config.json \
    &> /dev/null

rm /tmp/cors-config.json

echo -e "${GREEN}✓ CORS configured${NC}"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}AWS Infrastructure Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Environment Variables:${NC}"
echo ""
echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=${USER_POOL_ID}"
echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=${APP_CLIENT_ID}"
echo "NEXT_PUBLIC_COGNITO_REGION=${AWS_REGION}"
echo "NEXT_PUBLIC_S3_BUCKET_NAME=${BUCKET_NAME}"
echo "NEXT_PUBLIC_AWS_REGION=${AWS_REGION}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Copy the environment variables above to your .env.local file"
echo "2. Create IAM roles for Lambda functions (see docs/aws-infrastructure-setup.md)"
echo "3. Create and deploy Lambda functions"
echo "4. Create API Gateway and configure routes"
echo ""
echo -e "${GREEN}Setup script completed successfully!${NC}"
