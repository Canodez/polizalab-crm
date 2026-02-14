#!/bin/bash

# Profile Handler Lambda Deployment Script
# This script packages and deploys the Profile Handler Lambda function to AWS

set -e

FUNCTION_NAME="polizalab-profile-handler"
REGION="us-east-1"
RUNTIME="nodejs18.x"
HANDLER="index.handler"
ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/polizalab-lambda-role"
USERS_TABLE="Users"
S3_BUCKET="polizalab-documents-dev"

echo "Building Profile Handler Lambda..."
npm run build

echo "Packaging Lambda function..."
zip -r profile-handler.zip index.js node_modules/

echo "Deploying to AWS Lambda..."

# Check if function exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
  echo "Updating existing function..."
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://profile-handler.zip \
    --region $REGION

  echo "Updating function configuration..."
  aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --runtime $RUNTIME \
    --handler $HANDLER \
    --environment "Variables={USERS_TABLE=$USERS_TABLE,S3_BUCKET=$S3_BUCKET}" \
    --region $REGION
else
  echo "Creating new function..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime $RUNTIME \
    --role $ROLE_ARN \
    --handler $HANDLER \
    --zip-file fileb://profile-handler.zip \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={USERS_TABLE=$USERS_TABLE,S3_BUCKET=$S3_BUCKET}" \
    --region $REGION
fi

echo "Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Configure API Gateway routes:"
echo "   - GET /profile -> $FUNCTION_NAME"
echo "   - PUT /profile -> $FUNCTION_NAME"
echo "   - POST /profile/image -> $FUNCTION_NAME"
echo "2. Attach Cognito authorizer to the routes"
echo "3. Test the endpoints with a valid JWT token"
