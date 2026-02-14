@echo off
aws lambda create-function ^
  --function-name polizalab-auth-handler ^
  --runtime python3.12 ^
  --role arn:aws:iam::584876396768:role/PolizaLabAuthProfileLambdaRole ^
  --handler auth_handler.lambda_handler ^
  --zip-file fileb://auth_handler.zip ^
  --environment Variables={DYNAMODB_USERS_TABLE=Users} ^
  --region us-east-1 ^
  --timeout 30
