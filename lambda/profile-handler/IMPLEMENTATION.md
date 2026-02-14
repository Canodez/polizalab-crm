# Profile Handler Implementation Guide

## Overview

The Profile Handler Lambda function manages user profile operations for PolizaLab MVP. It provides three main endpoints for profile management:

1. **GET /profile** - Retrieve user profile data
2. **PUT /profile** - Update profile fields (nombre, apellido)
3. **POST /profile/image** - Generate pre-signed URL for profile image upload

## Architecture

### Authentication Flow

The function extracts the userId from the JWT token in two ways:

1. **Primary Method**: From API Gateway's Cognito authorizer context
   - API Gateway validates the JWT token
   - Adds claims to `event.requestContext.authorizer.claims`
   - Function reads `sub` claim as userId

2. **Fallback Method**: Manual JWT parsing
   - Extracts token from Authorization header
   - Decodes the JWT payload (base64)
   - Reads `sub` claim as userId
   - Used for testing or custom authorizers

### Data Flow

#### Profile Retrieval (GET /profile)
```
Client → API Gateway → Lambda → DynamoDB (GetItem) → Lambda → Client
```

#### Profile Update (PUT /profile)
```
Client → API Gateway → Lambda → DynamoDB (UpdateItem) → Lambda → Client
```

#### Profile Image Upload (POST /profile/image)
```
Client → API Gateway → Lambda → S3 (generate presigned URL) → DynamoDB (update profileImage) → Lambda → Client
Client → S3 (direct upload using presigned URL)
```

## Implementation Details

### JWT Token Extraction

The `extractUserIdFromToken` function handles authentication:

```typescript
function extractUserIdFromToken(event: APIGatewayProxyEvent): string | null {
  // 1. Try to get userId from API Gateway authorizer context
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (userId) return userId;
  
  // 2. Fallback: parse JWT token manually
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const token = authHeader.replace('Bearer ', '');
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload.sub || null;
}
```

### Profile Retrieval

Uses DynamoDB GetCommand to fetch user data:

```typescript
const result = await docClient.send(
  new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId },
  })
);
```

Returns 404 if user not found, 200 with user data if found.

### Profile Update

Uses DynamoDB UpdateCommand with dynamic update expressions:

```typescript
// Build update expression based on provided fields
const updateExpressions: string[] = [];
if (body.nombre !== undefined) {
  updateExpressions.push('#nombre = :nombre');
}
if (body.apellido !== undefined) {
  updateExpressions.push('#apellido = :apellido');
}

await docClient.send(
  new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: { ... },
    ExpressionAttributeValues: { ... },
    ConditionExpression: 'attribute_exists(userId)',
  })
);
```

The `ConditionExpression` ensures the user exists before updating.

### Profile Image Upload

Two-step process:

1. **Generate pre-signed URL** for S3 upload:
```typescript
const s3Key = `profiles/${userId}/${fileName}`;
const command = new PutObjectCommand({
  Bucket: S3_BUCKET,
  Key: s3Key,
  ContentType: fileType,
});
const presignedUrl = await getSignedUrl(s3Client, command, {
  expiresIn: 300, // 5 minutes
});
```

2. **Update user profile** with S3 key reference:
```typescript
await docClient.send(
  new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET profileImage = :profileImage',
    ExpressionAttributeValues: {
      ':profileImage': s3Key,
    },
    ConditionExpression: 'attribute_exists(userId)',
  })
);
```

The client then uploads the file directly to S3 using the pre-signed URL.

### File Type Validation

Only JPEG, PNG, and WebP images are allowed:

```typescript
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
if (!allowedTypes.includes(body.fileType.toLowerCase())) {
  return createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid file type...');
}
```

## Error Handling

### Authorization Errors
- **401 AUTH_REQUIRED**: No JWT token provided
- **401 AUTH_INVALID**: Invalid or malformed JWT token

### Resource Errors
- **404 NOT_FOUND**: User profile not found (for GET, PUT, POST /image)

### Validation Errors
- **400 VALIDATION_ERROR**: Missing required fields
- **400 VALIDATION_ERROR**: Invalid file type for profile image
- **400 VALIDATION_ERROR**: No fields provided for update

### Database Errors
- **500 INTERNAL_ERROR**: DynamoDB errors
- **500 INTERNAL_ERROR**: S3 errors

All errors follow a consistent format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { /* optional */ }
  }
}
```

## Testing Strategy

### Unit Tests

The test suite covers:

1. **GET /profile**
   - Successful profile retrieval
   - User not found (404)
   - Missing authentication (401)
   - DynamoDB errors (500)

2. **PUT /profile**
   - Update both nombre and apellido
   - Update only nombre
   - Update only apellido
   - Missing fields (400)
   - User not found (404)
   - Missing authentication (401)

3. **POST /profile/image**
   - Valid JPEG upload
   - Valid PNG upload
   - Valid WebP upload
   - Invalid file type (400)
   - Missing fileName (400)
   - Missing fileType (400)
   - User not found (404)
   - Missing authentication (401)
   - Case-insensitive file type handling

4. **JWT Token Extraction**
   - Extract from requestContext authorizer
   - Fallback to Authorization header parsing
   - Handle malformed tokens

5. **Unknown Endpoints**
   - Return 404 for unknown paths
   - Return 404 for unsupported methods

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
```

## AWS Configuration

### DynamoDB Table

**Table Name**: Users

**Primary Key**: userId (String)

**Attributes**:
- userId (String) - Cognito user sub
- email (String)
- nombre (String, nullable)
- apellido (String, nullable)
- profileImage (String, nullable) - S3 key
- createdAt (String) - ISO 8601 timestamp

### S3 Bucket

**Bucket Name**: polizalab-documents-dev (or configured via env var)

**Folder Structure**:
```
/profiles/{userId}/{filename}
```

**CORS Configuration** (required for direct uploads):
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### IAM Role Permissions

The Lambda execution role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/Users"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::polizalab-documents-dev/profiles/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### API Gateway Configuration

**HTTP API with Cognito Authorizer**

Routes:
- `GET /profile` → profile-handler Lambda
- `PUT /profile` → profile-handler Lambda
- `POST /profile/image` → profile-handler Lambda

Authorizer:
- Type: JWT
- Issuer: Cognito User Pool
- Audience: Cognito App Client ID

## Deployment

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. DynamoDB Users table created
3. S3 bucket created with CORS configuration
4. IAM role created with required permissions
5. Cognito User Pool and App Client configured

### Deploy Steps

1. Install dependencies:
```bash
npm install
```

2. Run tests:
```bash
npm test
```

3. Update deploy.sh with your AWS account details:
   - ROLE_ARN
   - REGION
   - USERS_TABLE
   - S3_BUCKET

4. Make deploy script executable:
```bash
chmod +x deploy.sh
```

5. Deploy:
```bash
./deploy.sh
```

6. Configure API Gateway routes (see deploy.sh output)

### Environment Variables

Set in Lambda configuration:
- `USERS_TABLE`: DynamoDB table name (default: "Users")
- `S3_BUCKET`: S3 bucket name (default: "polizalab-documents-dev")

## Client Integration

### Example: Get Profile

```typescript
const response = await fetch('https://api.polizalab.com/profile', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
  },
});

const profile = await response.json();
```

### Example: Update Profile

```typescript
const response = await fetch('https://api.polizalab.com/profile', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    nombre: 'Carlos',
    apellido: 'García',
  }),
});

const result = await response.json();
```

### Example: Upload Profile Image

```typescript
// Step 1: Get pre-signed URL
const urlResponse = await fetch('https://api.polizalab.com/profile/image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fileName: 'avatar.jpg',
    fileType: 'image/jpeg',
  }),
});

const { presignedUrl, s3Key } = await urlResponse.json();

// Step 2: Upload file directly to S3
await fetch(presignedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'image/jpeg',
  },
  body: imageFile,
});
```

## Monitoring

### CloudWatch Logs

The function logs:
- All invocations with path and method
- Profile operations (get, update, image upload)
- Errors with context (userId, error details)

Log group: `/aws/lambda/polizalab-profile-handler`

### Key Metrics to Monitor

- Invocation count
- Error rate
- Duration
- Throttles
- DynamoDB read/write capacity
- S3 request count

## Troubleshooting

### 401 AUTH_REQUIRED

**Cause**: Missing or invalid JWT token

**Solution**: 
- Ensure Authorization header is present
- Verify JWT token is valid and not expired
- Check Cognito authorizer configuration

### 404 NOT_FOUND

**Cause**: User profile doesn't exist in DynamoDB

**Solution**:
- Verify user was created via auth-handler after Cognito registration
- Check userId matches Cognito sub claim
- Verify DynamoDB table name is correct

### 400 VALIDATION_ERROR (Invalid file type)

**Cause**: Unsupported image format

**Solution**:
- Only use JPEG, PNG, or WebP formats
- Ensure Content-Type header matches file type

### 500 INTERNAL_ERROR

**Cause**: DynamoDB or S3 errors

**Solution**:
- Check CloudWatch logs for detailed error
- Verify IAM permissions
- Verify table/bucket names are correct
- Check AWS service health

## Requirements Validation

This implementation satisfies the following requirements:

- ✅ **2.1**: Profile image upload to S3 with reference in DynamoDB
- ✅ **2.2**: Update nombre field
- ✅ **2.3**: Update apellido field
- ✅ **2.4**: Retrieve profile data
- ✅ **2.5**: Validate profile image formats (JPEG, PNG, WebP)
- ✅ **2.6**: Replace profile image reference on new upload

All requirements are covered with comprehensive unit tests.
