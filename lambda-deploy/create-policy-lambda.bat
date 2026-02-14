@echo off
REM Policy Handler Lambda Deployment Script for Windows

echo Creating Policy Handler Lambda deployment package...

REM Create zip file
powershell Compress-Archive -Path policy_handler.py -DestinationPath policy_handler.zip -Force

echo Deployment package created: policy_handler.zip
echo.
echo To create the Lambda function, run:
echo aws lambda create-function --function-name polizalab-policy-handler --runtime python3.12 --role arn:aws:iam::584876396768:role/PolizaLabAuthProfileLambdaRole --handler policy_handler.lambda_handler --zip-file fileb://policy_handler.zip --timeout 30 --environment Variables={DYNAMODB_POLICIES_TABLE=Policies,S3_BUCKET_NAME=polizalab-documents-dev} --region us-east-1
echo.
echo To update existing Lambda function, run:
echo aws lambda update-function-code --function-name polizalab-policy-handler --zip-file fileb://policy_handler.zip --region us-east-1
