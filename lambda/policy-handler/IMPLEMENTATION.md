# Policy Handler Lambda - Implementation Details

## Overview

The Policy Handler Lambda function manages all policy-related operations for PolizaLab MVP. It provides CRUD operations for policies, renewal tracking, and document upload URL generation.

## Architecture

### Request Routing

The handler uses a simple routing mechanism based on HTTP method and path:

```
GET /policies              → listPolicies()
GET /policies/renewals     → getUpcomingRenewals()
GET /policies/:id          → getPolicy()
PUT /policies/:id          → updatePolicy()
POST /policies/upload-url  → getDocumentUploadUrl()
```

### Authentication

The function extracts userId from the JWT token in two ways:

1. **Cognito Authorizer Context** (preferred):
   - API Gateway validates the token
   - Passes userId in `event.requestContext.authorizer.jwt.claims.sub`

2. **Authorization Header** (fallback):
   - Extracts token from `Authorization: Bearer <token>` header
   - Decodes JWT payload to get `sub` claim

### Authorization

All endpoints enforce user-specific data access:

- Policies are queried using `userId` from the JWT token
- GET/PUT operations verify `policy.userId === authenticatedUserId`
- Returns 403 Forbidden if user tries to access another user's policy

## Key Functions

### calculateRenewalDate()

Calculates the renewal date based on policy type and start date.

**Rules:**
- Auto, GMM, Hogar, Vida temporal: `fechaInicio + 12 months`
- Vida permanente: `null` (no renewal)
- Invalid inputs: `null`

**Implementation:**
```typescript
function calculateRenewalDate(tipoPoliza, fechaInicio) {
  if (!tipoPoliza || !fechaInicio) return null;
  if (tipoPoliza === 'Vida permanente') return null;
  
  const startDate = new Date(fechaInicio);
  const renewalDate = new Date(startDate);
  renewalDate.setMonth(renewalDate.getMonth() + 12);
  
  return renewalDate.toISOString().split('T')[0];
}
```

### calculateRenewalStatus()

Determines the urgency level of a policy renewal.

**Status Levels:**
- `OVERDUE`: Past due date
- `30_DAYS`: 0-30 days until renewal
- `60_DAYS`: 31-60 days until renewal
- `90_DAYS`: 61-90 days until renewal
- `NOT_URGENT`: More than 90 days or no renewal date

**Implementation:**
```typescript
function calculateRenewalStatus(fechaRenovacion) {
  if (!fechaRenovacion) return 'NOT_URGENT';
  
  const renewalDate = new Date(fechaRenovacion);
  const today = new Date();
  const daysUntilRenewal = Math.floor(
    (renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysUntilRenewal < 0) return 'OVERDUE';
  if (daysUntilRenewal <= 30) return '30_DAYS';
  if (daysUntilRenewal <= 60) return '60_DAYS';
  if (daysUntilRenewal <= 90) return '90_DAYS';
  return 'NOT_URGENT';
}
```

## Endpoint Details

### listPolicies()

**Query Pattern:**
- Uses `userId-index` GSI on DynamoDB
- Sorts by `createdAt` descending
- Limits to 10 most recent policies

**DynamoDB Query:**
```typescript
{
  TableName: 'Policies',
  IndexName: 'userId-index',
  KeyConditionExpression: 'userId = :userId',
  ScanIndexForward: false,  // DESC order
  Limit: 10
}
```

### getPolicy()

**Steps:**
1. Get policy by `policyId` (primary key)
2. Verify `policy.userId === authenticatedUserId`
3. Recalculate `renewalStatus` (ensures current status)
4. Return policy data

**Authorization Check:**
```typescript
if (policy.userId !== userId) {
  return 403 Forbidden
}
```

### updatePolicy()

**Steps:**
1. Get existing policy to verify ownership
2. Check authorization
3. Recalculate `fechaRenovacion` if `fechaInicio` or `tipoPoliza` changed
4. Build dynamic UpdateExpression for changed fields
5. Always update `updatedAt` timestamp
6. Return updated policy

**Allowed Fields:**
- clienteNombre
- clienteApellido
- edad
- tipoPoliza
- cobertura
- numeroPoliza
- aseguradora
- fechaInicio
- fechaFin

**Auto-calculated Fields:**
- fechaRenovacion (if fechaInicio or tipoPoliza changes)
- updatedAt (always)

### getUpcomingRenewals()

**Steps:**
1. Query all policies for user
2. Recalculate `renewalStatus` for each policy
3. Filter for urgent statuses: `30_DAYS`, `60_DAYS`, `90_DAYS`
4. Sort by `fechaRenovacion` ascending (earliest first)
5. Return filtered and sorted list

**Filtering Logic:**
```typescript
const urgentPolicies = policies.filter(p =>
  ['30_DAYS', '60_DAYS', '90_DAYS'].includes(p.renewalStatus)
);
```

### getDocumentUploadUrl()

**Steps:**
1. Validate `fileName` and `fileType` are provided
2. Generate unique S3 key: `policies/{userId}/{uuid}/{fileName}`
3. Create pre-signed URL with 5-minute expiration
4. Return both `presignedUrl` and `s3Key`

**S3 Key Structure:**
```
policies/
  {userId}/
    {uuid}/
      {fileName}
```

This structure:
- Isolates user data
- Prevents filename collisions
- Enables S3 event notifications by prefix

## Error Handling

### HTTP Status Codes

- **200**: Success
- **400**: Bad request (missing required fields)
- **401**: Unauthorized (no valid JWT token)
- **403**: Forbidden (accessing another user's data)
- **404**: Not found (policy doesn't exist)
- **500**: Internal server error (DynamoDB/S3 errors)

### Error Response Format

```json
{
  "error": "Error message",
  "message": "Detailed error (500 only)"
}
```

### Logging

All errors are logged to CloudWatch:
```typescript
console.error('Error:', error);
```

## Testing

### Test Coverage

- ✅ List policies (empty and with data)
- ✅ Get policy details
- ✅ Get policy - 404 not found
- ✅ Get policy - 403 forbidden (wrong user)
- ✅ Update policy fields
- ✅ Update policy - recalculate renewal date
- ✅ Update policy - 403 forbidden (wrong user)
- ✅ Get upcoming renewals (sorted)
- ✅ Get upcoming renewals (filtered)
- ✅ Generate upload URL
- ✅ Generate upload URL - 400 missing fields
- ✅ Renewal status calculation (30_DAYS, OVERDUE)
- ✅ Error handling (500, 404, 401)

### Running Tests

```bash
npm test
```

### Test Mocks

Uses `aws-sdk-client-mock` to mock AWS SDK calls:
- DynamoDB: QueryCommand, GetItemCommand, UpdateItemCommand
- S3: PutObjectCommand
- S3 Presigner: getSignedUrl

## Deployment

### Prerequisites

1. DynamoDB table `Policies` with:
   - Primary key: `policyId`
   - GSI: `userId-index` (userId + createdAt)

2. S3 bucket for document storage

3. IAM role with permissions:
   - DynamoDB: GetItem, Query, UpdateItem on Policies table
   - S3: PutObject on bucket
   - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

### Deployment Steps

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build TypeScript:
   ```bash
   npm run build
   ```

3. Create deployment package:
   ```bash
   bash deploy.sh
   ```

4. Upload to Lambda:
   ```bash
   aws lambda update-function-code \
     --function-name polizalab-policy-handler \
     --zip-file fileb://policy-handler.zip \
     --region us-east-1
   ```

### Environment Variables

Set in Lambda configuration:
```
DYNAMODB_POLICIES_TABLE=Policies
S3_BUCKET_NAME=polizalab-documents-dev
AWS_REGION=us-east-1
```

## Integration with API Gateway

### Routes

Configure these routes in API Gateway:

| Method | Route | Authorization |
|--------|-------|---------------|
| GET | /policies | JWT |
| GET | /policies/renewals | JWT |
| GET | /policies/{id} | JWT |
| PUT | /policies/{id} | JWT |
| POST | /policies/upload-url | JWT |

### Authorizer

Use Cognito JWT authorizer:
- Validates JWT token
- Passes userId in `requestContext.authorizer.jwt.claims.sub`

### CORS

Enable CORS in API Gateway or use Lambda response headers:
```typescript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
}
```

## Performance Considerations

### DynamoDB

- Uses GSI for efficient userId queries
- Limits queries to 10 items for list operations
- Single-item reads use primary key (fast)

### S3

- Pre-signed URLs enable direct client uploads
- No Lambda involvement in actual file upload
- 5-minute expiration prevents URL abuse

### Lambda

- Cold start: ~1-2 seconds
- Warm execution: ~100-300ms
- Memory: 256MB recommended
- Timeout: 30 seconds

## Security

### Authentication

- All endpoints require valid JWT token
- Token validation by API Gateway Cognito authorizer

### Authorization

- User can only access their own policies
- Verified by comparing `policy.userId` with `authenticatedUserId`

### Data Isolation

- DynamoDB queries filtered by userId
- S3 keys include userId prefix
- No cross-user data leakage

### Input Validation

- Required fields checked (fileName, fileType)
- Invalid policy IDs return 404
- Malformed tokens return 401

## Monitoring

### CloudWatch Logs

All Lambda invocations logged:
- Request event
- Errors with stack traces
- DynamoDB/S3 operations

### Metrics

Monitor these CloudWatch metrics:
- Invocations
- Errors
- Duration
- Throttles

### Alarms

Recommended alarms:
- Error rate > 5%
- Duration > 5 seconds
- Throttles > 0

## Future Enhancements

### Pagination

Currently limits to 10 policies. Add pagination:
```typescript
{
  policies: [...],
  nextToken: "..."
}
```

### Caching

Add caching for frequently accessed policies:
- ElastiCache
- API Gateway caching
- Lambda@Edge

### Batch Operations

Support bulk updates:
```
PUT /policies/batch
```

### Search

Add search by policy number or client name:
```
GET /policies/search?q=...
```

### Filtering

Add query parameters:
```
GET /policies?tipoPoliza=Auto&status=PROCESSED
```
