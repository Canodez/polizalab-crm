# Requirements Document

## Introduction

This document specifies the requirements for fixing CloudFront routing and caching configuration for a Next.js static export deployment on AWS. The current deployment uses S3 + CloudFront with Origin Access Identity (OAI) but has routing issues where non-root paths serve incorrect content, and caching is configured inappropriately for static sites.

## Glossary

- **CloudFront**: AWS content delivery network (CDN) service
- **S3**: AWS Simple Storage Service for object storage
- **OAI**: Origin Access Identity - legacy method to restrict S3 bucket access to CloudFront
- **OAC**: Origin Access Control - modern replacement for OAI
- **Static_Export**: Next.js build mode that generates static HTML files
- **Viewer_Request_Function**: CloudFront Function that runs on viewer requests before cache lookup
- **Cache_Policy**: CloudFront configuration that defines caching behavior
- **TTL**: Time To Live - duration content is cached
- **Immutable_Asset**: Versioned file that never changes (e.g., /_next/static/*)
- **HTML_File**: Dynamic content file that should not be cached by CDN
- **Profile_Lambda**: AWS Lambda function handling /profile endpoint
- **DynamoDB**: AWS NoSQL database service

## Requirements

### Requirement 1: Static Route Resolution

**User Story:** As a user, I want to access any route in the application directly via URL, so that I can bookmark and share specific pages.

#### Acceptance Criteria

1. WHEN a user requests a path ending with "/" (e.g., /register/), THE CloudFront SHALL serve the corresponding index.html file from that directory
2. WHEN a user requests a path without trailing slash and without file extension (e.g., /register), THE CloudFront SHALL serve the corresponding index.html file from that directory
3. WHEN a user requests the root path "/", THE CloudFront SHALL serve /index.html
4. WHEN a user requests a path with a file extension (e.g., /favicon.ico), THE CloudFront SHALL serve that file directly without modification
5. THE Viewer_Request_Function SHALL perform URI rewriting before cache lookup to ensure correct file resolution

### Requirement 2: Error Response Cleanup

**User Story:** As a developer, I want real HTTP errors to be returned correctly, so that I can diagnose issues and understand when content is truly missing.

#### Acceptance Criteria

1. WHEN a requested file does not exist in S3, THE CloudFront SHALL return HTTP 404 status code
2. WHEN S3 returns a 403 error for missing files, THE CloudFront SHALL return HTTP 404 status code
3. THE CloudFront SHALL NOT use CustomErrorResponses to mask 404 errors as 200 responses
4. THE CloudFront SHALL NOT redirect all errors to /index.html (SPA-style behavior)

### Requirement 3: HTML Caching Strategy

**User Story:** As a developer, I want HTML files to never be cached by CloudFront, so that content updates are immediately visible to users after deployment.

#### Acceptance Criteria

1. WHEN uploading HTML files to S3, THE deployment process SHALL set Cache-Control header to "no-cache, max-age=0, must-revalidate"
2. THE CloudFront Cache_Policy for HTML files SHALL have MinTTL, DefaultTTL, and MaxTTL set to 0
3. WHEN CloudFront receives an HTML file request, THE CloudFront SHALL always forward the request to S3 origin
4. THE CloudFront SHALL respect Cache-Control headers from S3 for HTML files

### Requirement 4: Versioned Asset Caching

**User Story:** As a developer, I want versioned assets to be cached aggressively, so that the application loads quickly and reduces bandwidth costs.

#### Acceptance Criteria

1. WHEN uploading files matching pattern /_next/static/*, THE deployment process SHALL set Cache-Control header to "public, max-age=31536000, immutable"
2. THE CloudFront Cache_Policy for /_next/static/* SHALL have MaxTTL set to 31536000 seconds (1 year)
3. WHEN CloudFront receives a request for /_next/static/*, THE CloudFront SHALL cache the response for the maximum duration
4. THE CloudFront SHALL treat versioned assets as immutable and serve from cache without revalidation

### Requirement 5: CloudFront Function Implementation

**User Story:** As a system administrator, I want a CloudFront Function to handle URI rewriting, so that static routes resolve correctly without server-side logic.

#### Acceptance Criteria

1. THE Viewer_Request_Function SHALL be written in JavaScript compatible with CloudFront Functions runtime
2. WHEN the URI ends with "/", THE Viewer_Request_Function SHALL append "index.html" to the URI
3. WHEN the URI does not contain a "." character and does not end with "/", THE Viewer_Request_Function SHALL append "/index.html" to the URI
4. WHEN the URI contains a "." character, THE Viewer_Request_Function SHALL return the request unmodified
5. THE Viewer_Request_Function SHALL be associated with the CloudFront distribution's default cache behavior
6. THE Viewer_Request_Function SHALL execute on viewer-request event type

### Requirement 6: Cache Policy Configuration

**User Story:** As a system administrator, I want separate cache policies for different content types, so that caching behavior is optimized for each asset type.

#### Acceptance Criteria

1. THE CloudFront SHALL have a cache policy for HTML files with TTL values set to 0
2. THE CloudFront SHALL have a cache policy for versioned assets with MaxTTL set to 31536000
3. THE CloudFront SHALL use path pattern "/_next/static/*" to apply the versioned asset cache policy
4. THE CloudFront SHALL use the default cache behavior for HTML files with no-cache policy
5. WHERE AWS Managed Cache Policies are available, THE system SHALL use them instead of custom policies

### Requirement 7: Deployment Process Updates

**User Story:** As a developer, I want the deployment process to set correct cache headers, so that CloudFront caching works as intended.

#### Acceptance Criteria

1. WHEN deploying to S3, THE deployment script SHALL upload versioned assets with Cache-Control "public, max-age=31536000, immutable"
2. WHEN deploying to S3, THE deployment script SHALL upload HTML files with Cache-Control "no-cache, max-age=0, must-revalidate"
3. WHEN deploying to S3, THE deployment script SHALL upload JSON files with Cache-Control "no-cache, max-age=0, must-revalidate"
4. THE deployment script SHALL use AWS CLI v2 commands
5. THE deployment script SHALL be compatible with Windows cmd shell

### Requirement 8: Cache Invalidation

**User Story:** As a developer, I want to invalidate CloudFront cache after configuration changes, so that the new configuration takes effect immediately.

#### Acceptance Criteria

1. WHEN CloudFront configuration is updated, THE deployment process SHALL create a cache invalidation for "/*"
2. THE deployment process SHALL wait for invalidation to complete before reporting success
3. THE deployment process SHALL use AWS CLI to create invalidations
4. WHEN invalidation fails, THE deployment process SHALL report the error and exit with non-zero status

### Requirement 9: Profile Lambda Idempotent Upsert

**User Story:** As a user, I want the profile endpoint to work even if the initial profile creation failed, so that I can access my profile reliably.

#### Acceptance Criteria

1. WHEN the Profile_Lambda receives a GET request for a non-existent profile, THE Profile_Lambda SHALL create a default profile with user information from Cognito
2. WHEN creating a default profile, THE Profile_Lambda SHALL use DynamoDB PutItem with ConditionExpression attribute_not_exists(userId)
3. IF the profile already exists during creation attempt, THE Profile_Lambda SHALL ignore the ConditionalCheckFailedException and return the existing profile
4. THE Profile_Lambda SHALL extract user email and name from Cognito JWT token claims
5. WHEN profile creation succeeds, THE Profile_Lambda SHALL return HTTP 200 with the profile data

### Requirement 10: OAC Migration Documentation

**User Story:** As a system administrator, I want documentation for migrating from OAI to OAC, so that I can modernize the security configuration when ready.

#### Acceptance Criteria

1. THE documentation SHALL describe the differences between OAI and OAC
2. THE documentation SHALL provide step-by-step instructions for creating an OAC
3. THE documentation SHALL explain how to update S3 bucket policy for OAC
4. THE documentation SHALL describe how to update CloudFront distribution to use OAC
5. THE documentation SHALL note that OAI continues to work and migration is optional

## Notes

- This specification focuses on infrastructure configuration, not application code changes
- All AWS operations should use AWS CLI v2 for consistency
- The CloudFront Function code is provided and should be used as-is
- Profile Lambda changes are secondary priority and can be implemented after routing fixes
- OAC migration is optional and documented for future reference
