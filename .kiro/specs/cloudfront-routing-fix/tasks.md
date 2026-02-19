# Implementation Plan: CloudFront Routing and Caching Fix

## Overview

This implementation plan addresses routing and caching issues in the Next.js static export deployment on AWS. The approach involves:

1. Creating and deploying a CloudFront Function for URI rewriting
2. Configuring cache policies for HTML files and versioned assets
3. Updating the CloudFront distribution configuration
4. Updating deployment scripts with correct Cache-Control headers
5. Enhancing the Profile Lambda with idempotent upsert logic
6. Creating documentation for optional OAC migration

The implementation uses AWS CLI v2 for all infrastructure changes and is designed to work on Windows.

## Tasks

- [x] 1. Create CloudFront Function for URI rewriting
  - Create `cloudfront-function/uri-rewrite.js` with the URI rewriting logic
  - Function should handle three cases: trailing slash, no extension, and with extension
  - _Requirements: 1.1, 1.2, 1.4, 5.2, 5.3, 5.4_

- [ ]* 1.1 Write unit tests for CloudFront Function
  - Test root path, trailing slash, no extension, and with extension cases
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ]* 1.2 Write property test for URI rewriting correctness
  - **Property 1: URI Rewriting Correctness**
  - **Validates: Requirements 1.1, 1.2, 1.4**

- [x] 2. Create cache policy configuration files
  - [x] 2.1 Create `cloudfront-config/cache-policy-html.json` for HTML files (TTL=0)
    - Set MinTTL, DefaultTTL, and MaxTTL to 0
    - Enable gzip and brotli compression
    - _Requirements: 3.2, 6.1_
  
  - [x] 2.2 Create `cloudfront-config/cache-policy-assets.json` for versioned assets (TTL=31536000)
    - Set MaxTTL to 31536000 (1 year)
    - Enable gzip and brotli compression
    - _Requirements: 4.2, 6.2_

- [x] 3. Create deployment script for CloudFront Function
  - Create `scripts/deploy-cloudfront-function.ps1` (PowerShell for Windows)
  - Script should create function, publish it, and output the function ARN
  - Handle errors and provide clear output messages
  - _Requirements: 5.1, 5.5, 5.6_

- [x] 4. Create deployment script for cache policies
  - Create `scripts/deploy-cache-policies.ps1` (PowerShell for Windows)
  - Script should create both cache policies and output their IDs
  - Handle errors if policies already exist
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 5. Update CloudFront distribution configuration
  - [x] 5.1 Create script to backup current distribution config
    - Save current config to `cloudfront-config/distribution-backup.json`
    - _Requirements: N/A (safety measure)_
  
  - [x] 5.2 Create script to update distribution configuration
    - Remove CustomErrorResponses (SPA-style error handling)
    - Add CloudFront Function association to DefaultCacheBehavior
    - Add cache behavior for `/_next/static/*` path pattern
    - Update cache policy references
    - Create `scripts/update-cloudfront-distribution.ps1`
    - _Requirements: 2.3, 2.4, 5.5, 5.6, 6.3, 6.4_

- [x] 6. Checkpoint - Verify CloudFront configuration
  - Ensure all configuration changes applied successfully
  - Run verification script to check function association and cache policies
  - Ask the user if questions arise

- [x] 7. Update deployment script with correct Cache-Control headers
  - [x] 7.1 Update or create `scripts/deploy-to-s3.ps1`
    - First sync: Upload versioned assets with `Cache-Control: public, max-age=31536000, immutable`
    - Second sync: Upload HTML and JSON files with `Cache-Control: no-cache, max-age=0, must-revalidate`
    - Use `--exclude` and `--include` patterns correctly
    - _Requirements: 3.1, 4.1, 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 7.2 Add cache invalidation to deployment script
    - Create invalidation for `/*` after upload
    - Wait for invalidation to complete
    - Handle errors and exit with non-zero status on failure
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ]* 7.3 Write property test for Cache-Control headers
  - **Property 2: HTML and JSON Cache-Control Headers**
  - **Property 3: Versioned Assets Cache-Control Headers**
  - **Validates: Requirements 3.1, 4.1, 7.3**

- [ ]* 7.4 Create verification script for deployment
  - Script to verify all S3 objects have correct Cache-Control headers
  - Check HTML/JSON files have no-cache headers
  - Check /_next/static/* files have immutable headers
  - _Requirements: 3.1, 4.1_

- [x] 8. Enhance Profile Lambda with idempotent upsert
  - [x] 8.1 Update `lambda-deploy/profile_handler.py` with idempotent GET logic
    - Add logic to create default profile if not found
    - Use DynamoDB PutItem with ConditionExpression attribute_not_exists(userId)
    - Handle ConditionalCheckFailedException gracefully
    - Extract email and name from Cognito JWT claims
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 8.2 Create deployment script for Profile Lambda
    - Create `scripts/deploy-profile-lambda.ps1`
    - Package lambda code and dependencies
    - Update Lambda function code
    - Wait for update to complete
    - _Requirements: 9.1_

- [x] 8.3 Write unit tests for Profile Lambda
  - Test GET existing profile
  - Test GET non-existent profile creates default
  - Test error handling scenarios
  - _Requirements: 9.1, 9.4, 9.5_

- [x] 8.4 Write property test for Profile Lambda idempotent upsert
  - **Property 4: Profile Lambda Idempotent Upsert**
  - **Validates: Requirements 9.1, 9.3**

- [x] 8.5 Write property test for Profile Lambda token extraction
  - **Property 5: Profile Lambda Token Extraction**
  - **Validates: Requirements 9.4**

- [x] 9. Create master deployment script
  - Create `scripts/deploy-all.ps1` that orchestrates all deployment steps
  - Execute in correct order: Function → Policies → Distribution → S3 → Lambda
  - Provide clear progress messages
  - Handle errors at each step
  - _Requirements: All_

- [x] 10. Checkpoint - Test deployment in staging/production
  - Run master deployment script
  - Verify all resources created/updated successfully
  - Ask the user if questions arise

- [x] 11. Create integration and end-to-end tests
  - [x]* 11.1 Create CloudFront configuration verification script
    - Verify no CustomErrorResponses
    - Verify CloudFront Function association
    - Verify cache behavior for /_next/static/*
    - Create `test/verify-cloudfront-config.sh`
    - _Requirements: 2.3, 5.5, 6.3_
  
  - [x]* 11.2 Create end-to-end routing test script
    - Test root path returns 200
    - Test /register and /register/ return 200
    - Test non-existent path returns 404
    - Verify /register serves correct content (not home page)
    - Create `test/e2e-routing-test.sh`
    - _Requirements: 1.1, 1.2, 2.1_

- [x] 12. Create OAC migration documentation
  - Create `docs/OAC-MIGRATION.md` with step-by-step guide
  - Explain differences between OAI and OAC
  - Provide AWS CLI commands for migration
  - Include rollback instructions
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 13. Create rollback documentation
  - Create `docs/ROLLBACK.md` with rollback procedures
  - Document how to revert each change
  - Include commands to restore previous state
  - _Requirements: N/A (operational safety)_

- [x] 14. Final checkpoint - Verify complete solution
  - Run all verification scripts
  - Test all routes in production
  - Verify Cache-Control headers in browser DevTools
  - Test profile creation for new user
  - Monitor CloudWatch Logs for errors
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- All scripts should be PowerShell for Windows compatibility
- AWS CLI v2 must be installed and configured
- Distribution ID: E1WB95BQGR0YAT
- S3 Bucket: polizalab-crm-frontend
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end behavior in deployed environment

## Execution Order

1. CloudFront Function (tasks 1-3)
2. Cache Policies (task 4)
3. Distribution Update (task 5)
4. Deployment Scripts (task 7)
5. Profile Lambda (task 8)
6. Master Deployment (task 9)
7. Testing and Verification (tasks 10-11)
8. Documentation (tasks 12-13)
9. Final Validation (task 14)

## Success Criteria

- All routes (/, /register, /login, /profile) serve correct content
- HTML files have Cache-Control: no-cache headers
- /_next/static/* assets have Cache-Control: immutable headers with 1-year max-age
- Real 404s return 404 status (not masked as 200)
- Profile Lambda handles missing profiles gracefully
- All verification scripts pass
- Documentation is complete and accurate
