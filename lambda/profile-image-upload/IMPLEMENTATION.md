# Profile Image Upload Lambda - Implementation Guide

## Overview

This Lambda function provides a secure way to upload profile images to S3 by generating pre-signed URLs. It validates authentication, file types, and file sizes before generating the upload URL.

## Architecture

```
Frontend → API Gateway → Lambda → S3 Pre-signed URL → Frontend → S3
```

1. Frontend requests a pre-signed URL from the Lambda
2. Lambda validates the request and generates a pre-signed URL
3. Frontend uploads the image directly to S3 using the pre-signed URL
4. Frontend updates the user profile with the S3 key

## Implementation Steps

### Step 1: Create S3 Bucket

```bash
# Create bucket
aws s3 mb s3://polizalab-profile-images --region us-east-1

# Block public access
aws s3api put-public-access-block \
  --bucket polizalab-profile-images \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable versioning (optional)
aws s3api put-bucket-versioning \
  --bucket polizalab-profile-images \
  --versioning-configuration Status=Enabled

# Configure CORS
aws s3api put-bucket-cors \
  --bucket polizalab-profile-images \
  --cors-configuration file://cors-config.json
```

Create `cors-config.json`:
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "https://d4srl7zbv9blh.cloudfront.net",
        "https://crm.antesdefirmar.org"
      ],
      "AllowedMethods": ["PUT", "POST", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

### Step 2: Create IAM Role

Create `lambda-execution-role-policy.json`:
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

Create the role:
```bash
# Create trust policy
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
  --role-name polizalab-profile-image-upload-role \
  --assume-role-policy-document file://trust-policy.json

# Attach policy
aws iam put-role-policy \
  --role-name polizalab-profile-image-upload-role \
  --policy-name ProfileImageUploadPolicy \
  --policy-document file://lambda-execution-role-policy.json
```

### Step 3: Deploy Lambda

Update the `ROLE_ARN` in `deploy.sh` or `deploy.ps1` with your role ARN, then run:

```bash
# Linux/Mac
./deploy.sh

# Windows
.\deploy.ps1
```

### Step 4: Configure API Gateway

#### Option A: Using AWS Console

1. Go to API Gateway console
2. Select your API (e.g., `polizalab-api`)
3. Create a new resource `/profile/image/upload`
4. Create a POST method
5. Set integration type to Lambda Function
6. Select `polizalab-profile-image-upload`
7. Enable Lambda Proxy Integration
8. Configure Cognito Authorizer
9. Enable CORS
10. Deploy to your stage

#### Option B: Using AWS CLI

```bash
# Get API ID
API_ID="your-api-id"
PARENT_RESOURCE_ID="your-parent-resource-id"

# Create resource
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $PARENT_RESOURCE_ID \
  --path-part "upload" \
  --query 'id' \
  --output text)

# Create POST method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --authorization-type COGNITO_USER_POOLS \
  --authorizer-id your-authorizer-id

# Set Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:ACCOUNT_ID:function:polizalab-profile-image-upload/invocations"

# Enable CORS
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE

# Deploy
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod
```

### Step 5: Grant API Gateway Permission

```bash
aws lambda add-permission \
  --function-name polizalab-profile-image-upload \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:ACCOUNT_ID:API_ID/*/POST/profile/image/upload"
```

## Frontend Integration

### 1. Request Pre-signed URL

```typescript
// lib/api-client.ts
export async function getProfileImageUploadUrl(
  fileName: string,
  fileType: string,
  fileSize: number
) {
  const response = await fetch(
    `${API_BASE_URL}/profile/image/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({
        fileName,
        fileType,
        fileSize,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get upload URL');
  }

  return response.json();
}
```

### 2. Upload Image to S3

```typescript
export async function uploadImageToS3(
  presignedUrl: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve(xhr.response);
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

### 3. Complete Upload Flow

```typescript
async function handleImageUpload(file: File) {
  try {
    // Validate file
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('File size must be less than 2MB');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only JPEG, PNG, and WebP images are allowed');
    }

    // Get pre-signed URL
    const { presignedUrl, s3Key } = await getProfileImageUploadUrl(
      file.name,
      file.type,
      file.size
    );

    // Upload to S3
    await uploadImageToS3(presignedUrl, file, (progress) => {
      console.log(`Upload progress: ${progress}%`);
    });

    // Update profile with S3 key
    await updateProfile({ profileImageUrl: s3Key });

    console.log('Image uploaded successfully!');
  } catch (error) {
    console.error('Upload failed:', error);
  }
}
```

## Testing

### Run Unit Tests

```bash
npm test
```

### Test with curl

```bash
# Get JWT token
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

# Upload to S3 (use presignedUrl from response)
curl -X PUT "presigned-url" \
  -H "Content-Type: image/jpeg" \
  --data-binary @profile.jpg
```

## Monitoring

### CloudWatch Logs

```bash
# View logs
aws logs tail /aws/lambda/polizalab-profile-image-upload --follow

# Filter errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/polizalab-profile-image-upload \
  --filter-pattern "ERROR"
```

### CloudWatch Metrics

Monitor these metrics:
- Invocations
- Errors
- Duration
- Throttles

### CloudWatch Alarms

```bash
# Create alarm for errors
aws cloudwatch put-metric-alarm \
  --alarm-name profile-image-upload-errors \
  --alarm-description "Alert on Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=polizalab-profile-image-upload \
  --evaluation-periods 1
```

## Security Best Practices

1. **Authentication**: Always validate JWT tokens
2. **File Type Validation**: Only allow image types
3. **File Size Limits**: Enforce maximum file size
4. **File Name Sanitization**: Prevent path traversal attacks
5. **Pre-signed URL Expiration**: Keep expiration time short (5 minutes)
6. **S3 Bucket Policy**: Ensure bucket is not publicly accessible
7. **CORS Configuration**: Only allow trusted origins
8. **Encryption**: Enable S3 encryption at rest
9. **Logging**: Enable CloudTrail and S3 access logs
10. **IAM Permissions**: Follow principle of least privilege

## Troubleshooting

### Issue: "Authentication token is required"
- Verify JWT token is valid
- Check Authorization header format
- Ensure Cognito authorizer is configured

### Issue: "Invalid file type"
- Only JPEG, PNG, and WebP are supported
- Check Content-Type header

### Issue: Upload to S3 fails
- Verify pre-signed URL hasn't expired
- Check Content-Type matches fileType
- Verify S3 bucket permissions

### Issue: CORS errors
- Verify S3 bucket CORS configuration
- Check API Gateway CORS settings
- Ensure origin is in allowed list

## Next Steps

1. Implement image resizing/optimization (Lambda or S3 trigger)
2. Add virus scanning (ClamAV Lambda)
3. Implement CDN for image delivery (CloudFront)
4. Add image moderation (AWS Rekognition)
5. Implement image deletion/cleanup
