# Profile Image Upload Lambda

Lambda function that generates pre-signed URLs for uploading profile images to S3.

## Features

- Validates user authentication via JWT token
- Generates pre-signed S3 URLs for secure uploads
- Validates file types (JPEG, PNG, WebP)
- Validates file size (max 2MB)
- Sanitizes file names to prevent path traversal
- CORS configured for frontend access
- Comprehensive error handling

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `S3_BUCKET` | S3 bucket name for profile images | `polizalab-profile-images` |

## API Endpoint

### POST /profile/image/upload

Generates a pre-signed URL for uploading a profile image.

**Request Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileName": "profile.jpg",
  "fileType": "image/jpeg",
  "fileSize": 1048576
}
```

**Response (200 OK):**
```json
{
  "presignedUrl": "https://s3.amazonaws.com/...",
  "s3Key": "profiles/user-123/1234567890-profile.jpg",
  "expiresIn": 300
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid file type. Only JPEG, PNG, and WebP are supported",
    "details": {
      "fileType": "Must be one of: image/jpeg, image/png, image/webp"
    }
  }
}
```

## Deployment

### Prerequisites

1. AWS CLI v2 installed and configured
2. Node.js 20.x or later
3. IAM role with the following permissions:
   - `s3:PutObject` on the profile images bucket
   - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### Deploy with Bash (Linux/Mac)

```bash
cd lambda/profile-image-upload
chmod +x deploy.sh
./deploy.sh
```

### Deploy with PowerShell (Windows)

```powershell
cd lambda/profile-image-upload
.\deploy.ps1
```

### Manual Deployment

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Package Lambda
npm run package

# Deploy to AWS
aws lambda update-function-code \
  --function-name polizalab-profile-image-upload \
  --zip-file fileb://profile-image-upload.zip \
  --region us-east-1
```

## IAM Permissions

The Lambda execution role needs the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::polizalab-profile-images/profiles/*"
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

## API Gateway Integration

1. Create a new resource `/profile/image/upload` in API Gateway
2. Create a POST method
3. Set integration type to Lambda Function
4. Select the `polizalab-profile-image-upload` function
5. Enable CORS
6. Deploy to your API stage

### CORS Configuration

The Lambda function includes CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

Ensure API Gateway is also configured to handle OPTIONS requests for CORS preflight.

## Testing

### Test with curl

```bash
# Get JWT token from Cognito
TOKEN="your-jwt-token"

# Request pre-signed URL
curl -X POST https://your-api-gateway-url/profile/image/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "profile.jpg",
    "fileType": "image/jpeg",
    "fileSize": 1048576
  }'

# Upload image to S3 using pre-signed URL
curl -X PUT "pre-signed-url-from-response" \
  -H "Content-Type: image/jpeg" \
  --data-binary @profile.jpg
```

### Test with Postman

1. Create a POST request to `/profile/image/upload`
2. Add `Authorization: Bearer <token>` header
3. Set body to JSON:
   ```json
   {
     "fileName": "test.jpg",
     "fileType": "image/jpeg"
   }
   ```
4. Send request and copy the `presignedUrl` from response
5. Create a new PUT request to the pre-signed URL
6. Set body to binary and select your image file
7. Send request to upload

## Monitoring

View logs in CloudWatch:

```bash
aws logs tail /aws/lambda/polizalab-profile-image-upload --follow
```

## Security Considerations

1. **Authentication**: All requests require a valid JWT token
2. **File Type Validation**: Only JPEG, PNG, and WebP are allowed
3. **File Size Limit**: Maximum 2MB per file
4. **File Name Sanitization**: Special characters are replaced with underscores
5. **Pre-signed URL Expiration**: URLs expire after 5 minutes
6. **S3 Bucket Policy**: Ensure the bucket is not publicly accessible

## Troubleshooting

### Error: "Authentication token is required"
- Ensure the `Authorization` header is present
- Verify the JWT token is valid and not expired

### Error: "Invalid file type"
- Only JPEG, PNG, and WebP are supported
- Check the `fileType` field matches one of: `image/jpeg`, `image/png`, `image/webp`

### Error: "File size exceeds maximum"
- Maximum file size is 2MB
- Compress or resize the image before uploading

### Upload to S3 fails
- Verify the pre-signed URL hasn't expired (5 minutes)
- Ensure the `Content-Type` header matches the `fileType` from the request
- Check S3 bucket permissions
