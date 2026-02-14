# Auth Handler Lambda Function

This Lambda function handles user registration by creating user records in DynamoDB after successful Cognito registration.

## Endpoints

### POST /auth/register

Creates a user record in the DynamoDB Users table.

**Request Body:**
```json
{
  "cognitoUserId": "string (UUID)",
  "email": "string"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "userId": "string"
}
```

**Error Responses:**
- 400: Validation error (missing required fields)
- 409: User already exists
- 500: Internal server error

## Environment Variables

- `USERS_TABLE`: Name of the DynamoDB Users table (default: "Users")

## Deployment

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js 18+ installed
3. DynamoDB Users table created (see `docs/aws-infrastructure-setup.md`)
4. IAM role for Lambda with DynamoDB permissions

### Build and Deploy

1. Install dependencies:
```bash
cd lambda/auth-handler
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

3. Create deployment package:
```bash
zip -r auth-handler.zip index.js node_modules package.json
```

4. Deploy to AWS Lambda:
```bash
aws lambda create-function \
  --function-name polizalab-auth-handler \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/polizalab-lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://auth-handler.zip \
  --environment Variables="{USERS_TABLE=Users}" \
  --timeout 30 \
  --memory-size 256
```

5. Update function (for subsequent deployments):
```bash
aws lambda update-function-code \
  --function-name polizalab-auth-handler \
  --zip-file fileb://auth-handler.zip
```

### API Gateway Integration

This function should be integrated with API Gateway HTTP API:

1. Create a route: `POST /auth/register`
2. Set integration type: Lambda function
3. Select the `polizalab-auth-handler` function
4. No authorizer needed (public endpoint)

## Testing

Test the function locally using AWS SAM or by invoking directly:

```bash
aws lambda invoke \
  --function-name polizalab-auth-handler \
  --payload '{"httpMethod":"POST","path":"/auth/register","body":"{\"cognitoUserId\":\"test-uuid\",\"email\":\"test@example.com\"}"}' \
  response.json
```

## Logging

All logs are sent to CloudWatch Logs. View logs:

```bash
aws logs tail /aws/lambda/polizalab-auth-handler --follow
```

## Requirements Validation

This Lambda function implements:
- **Requirement 1.1**: User registration creates account
- **Requirement 1.6**: User record created in DynamoDB after registration
- **Requirement 14.3**: Uses Cognito user sub as userId
- **Requirement 14.4**: Stores userId, email, and createdAt
- **Requirement 14.5**: Sets createdAt to current ISO 8601 timestamp
