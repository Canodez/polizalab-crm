# Policy Handler Lambda

Lambda function for managing policy operations in PolizaLab MVP.

## Endpoints

### GET /policies
List user's policies (10 most recent, sorted by createdAt DESC).

**Authorization:** Required (JWT token)

**Response:**
```json
{
  "policies": [
    {
      "policyId": "uuid",
      "userId": "uuid",
      "clienteNombre": "string",
      "clienteApellido": "string",
      "tipoPoliza": "string",
      "aseguradora": "string",
      "createdAt": "ISO 8601"
    }
  ]
}
```

### GET /policies/:id
Get single policy details.

**Authorization:** Required (JWT token)

**Response:**
```json
{
  "policyId": "uuid",
  "userId": "uuid",
  "clienteNombre": "string",
  "clienteApellido": "string",
  "edad": 35,
  "tipoPoliza": "Auto",
  "cobertura": "string",
  "numeroPoliza": "string",
  "aseguradora": "string",
  "fechaInicio": "YYYY-MM-DD",
  "fechaFin": "YYYY-MM-DD",
  "fechaRenovacion": "YYYY-MM-DD",
  "renewalStatus": "30_DAYS",
  "s3Key": "string",
  "status": "PROCESSED",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**Errors:**
- 403: Policy belongs to another user
- 404: Policy not found

### PUT /policies/:id
Update policy fields.

**Authorization:** Required (JWT token)

**Request:**
```json
{
  "clienteNombre": "string",
  "clienteApellido": "string",
  "edad": 35,
  "tipoPoliza": "Auto",
  "cobertura": "string",
  "numeroPoliza": "string",
  "aseguradora": "string",
  "fechaInicio": "YYYY-MM-DD",
  "fechaFin": "YYYY-MM-DD"
}
```

**Response:**
```json
{
  "success": true,
  "policy": { /* updated policy object */ }
}
```

**Notes:**
- fechaRenovacion is automatically recalculated if fechaInicio or tipoPoliza changes
- updatedAt is automatically set to current timestamp

**Errors:**
- 403: Policy belongs to another user
- 404: Policy not found

### GET /policies/renewals
Get upcoming renewals (policies with renewalStatus of 30_DAYS, 60_DAYS, or 90_DAYS).

**Authorization:** Required (JWT token)

**Response:**
```json
{
  "renewals": [
    {
      "policyId": "uuid",
      "clienteNombre": "string",
      "clienteApellido": "string",
      "tipoPoliza": "string",
      "aseguradora": "string",
      "fechaRenovacion": "YYYY-MM-DD",
      "renewalStatus": "30_DAYS"
    }
  ]
}
```

**Notes:**
- Results are sorted by fechaRenovacion ascending (earliest first)
- Only includes policies with urgent renewal status

### POST /policies/upload-url
Generate pre-signed S3 URL for document upload.

**Authorization:** Required (JWT token)

**Request:**
```json
{
  "fileName": "policy.pdf",
  "fileType": "application/pdf"
}
```

**Response:**
```json
{
  "presignedUrl": "https://...",
  "s3Key": "policies/userId/uuid/policy.pdf"
}
```

**Notes:**
- Pre-signed URL expires in 5 minutes
- S3 key includes userId and UUID for uniqueness

## Renewal Status Calculation

The function calculates renewal status based on days until fechaRenovacion:

- **OVERDUE**: fechaRenovacion is in the past
- **30_DAYS**: 0-30 days until renewal
- **60_DAYS**: 31-60 days until renewal
- **90_DAYS**: 61-90 days until renewal
- **NOT_URGENT**: More than 90 days until renewal

## Renewal Date Calculation

For policy types Auto, GMM, Hogar, and Vida temporal:
- fechaRenovacion = fechaInicio + 12 months

For Vida permanente:
- fechaRenovacion = null (no renewal)

## Environment Variables

- `DYNAMODB_POLICIES_TABLE`: DynamoDB table name (default: "Policies")
- `S3_BUCKET_NAME`: S3 bucket name (default: "polizalab-documents-dev")
- `AWS_REGION`: AWS region (default: "us-east-1")

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

### Deploy
```bash
npm run deploy
```

## Testing

The function includes comprehensive unit tests covering:
- All endpoints (GET, PUT, POST)
- Authorization checks
- Renewal status calculation
- Renewal date calculation
- Error handling
- Edge cases

Run tests with:
```bash
npm test
```

## Authorization

All endpoints require a valid Cognito JWT token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

The function extracts the userId (sub claim) from the token and ensures users can only access their own policies.

## CORS

All responses include CORS headers:
```
Access-Control-Allow-Origin: *
```

For production, configure specific origins in API Gateway.
