# Profile Handler Lambda

Lambda function for managing user profile operations in PolizaLab MVP.

## Endpoints

### GET /profile
Retrieves the authenticated user's profile data.

**Authorization:** Required (JWT token)

**Response:**
```json
{
  "userId": "string",
  "email": "string",
  "nombre": "string | null",
  "apellido": "string | null",
  "profileImage": "string | null",
  "createdAt": "string (ISO 8601)"
}
```

### PUT /profile
Updates the authenticated user's profile fields (nombre, apellido).

**Authorization:** Required (JWT token)

**Request Body:**
```json
{
  "nombre": "string (optional)",
  "apellido": "string (optional)"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /profile/image
Generates a pre-signed URL for uploading a profile image to S3.

**Authorization:** Required (JWT token)

**Request Body:**
```json
{
  "fileName": "string",
  "fileType": "string (image/jpeg, image/png, or image/webp)"
}
```

**Response:**
```json
{
  "presignedUrl": "string",
  "s3Key": "string"
}
```

## Environment Variables

- `USERS_TABLE` - DynamoDB table name for users (default: "Users")
- `S3_BUCKET` - S3 bucket name for file storage (default: "polizalab-documents-dev")

## Requirements

**Requirements Implemented:**
- 2.1: Profile image upload to S3 with reference in DynamoDB
- 2.2: Update nombre field
- 2.3: Update apellido field
- 2.4: Retrieve profile data
- 2.5: Validate profile image formats (JPEG, PNG, WebP)
- 2.6: Replace profile image reference on new upload

## Development

### Install Dependencies
```bash
npm install
```

### Run Tests
```bash
npm test
```

### Build
```bash
npm run build
```

### Package for Deployment
```bash
npm run package
```

## Deployment

See [deploy.sh](./deploy.sh) for AWS CLI deployment commands.

### IAM Permissions Required

The Lambda execution role needs:
- DynamoDB: GetItem, UpdateItem on Users table
- S3: PutObject on the documents bucket
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

## Testing

The function includes comprehensive unit tests covering:
- Profile retrieval (GET /profile)
- Profile updates (PUT /profile)
- Profile image upload URL generation (POST /profile/image)
- Authorization checks
- Input validation
- Error handling
- JWT token extraction

Run tests with:
```bash
npm test
```

## Error Codes

- `AUTH_REQUIRED` - Authentication token missing
- `AUTH_INVALID` - Authentication token invalid or expired
- `NOT_FOUND` - User profile not found
- `VALIDATION_ERROR` - Input validation failed
- `INTERNAL_ERROR` - Unexpected server error
