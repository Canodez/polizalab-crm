#!/bin/bash

# Deploy Post-Confirmation Trigger Lambda
# This script packages and deploys the Lambda function

set -e

FUNCTION_NAME="cognito-post-confirmation-trigger"
REGION="us-east-1"
USERS_TABLE="Users"

echo "📦 Packaging Lambda function..."

# Create deployment package
zip -r function.zip index.py

echo "🚀 Deploying Lambda function..."

# Deploy to AWS Lambda
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://function.zip \
  --region $REGION

echo "⚙️  Updating environment variables..."

# Update environment variables
aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --environment Variables="{USERS_TABLE=$USERS_TABLE}" \
  --region $REGION

echo "✅ Deployment complete!"

# Clean up
rm function.zip

echo ""
echo "Next steps:"
echo "1. Configure Cognito User Pool to use this trigger"
echo "2. Test by registering a new user"
