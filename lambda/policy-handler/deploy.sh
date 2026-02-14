#!/bin/bash

# Policy Handler Lambda Deployment Script

set -e

echo "Building Policy Handler Lambda..."

# Install dependencies
npm install

# Build TypeScript
npm run build

# Create deployment package
echo "Creating deployment package..."
cd dist
zip -r ../policy-handler.zip .
cd ..
zip -r policy-handler.zip node_modules

echo "Deployment package created: policy-handler.zip"
echo ""
echo "To deploy to AWS Lambda, run:"
echo "aws lambda update-function-code --function-name polizalab-policy-handler --zip-file fileb://policy-handler.zip --region us-east-1"
