#!/bin/bash

# Profile Image Upload Lambda Deployment Script
# This script builds, packages, and deploys the Lambda function to AWS

set -e

FUNCTION_NAME="polizalab-profile-image-upload"
REGION="us-east-1"
ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role"
S3_BUCKET="polizalab-profile-images"

echo "Starting deployment of Profile Image Upload Lambda..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Package Lambda
echo "Packaging Lambda..."
zip -r profile-image-upload.zip index.js node_modules

# Check if function exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
  echo "Updating existing Lambda function..."
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://profile-image-upload.zip \
    --region $REGION

  echo "Updating function configuration..."
  aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --environment "Variables={S3_BUCKET=$S3_BUCKET}" \
    --region $REGION
else
  echo "Creating new Lambda function..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime nodejs20.x \
    --role $ROLE_ARN \
    --handler index.handler \
    --zip-file fileb://profile-image-upload.zip \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={S3_BUCKET=$S3_BUCKET}" \
    --region $REGION
fi

echo "Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Configure API Gateway to route /profile/image/upload to this Lambda"
echo "2. Ensure the Lambda execution role has S3 permissions"
echo "3. Test the endpoint with a POST request"
