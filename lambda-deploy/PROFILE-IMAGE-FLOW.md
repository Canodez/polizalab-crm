# Profile Image Upload Flow - Documentation

## Overview

This document describes the end-to-end flow for profile image uploads in PolizaLab CRM, including how images are stored, retrieved, and displayed.

## Architecture

- **Storage**: AWS S3 bucket `polizalab-documents-dev` (private, BucketOwnerEnforced)
- **Metadata**: DynamoDB table `Users` 
- **Access**: Presigned URLs (PUT for upload, GET for display)
- **Security**: Private bucket, short-lived URLs (5 minutes)

## Flow Diagram

```
User selects image
    ↓
Frontend calls POST /profile/image
    ↓
Lambda generates presigned PUT URL
Lambda saves metadata to DynamoDB:
  - profileImageKey (S3 key)
  - profileImageUpdatedAt (timestamp)
  - profileImageContentType
  - profileImageFileName
    ↓
Frontend uploads to S3 via presigned URL
    ↓
Frontend calls GET /profile
    ↓
Lambda reads DynamoDB
Lambda generates presigned GET URL
    ↓
Frontend displays image
```

## DynamoDB Schema Changes

### New Attributes on Users Table

| Attribute | Type | Description |
|-----------|------|-------------|
| `profileImageKey` | String | S3 object key (e.g., `profiles/{userId}/{uuid}.png`) |
| `profileImageUpdatedAt` | Number | Unix timestamp (seconds) when image was last updated |
| `profileImageContentType` | String | MIME type (e.g., `image/jpeg`) |
| `profileImageFileName` | String | Original filename uploaded by user |

**Note**: No schema migration needed - attributes are added on first upload.

## API Endpoints

### POST /profile/image

**Purpose**: Generate presigned PUT URL and persist metadata

**Request Body**:
```json
{
  "fileName": "avatar.png",
  "contentType": "image/png"
}
```

**Response**:
```json
{
  "presignedUrl": "https://polizalab-documents-dev.s3.amazonaws.com/...",
  "s3Key": "profiles/{userId}/{uuid}.png",
  "expiresIn": 300
}
```

**Backend Logic**:
1. Validate `fileName` and `contentType` are present
2. Validate `contentType` starts with `image/`
3. Validate `contentType` is in allowed list (JPEG, PNG, WebP)
4. Generate unique S3 key: `profiles/{userId}/{uuid}.{ext}`
5. Generate presigned PUT URL with matching ContentType
6. Save metadata to DynamoDB
7. Return presigned URL and key

### GET /profile

**Purpose**: Retrieve user profile with image URL

**Response**:
```json
{
  "userId": "...",
  "email": "user@example.com",
  "nombre": "John",
  "apellido": "Doe",
  "profileImageKey": "profiles/{userId}/{uuid}.png",
  "profileImageUrl": "https://polizalab-documents-dev.s3.amazonaws.com/...",
  "profileImageUrlExpiresIn": 300,
  "profileImageUpdatedAt": 1708560000,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Backend Logic**:
1. Read user item from DynamoDB
2. If `profileImageKey` exists:
   - Generate presigned GET URL (5 min expiry)
   - Add `profileImageUrl` and `profileImageUrlExpiresIn` to response
3. If key missing, set `profileImageUrl` to `null`

### PUT /profile

**Purpose**: Update profile fields (PATCH semantics)

**Request Body**:
```json
{
  "nombre": "John",
  "apellido": "Doe",
  "profileImageKey": "profiles/{userId}/{uuid}.png"  // optional
}
```

**Backend Logic**:
1. Accept any combination of: `nombre`, `apellido`, `profileImageKey`
2. Update only provided fields
3. If `profileImageKey` provided, also set `profileImageUpdatedAt`
4. Return updated profile (calls `handle_get_profile`)

## Frontend Implementation

### Upload Flow

```typescript
// 1. User selects image
const file = acceptedFiles[0];

// 2. Get presigned URL (backend saves metadata automatically)
const { presignedUrl } = await profileApi.getImageUploadUrl(
  file.name,
  file.type  // contentType
);

// 3. Upload to S3
const xhr = new XMLHttpRequest();
xhr.open('PUT', presignedUrl);
xhr.setRequestHeader('Content-Type', file.type);  // MUST match
xhr.send(file);

// 4. Reload profile to get new image URL
await loadProfile();
```

### Display Logic

```tsx
// profileImageUrl is a presigned GET URL, valid for 5 minutes
<img 
  src={profile.profileImageUrl} 
  alt="Profile" 
/>
```

## Security Best Practices

1. **Private Bucket**: S3 bucket is private, no public access
2. **Short-lived URLs**: Presigned URLs expire in 5 minutes
3. **Content-Type Validation**: Only `image/*` types allowed
4. **Unique Keys**: UUID prevents cache collisions and overwrites
5. **No ACLs**: Bucket uses `BucketOwnerEnforced` ownership
6. **Authentication Required**: All endpoints require valid JWT token

## Troubleshooting

### Image doesn't display after upload

**Check**:
1. S3 object exists: `aws s3 ls s3://polizalab-documents-dev/profiles/{userId}/`
2. DynamoDB has `profileImageKey`: Check Users table item
3. Presigned GET URL is generated: Check Lambda logs
4. Frontend receives `profileImageUrl`: Check network tab

**Common causes**:
- Upload failed silently (check XHR status)
- Metadata not saved to DynamoDB (check Lambda logs)
- Presigned URL expired (refresh profile)

### CORS errors on upload

**Check**:
1. S3 bucket CORS configuration includes origin
2. Content-Type header matches presigned URL
3. Request includes Origin header (browser adds automatically)

**Fix**:
```bash
aws s3api put-bucket-cors \
  --bucket polizalab-documents-dev \
  --cors-configuration file://deployment/s3-profile-images-cors.json
```

### 403 Access Denied on upload

**Causes**:
- Presigned URL expired (5 min limit)
- Content-Type mismatch between presigned URL and PUT request
- Bucket policy blocking access

**Fix**: Generate new presigned URL and retry

### Image shows old version after update

**Causes**:
- Browser cache
- Presigned URL still points to old object

**Fix**: 
- Backend generates new UUID for each upload (prevents cache)
- Frontend reloads profile after upload (gets new presigned URL)

## CloudWatch Logs

**Key log messages**:
```
Image metadata saved for user {userId}: {s3Key}
Generated presigned GET URL for user {userId}
Profile updated for user {userId}: ['profileImageKey']
```

**Error patterns**:
```
Error generating presigned URL: ...
Error saving image metadata: ...
Error in handle_image_upload: ...
```

## Testing Checklist

- [ ] Upload image → S3 object exists at expected key
- [ ] Users item has `profileImageKey` set
- [ ] GET /profile returns `profileImageUrl`
- [ ] Image renders in UI immediately
- [ ] Replace image → new UUID generated, UI shows new image
- [ ] No stale cache issues
- [ ] CORS works from all origins (localhost, CloudFront, custom domain)
- [ ] Error handling works (invalid file type, expired URL, etc.)

## Performance Considerations

- **Presigned URL expiry**: 5 minutes balances security and UX
- **Image size limit**: 2MB enforced by frontend (dropzone)
- **S3 key format**: UUID prevents collisions, enables parallel uploads
- **DynamoDB updates**: Atomic, no race conditions

## Future Enhancements

- [ ] Image optimization (resize, compress) via Lambda trigger
- [ ] CloudFront distribution for faster image delivery
- [ ] Multiple image sizes (thumbnail, medium, large)
- [ ] Image deletion when user uploads new one
- [ ] Audit trail for image changes
