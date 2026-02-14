# Lambda Functions

This directory contains all AWS Lambda functions for the PolizaLab MVP backend.

## Functions

### 1. auth-handler
Handles user registration by creating user records in DynamoDB after Cognito registration.

**Endpoints:**
- `POST /auth/register` - Create user record

**Status:** ✅ Implemented

### 2. profile-handler (Planned)
Manages user profile operations including profile updates and image uploads.

**Endpoints:**
- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile
- `POST /profile/image` - Get pre-signed URL for profile image upload

**Status:** 🔄 Planned (Task 4.3)

### 3. policy-handler (Planned)
Manages policy CRUD operations and renewals.

**Endpoints:**
- `GET /policies` - List user's policies
- `GET /policies/:id` - Get single policy
- `PUT /policies/:id` - Update policy
- `POST /policies/upload-url` - Get pre-signed URL for document upload
- `GET /policies/renewals` - Get upcoming renewals

**Status:** 🔄 Planned (Task 8)

### 4. document-processor (Planned)
Processes uploaded documents with AWS Textract and extracts policy data.

**Trigger:** S3 Event Notification

**Status:** 🔄 Planned (Task 10)

## Development

Each Lambda function is a separate Node.js project with its own:
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Test configuration
- `README.md` - Function-specific documentation
- `deploy.sh` - Deployment script

### Prerequisites

- Node.js 18+
- AWS CLI configured
- IAM role for Lambda execution
- DynamoDB tables created

### Testing

Run tests for a specific function:

```bash
cd lambda/auth-handler
npm install
npm test
```

### Building

Build TypeScript for a specific function:

```bash
cd lambda/auth-handler
npm run build
```

### Deployment

Each function has a deployment script:

```bash
cd lambda/auth-handler
export LAMBDA_ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/polizalab-lambda-execution-role"
chmod +x deploy.sh
./deploy.sh create  # First time
./deploy.sh update  # Subsequent deployments
```

## Architecture

All Lambda functions follow these patterns:

1. **TypeScript** - Type-safe code with AWS SDK v3
2. **Error Handling** - Comprehensive error handling with appropriate HTTP status codes
3. **Logging** - CloudWatch Logs integration
4. **CORS** - All responses include CORS headers
5. **Validation** - Input validation with detailed error messages
6. **Testing** - Unit tests with mocked AWS services

## Environment Variables

Each function requires specific environment variables:

- **auth-handler**: `USERS_TABLE`
- **profile-handler**: `USERS_TABLE`, `S3_BUCKET`
- **policy-handler**: `POLICIES_TABLE`, `S3_BUCKET`
- **document-processor**: `POLICIES_TABLE`, `S3_BUCKET`

## IAM Permissions

Lambda functions require different IAM permissions:

### auth-handler & profile-handler
- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem`
- `s3:PutObject` (profile-handler only)
- `logs:CreateLogGroup`
- `logs:CreateLogStream`
- `logs:PutLogEvents`

### policy-handler
- `dynamodb:Query`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem`
- `s3:PutObject`
- `logs:*`

### document-processor
- `s3:GetObject`
- `textract:AnalyzeDocument`
- `dynamodb:PutItem`
- `logs:*`

See `docs/aws-infrastructure-setup.md` for detailed IAM role setup.

## API Gateway Integration

All HTTP Lambda functions (auth-handler, profile-handler, policy-handler) should be integrated with API Gateway HTTP API:

1. Create routes matching the function endpoints
2. Set integration type to Lambda function
3. Configure authorizers (Cognito for protected endpoints)
4. Enable CORS if needed

The document-processor function is triggered by S3 events, not API Gateway.

## Monitoring

Monitor Lambda functions using:

- **CloudWatch Logs**: View function logs
- **CloudWatch Metrics**: Monitor invocations, errors, duration
- **X-Ray**: Trace requests (optional)

View logs:
```bash
aws logs tail /aws/lambda/polizalab-auth-handler --follow
```

## Troubleshooting

Common issues:

1. **Permission Denied**: Check IAM role has required permissions
2. **Table Not Found**: Verify DynamoDB table names match environment variables
3. **Timeout**: Increase function timeout or optimize code
4. **Memory Issues**: Increase memory allocation

## Next Steps

1. Complete auth-handler testing and deployment
2. Implement profile-handler (Task 4.3)
3. Implement policy-handler (Task 8)
4. Implement document-processor (Task 10)
