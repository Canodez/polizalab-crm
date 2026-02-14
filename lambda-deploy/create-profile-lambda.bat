@echo off
aws lambda create-function ^
  --function-name polizalab-profile-handler ^
  --runtime python3.12 ^
  --role arn:aws:iam::584876396768:role/PolizaLabAuthProfileLambdaRole ^
  --handler profile_handler.lambda_handler ^
  --zip-file fileb://profile_handler.zip ^
  --environment Variables={DYNAMODB_USERS_TABLE=Users,S3_BUCKET_NAME=polizalab-documents-dev} ^
  --region us-east-1 ^
  --timeout 30
