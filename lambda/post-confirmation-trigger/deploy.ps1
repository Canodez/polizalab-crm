# Deploy Post-Confirmation Trigger Lambda (PowerShell)
# This script packages and deploys the Lambda function

$FUNCTION_NAME = "cognito-post-confirmation-trigger"
$REGION = "us-east-1"
$USERS_TABLE = "Users"

Write-Host "📦 Packaging Lambda function..." -ForegroundColor Cyan

# Create deployment package
Compress-Archive -Path index.py -DestinationPath function.zip -Force

Write-Host "🚀 Deploying Lambda function..." -ForegroundColor Cyan

# Deploy to AWS Lambda
aws lambda update-function-code `
  --function-name $FUNCTION_NAME `
  --zip-file fileb://function.zip `
  --region $REGION

Write-Host "⚙️  Updating environment variables..." -ForegroundColor Cyan

# Update environment variables
aws lambda update-function-configuration `
  --function-name $FUNCTION_NAME `
  --environment "Variables={USERS_TABLE=$USERS_TABLE}" `
  --region $REGION

Write-Host "✅ Deployment complete!" -ForegroundColor Green

# Clean up
Remove-Item function.zip

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure Cognito User Pool to use this trigger"
Write-Host "2. Test by registering a new user"
