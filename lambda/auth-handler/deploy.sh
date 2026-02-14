#!/bin/bash

# Deployment script for Auth Handler Lambda function
# Usage: ./deploy.sh [create|update]

set -e

FUNCTION_NAME="polizalab-auth-handler"
RUNTIME="nodejs18.x"
HANDLER="index.handler"
TIMEOUT=30
MEMORY_SIZE=256
USERS_TABLE="${USERS_TABLE:-Users}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Check if IAM role ARN is set
if [ -z "$LAMBDA_ROLE_ARN" ]; then
    echo "Error: LAMBDA_ROLE_ARN environment variable is not set"
    echo "Example: export LAMBDA_ROLE_ARN=arn:aws:iam::123456789012:role/polizalab-lambda-execution-role"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Create deployment package
echo "Creating deployment package..."
zip -r auth-handler.zip index.js node_modules package.json

# Deploy based on command
COMMAND=${1:-update}

if [ "$COMMAND" = "create" ]; then
    echo "Creating Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime $RUNTIME \
        --role $LAMBDA_ROLE_ARN \
        --handler $HANDLER \
        --zip-file fileb://auth-handler.zip \
        --environment Variables="{USERS_TABLE=$USERS_TABLE}" \
        --timeout $TIMEOUT \
        --memory-size $MEMORY_SIZE \
        --description "Auth Handler for PolizaLab MVP"
    
    echo "Lambda function created successfully!"
elif [ "$COMMAND" = "update" ]; then
    echo "Updating Lambda function code..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://auth-handler.zip
    
    echo "Updating Lambda function configuration..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --environment Variables="{USERS_TABLE=$USERS_TABLE}" \
        --timeout $TIMEOUT \
        --memory-size $MEMORY_SIZE
    
    echo "Lambda function updated successfully!"
else
    echo "Error: Invalid command. Use 'create' or 'update'"
    exit 1
fi

echo "Deployment complete!"
