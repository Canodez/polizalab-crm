# AWS Infrastructure Setup Guide - PolizaLab MVP

This guide provides step-by-step instructions for setting up the AWS infrastructure for PolizaLab MVP using the AWS Console. Complete these steps in order to ensure proper configuration.

## Prerequisites

- AWS Account with administrative access
- AWS Region selected: **us-east-1** (or your preferred region)
- Basic understanding of AWS services

## Overview

The PolizaLab MVP infrastructure consists of:
- **Amazon Cognito** - User authentication
- **DynamoDB** - Data persistence (Users and Policies tables)
- **S3** - Document and image storage
- **API Gateway** - HTTP API with Cognito authorizer
- **Lambda** - Serverless functions (4 functions)
- **AWS Textract** - Document text extraction
- **IAM** - Roles and permissions

---

## 1. Create Amazon Cognito User Pool

### 1.1 Create User Pool

1. Navigate to **Amazon Cognito** in the AWS Console
2. Click **Create user pool**
3. **Configure sign-in experience:**
   - Provider types: **Cognito user pool**
   - Cognito user pool sign-in options: Check **Email**
   - Click **Next**

4. **Configure security requirements:**
   - Password policy: **Cognito defaults** (or customize as needed)
   - Multi-factor authentication: **No MFA** (for MVP simplicity)
   - User account recovery: **Enable self-service account recovery** - Email only
   - Click **Next**

5. **Configure sign-up experience:**
   - Self-registration: **Enable self-registration**
   - Attribute verification: **Send email message, verify email address**
   - Required attributes: **None** (we'll store additional data in DynamoDB)
   - Click **Next**

6. **Configure message delivery:**
   - Email provider: **Send email with Cognito** (for MVP; use SES for production)
   - Click **Next**

7. **Integrate your app:**
   - User pool name: `polizalab-users`
   - Hosted authentication pages: **Use the Cognito Hosted UI** (optional)
   - Initial app client:
     - App client name: `polizalab-web-client`
     - Client secret: **Don't generate a client secret** (for public web apps)
     - Authentication flows: Check **ALLOW_USER_PASSWORD_AUTH** and **ALLOW_REFRESH_TOKEN_AUTH**
   - Click **Next**

8. **Review and create:**
   - Review all settings
   - Click **Create user pool**

### 1.2 Note Important Values

After creation, note these values (you'll need them later):

```
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
COGNITO_REGION=us-east-1
```

Find these in:
- User Pool ID: User pool overview page
- App Client ID: App integration tab → App clients

---

## 2. Create DynamoDB Tables

### 2.1 Create Users Table

1. Navigate to **DynamoDB** in the AWS Console
2. Click **Create table**
3. **Table details:**
   - Table name: `Users`
   - Partition key: `userId` (String)
   - Sort key: Leave empty
4. **Table settings:**
   - Table class: **DynamoDB Standard**
   - Capacity mode: **On-demand** (for MVP; switch to provisioned for production)
5. Click **Create table**

### 2.2 Create Policies Table

1. Click **Create table**
2. **Table details:**
   - Table name: `Policies`
   - Partition key: `policyId` (String)
   - Sort key: Leave empty
3. **Table settings:**
   - Table class: **DynamoDB Standard**
   - Capacity mode: **On-demand**
4. Click **Create table**

### 2.3 Create Global Secondary Index on Policies Table

1. Navigate to the **Policies** table
2. Go to the **Indexes** tab
3. Click **Create index**
4. **Index details:**
   - Partition key: `userId` (String)
   - Sort key: `createdAt` (String)
   - Index name: `userId-index`
   - Attribute projections: **All**
5. Click **Create index**

Wait for the index to become **Active** before proceeding.

### 2.4 Note Table ARNs

Note these values:

```
DYNAMODB_USERS_TABLE=Users
DYNAMODB_POLICIES_TABLE=Policies
DYNAMODB_REGION=us-east-1
```

---

## 3. Create S3 Bucket

### 3.1 Create Bucket

1. Navigate to **Amazon S3** in the AWS Console
2. Click **Create bucket**
3. **General configuration:**
   - Bucket name: `polizalab-documents-dev` (must be globally unique)
   - AWS Region: **us-east-1** (or your chosen region)
4. **Object Ownership:**
   - ACLs disabled (recommended)
5. **Block Public Access settings:**
   - **Block all public access**: Checked (keep bucket private)
6. **Bucket Versioning:**
   - Disable (for MVP)
7. **Default encryption:**
   - Encryption type: **Server-side encryption with Amazon S3 managed keys (SSE-S3)**
8. Click **Create bucket**

### 3.2 Create Folder Structure

1. Open the bucket `polizalab-documents-dev`
2. Click **Create folder**
   - Folder name: `profiles/`
   - Click **Create folder**
3. Click **Create folder**
   - Folder name: `policies/`
   - Click **Create folder**

### 3.3 Configure CORS

1. Go to the **Permissions** tab
2. Scroll to **Cross-origin resource sharing (CORS)**
3. Click **Edit**
4. Add the following CORS configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

5. Click **Save changes**

**Note:** Update `AllowedOrigins` with your actual frontend domain when deploying to production.

### 3.4 Note Bucket Details

```
S3_BUCKET_NAME=polizalab-documents-dev
S3_REGION=us-east-1
```

---

## 4. Create IAM Roles for Lambda Functions

### 4.1 Create Lambda Execution Role for Auth and Profile Handlers

1. Navigate to **IAM** in the AWS Console
2. Go to **Roles** → Click **Create role**
3. **Select trusted entity:**
   - Trusted entity type: **AWS service**
   - Use case: **Lambda**
   - Click **Next**
4. **Add permissions:**
   - Search and select: `AWSLambdaBasicExecutionRole` (for CloudWatch Logs)
   - Click **Next**
5. **Name, review, and create:**
   - Role name: `PolizaLabAuthProfileLambdaRole`
   - Description: `Execution role for Auth and Profile Lambda functions`
   - Click **Create role**

6. **Add inline policy for DynamoDB and S3:**
   - Open the role `PolizaLabAuthProfileLambdaRole`
   - Go to **Permissions** tab → **Add permissions** → **Create inline policy**
   - Switch to **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/Users"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::polizalab-documents-dev/profiles/*"
    }
  ]
}
```

   - Replace `YOUR_ACCOUNT_ID` with your AWS account ID
   - Policy name: `DynamoDBAndS3Access`
   - Click **Create policy**

### 4.2 Create Lambda Execution Role for Policy Handler

1. Click **Create role**
2. **Select trusted entity:**
   - Trusted entity type: **AWS service**
   - Use case: **Lambda**
   - Click **Next**
3. **Add permissions:**
   - Search and select: `AWSLambdaBasicExecutionRole`
   - Click **Next**
4. **Name, review, and create:**
   - Role name: `PolizaLabPolicyLambdaRole`
   - Description: `Execution role for Policy Lambda function`
   - Click **Create role**

5. **Add inline policy for DynamoDB and S3:**
   - Open the role `PolizaLabPolicyLambdaRole`
   - Go to **Permissions** tab → **Add permissions** → **Create inline policy**
   - Switch to **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/Policies",
        "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/Policies/index/userId-index"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::polizalab-documents-dev/policies/*"
    }
  ]
}
```

   - Replace `YOUR_ACCOUNT_ID` with your AWS account ID
   - Policy name: `DynamoDBAndS3Access`
   - Click **Create policy**

### 4.3 Create Lambda Execution Role for Document Processor

1. Click **Create role**
2. **Select trusted entity:**
   - Trusted entity type: **AWS service**
   - Use case: **Lambda**
   - Click **Next**
3. **Add permissions:**
   - Search and select: `AWSLambdaBasicExecutionRole`
   - Click **Next**
4. **Name, review, and create:**
   - Role name: `PolizaLabDocProcessorLambdaRole`
   - Description: `Execution role for Document Processor Lambda function`
   - Click **Create role**

5. **Add inline policy for DynamoDB, S3, and Textract:**
   - Open the role `PolizaLabDocProcessorLambdaRole`
   - Go to **Permissions** tab → **Add permissions** → **Create inline policy**
   - Switch to **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/Policies"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::polizalab-documents-dev/policies/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeDocument"
      ],
      "Resource": "*"
    }
  ]
}
```

   - Replace `YOUR_ACCOUNT_ID` with your AWS account ID
   - Policy name: `DynamoDBTextractS3Access`
   - Click **Create policy**

### 4.4 Note Role ARNs

```
AUTH_PROFILE_LAMBDA_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/PolizaLabAuthProfileLambdaRole
POLICY_LAMBDA_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/PolizaLabPolicyLambdaRole
DOC_PROCESSOR_LAMBDA_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/PolizaLabDocProcessorLambdaRole
```

---

## 5. Create Lambda Functions

### 5.1 Create Auth Handler Lambda

1. Navigate to **AWS Lambda** in the AWS Console
2. Click **Create function**
3. **Basic information:**
   - Function name: `polizalab-auth-handler`
   - Runtime: **Node.js 18.x**
   - Architecture: **x86_64**
4. **Permissions:**
   - Execution role: **Use an existing role**
   - Existing role: `PolizaLabAuthProfileLambdaRole`
5. Click **Create function**

6. **Configure environment variables:**
   - Go to **Configuration** tab → **Environment variables** → **Edit**
   - Add:
     - `DYNAMODB_USERS_TABLE` = `Users`
     - `AWS_REGION_CUSTOM` = `us-east-1`
   - Click **Save**

7. **Note:** You'll deploy the actual function code later from your development environment.

### 5.2 Create Profile Handler Lambda

1. Click **Create function**
2. **Basic information:**
   - Function name: `polizalab-profile-handler`
   - Runtime: **Node.js 18.x**
   - Architecture: **x86_64**
3. **Permissions:**
   - Execution role: **Use an existing role**
   - Existing role: `PolizaLabAuthProfileLambdaRole`
4. Click **Create function**

5. **Configure environment variables:**
   - Go to **Configuration** tab → **Environment variables** → **Edit**
   - Add:
     - `DYNAMODB_USERS_TABLE` = `Users`
     - `S3_BUCKET_NAME` = `polizalab-documents-dev`
     - `AWS_REGION_CUSTOM` = `us-east-1`
   - Click **Save**

### 5.3 Create Policy Handler Lambda

1. Click **Create function**
2. **Basic information:**
   - Function name: `polizalab-policy-handler`
   - Runtime: **Node.js 18.x**
   - Architecture: **x86_64**
3. **Permissions:**
   - Execution role: **Use an existing role**
   - Existing role: `PolizaLabPolicyLambdaRole`
4. Click **Create function**

5. **Configure environment variables:**
   - Go to **Configuration** tab → **Environment variables** → **Edit**
   - Add:
     - `DYNAMODB_POLICIES_TABLE` = `Policies`
     - `S3_BUCKET_NAME` = `polizalab-documents-dev`
     - `AWS_REGION_CUSTOM` = `us-east-1`
   - Click **Save**

### 5.4 Create Document Processor Lambda

1. Click **Create function**
2. **Basic information:**
   - Function name: `polizalab-document-processor`
   - Runtime: **Node.js 18.x**
   - Architecture: **x86_64**
3. **Permissions:**
   - Execution role: **Use an existing role**
   - Existing role: `PolizaLabDocProcessorLambdaRole`
4. Click **Create function**

5. **Configure environment variables:**
   - Go to **Configuration** tab → **Environment variables** → **Edit**
   - Add:
     - `DYNAMODB_POLICIES_TABLE` = `Policies`
     - `S3_BUCKET_NAME` = `polizalab-documents-dev`
     - `AWS_REGION_CUSTOM` = `us-east-1`
   - Click **Save**

6. **Increase timeout (Textract can take time):**
   - Go to **Configuration** tab → **General configuration** → **Edit**
   - Timeout: **30 seconds** (or higher if needed)
   - Memory: **512 MB** (or higher for large documents)
   - Click **Save**

### 5.5 Note Lambda Function ARNs

```
AUTH_LAMBDA_ARN=arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:polizalab-auth-handler
PROFILE_LAMBDA_ARN=arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:polizalab-profile-handler
POLICY_LAMBDA_ARN=arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:polizalab-policy-handler
DOC_PROCESSOR_LAMBDA_ARN=arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:polizalab-document-processor
```

---

## 6. Configure S3 Event Notification for Lambda Trigger

### 6.1 Add S3 Trigger to Document Processor Lambda

1. Navigate to **Lambda** → `polizalab-document-processor`
2. Go to **Configuration** tab → **Triggers** → **Add trigger**
3. **Trigger configuration:**
   - Source: **S3**
   - Bucket: `polizalab-documents-dev`
   - Event type: **All object create events** (or specifically **PUT**)
   - Prefix: `policies/`
   - Suffix: Leave empty (to process all file types)
4. **Acknowledge:** Check the box acknowledging recursive invocation risk
5. Click **Add**

### 6.2 Verify S3 Event Configuration

1. Navigate to **S3** → `polizalab-documents-dev`
2. Go to **Properties** tab
3. Scroll to **Event notifications**
4. Verify that an event notification is configured for `policies/` prefix pointing to the Lambda function

---

## 7. Create API Gateway HTTP API

### 7.1 Create HTTP API

1. Navigate to **API Gateway** in the AWS Console
2. Click **Create API**
3. Select **HTTP API** → Click **Build**
4. **Create and configure integrations:**
   - API name: `polizalab-api`
   - Skip integrations for now (we'll add them next)
   - Click **Next**

5. **Configure routes:**
   - Skip for now (we'll add routes after creating integrations)
   - Click **Next**

6. **Define stages:**
   - Stage name: `dev` (auto-deploy enabled)
   - Click **Next**

7. **Review and create:**
   - Click **Create**

### 7.2 Create Cognito Authorizer

1. Open the API `polizalab-api`
2. Go to **Authorization** in the left menu
3. Click **Create and attach an authorizer**
4. **Authorizer settings:**
   - Authorizer type: **JWT**
   - Name: `cognito-authorizer`
   - Identity source: `$request.header.Authorization`
   - Issuer URL: `https://cognito-idp.us-east-1.amazonaws.com/YOUR_USER_POOL_ID`
     - Replace `YOUR_USER_POOL_ID` with your Cognito User Pool ID
   - Audience: `YOUR_COGNITO_CLIENT_ID`
     - Replace with your Cognito App Client ID
5. Click **Create**

### 7.3 Create Lambda Integrations

1. Go to **Integrations** in the left menu
2. Click **Create**

**Integration 1: Auth Handler**
- Integration type: **Lambda function**
- Integration target: `polizalab-auth-handler`
- Integration name: `auth-integration`
- Click **Create**

**Integration 2: Profile Handler**
- Integration type: **Lambda function**
- Integration target: `polizalab-profile-handler`
- Integration name: `profile-integration`
- Click **Create**

**Integration 3: Policy Handler**
- Integration type: **Lambda function**
- Integration target: `polizalab-policy-handler`
- Integration name: `policy-integration`
- Click **Create**

### 7.4 Create Routes

1. Go to **Routes** in the left menu
2. Click **Create** for each route below:

**Auth Routes:**
- Method: `POST`, Path: `/auth/register`
  - Integration: `auth-integration`
  - Authorization: **None** (public endpoint)

**Profile Routes:**
- Method: `GET`, Path: `/profile`
  - Integration: `profile-integration`
  - Authorization: `cognito-authorizer`

- Method: `PUT`, Path: `/profile`
  - Integration: `profile-integration`
  - Authorization: `cognito-authorizer`

- Method: `POST`, Path: `/profile/image`
  - Integration: `profile-integration`
  - Authorization: `cognito-authorizer`

**Policy Routes:**
- Method: `GET`, Path: `/policies`
  - Integration: `policy-integration`
  - Authorization: `cognito-authorizer`

- Method: `GET`, Path: `/policies/{id}`
  - Integration: `policy-integration`
  - Authorization: `cognito-authorizer`

- Method: `PUT`, Path: `/policies/{id}`
  - Integration: `policy-integration`
  - Authorization: `cognito-authorizer`

- Method: `POST`, Path: `/policies/upload-url`
  - Integration: `policy-integration`
  - Authorization: `cognito-authorizer`

- Method: `GET`, Path: `/policies/renewals`
  - Integration: `policy-integration`
  - Authorization: `cognito-authorizer`

### 7.5 Configure CORS

1. Go to **CORS** in the left menu
2. Click **Configure**
3. **CORS configuration:**
   - Access-Control-Allow-Origin: `http://localhost:3000` (add production domain later)
   - Access-Control-Allow-Headers: `Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token`
   - Access-Control-Allow-Methods: `GET,POST,PUT,DELETE,OPTIONS`
   - Access-Control-Max-Age: `300`
4. Click **Save**

### 7.6 Note API Gateway Endpoint

```
API_GATEWAY_ENDPOINT=https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev
```

Find this in the **Stages** section → `dev` stage → **Invoke URL**

---

## 8. Environment Variables Summary

Create a `.env.local` file in your Next.js project with these values:

```bash
# Cognito Configuration
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_COGNITO_REGION=us-east-1

# API Gateway
NEXT_PUBLIC_API_GATEWAY_ENDPOINT=https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev

# S3 Configuration
NEXT_PUBLIC_S3_BUCKET_NAME=polizalab-documents-dev
NEXT_PUBLIC_S3_REGION=us-east-1

# AWS Region
NEXT_PUBLIC_AWS_REGION=us-east-1
```

**For Lambda Functions** (already configured in Lambda environment variables):
```bash
DYNAMODB_USERS_TABLE=Users
DYNAMODB_POLICIES_TABLE=Policies
S3_BUCKET_NAME=polizalab-documents-dev
AWS_REGION_CUSTOM=us-east-1
```

---

## 9. Verification Checklist

Before proceeding with development, verify:

- [ ] Cognito User Pool created with email authentication
- [ ] Cognito App Client created without client secret
- [ ] DynamoDB Users table created
- [ ] DynamoDB Policies table created with userId-index GSI
- [ ] S3 bucket created with profiles/ and policies/ folders
- [ ] S3 CORS configured for frontend domain
- [ ] IAM roles created for all Lambda functions
- [ ] All 4 Lambda functions created with correct roles
- [ ] Lambda environment variables configured
- [ ] S3 event notification configured for Document Processor Lambda
- [ ] API Gateway HTTP API created
- [ ] Cognito authorizer configured in API Gateway
- [ ] All API routes created with correct integrations and authorization
- [ ] API Gateway CORS configured
- [ ] All ARNs and IDs noted in environment variables

---

## 10. Testing the Setup

### 10.1 Test Cognito User Pool

1. Navigate to Cognito User Pool
2. Go to **Users** tab
3. Click **Create user** (manual test user)
4. Verify you can create a user successfully

### 10.2 Test DynamoDB Tables

1. Navigate to DynamoDB
2. Open **Users** table → **Explore table items**
3. Click **Create item** and add a test record
4. Verify the item is created successfully
5. Repeat for **Policies** table

### 10.3 Test S3 Bucket

1. Navigate to S3 bucket
2. Upload a test file to `policies/` folder
3. Verify the file appears in the bucket
4. Check Lambda CloudWatch Logs to see if Document Processor was triggered

### 10.4 Test API Gateway

1. Use a tool like Postman or curl
2. Test the public endpoint: `POST /auth/register`
3. For protected endpoints, you'll need a valid JWT token from Cognito

---

## 11. Next Steps

1. **Deploy Lambda Function Code:**
   - Implement Lambda function handlers in TypeScript
   - Build and package the code
   - Deploy using AWS CLI or AWS SAM

2. **Develop Frontend:**
   - Set up Next.js project with environment variables
   - Implement authentication using AWS Amplify or AWS SDK
   - Build UI components for policy management

3. **Test End-to-End:**
   - Register a user through the frontend
   - Upload a policy document
   - Verify Textract processing
   - Test policy listing and editing

4. **Monitor and Debug:**
   - Check CloudWatch Logs for Lambda function errors
   - Monitor DynamoDB metrics
   - Review S3 access logs if needed

---

## 12. Troubleshooting

### Common Issues

**Issue: Lambda function not triggered by S3 upload**
- Verify S3 event notification is configured correctly
- Check Lambda function has permission to be invoked by S3
- Verify the prefix matches your upload path

**Issue: API Gateway returns 401 Unauthorized**
- Verify JWT token is valid and not expired
- Check Cognito authorizer configuration (issuer URL and audience)
- Ensure Authorization header is formatted correctly: `Bearer <token>`

**Issue: Lambda function timeout**
- Increase timeout in Lambda configuration
- Check CloudWatch Logs for specific errors
- Verify IAM role has necessary permissions

**Issue: CORS errors in browser**
- Verify CORS configuration in API Gateway
- Ensure S3 bucket CORS allows your frontend domain
- Check that preflight OPTIONS requests are handled

**Issue: DynamoDB access denied**
- Verify IAM role has correct permissions
- Check table names match environment variables
- Ensure GSI is active before querying

---

## 13. Security Best Practices

1. **Never commit AWS credentials to version control**
2. **Use environment variables for all sensitive configuration**
3. **Enable CloudTrail for audit logging**
4. **Regularly rotate IAM access keys**
5. **Use least-privilege IAM policies**
6. **Enable S3 bucket encryption**
7. **Monitor CloudWatch Logs for suspicious activity**
8. **Set up billing alerts to avoid unexpected charges**

---

## 14. Cost Optimization Tips

1. **Use DynamoDB On-Demand for MVP** (switch to provisioned capacity in production)
2. **Set S3 lifecycle policies** to archive old documents
3. **Monitor Lambda invocations** and optimize cold starts
4. **Use CloudWatch Logs Insights** instead of exporting logs
5. **Delete unused resources** during development

---

## Conclusion

Your AWS infrastructure is now ready for PolizaLab MVP development. Proceed with implementing the Lambda function code and frontend application. Refer to the design document for detailed implementation guidance.

For questions or issues, consult the AWS documentation or reach out to your team.
