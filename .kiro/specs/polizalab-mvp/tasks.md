# Implementation Plan: PolizaLab MVP

## Overview

This implementation plan breaks down the PolizaLab MVP into discrete coding tasks. The approach follows an incremental strategy: set up infrastructure, build backend APIs, implement frontend components, integrate document processing, and add PWA capabilities. Each task builds on previous work to ensure continuous integration.

**Technology Stack:**
- Frontend: React 18 + Next.js 14 (App Router), TypeScript, Tailwind CSS
- Backend: AWS Lambda (Node.js 18), TypeScript
- Testing: Jest, React Testing Library, fast-check (property-based testing)

## Tasks

- [x] 1. Project setup and infrastructure foundation
  - Initialize Next.js project with TypeScript and Tailwind CSS
  - Configure project structure (app/, components/, lib/, types/)
  - Set up ESLint, Prettier, and TypeScript strict mode
  - Install core dependencies (AWS SDK, date-fns, uuid)
  - Create environment variable templates (.env.example)
  - Set up Jest and React Testing Library configuration
  - _Requirements: All (foundation)_

- [x] 2. AWS infrastructure setup guide
  - Create documentation for AWS Console setup steps
  - Document Cognito User Pool creation (email + password auth)
  - Document DynamoDB table creation (Users and Policies tables with GSI)
  - Document S3 bucket creation with folder structure
  - Document API Gateway HTTP API creation with Cognito authorizer
  - Document Lambda function creation and IAM roles
  - Document S3 event notification configuration for Lambda trigger
  - Include all required environment variables and ARNs
  - _Requirements: 1.1, 3.2, 4.1, 13.1, 14.1_

- [ ] 3. Implement authentication module
  - [x] 3.1 Create Cognito authentication utilities
    - Implement registerUser, loginUser, logoutUser, getCurrentUser functions
    - Use AWS Amplify or AWS SDK for Cognito integration
    - Implement secure token storage (localStorage with encryption or httpOnly cookies)
    - _Requirements: 1.1, 1.3, 1.5_
  
  - [ ]* 3.2 Write property test for authentication flow
    - **Property 2: Valid credentials grant access**
    - **Validates: Requirements 1.3**
  
  - [ ]* 3.3 Write property test for invalid credentials rejection
    - **Property 3: Invalid credentials are rejected**
    - **Validates: Requirements 1.4**
  
  - [x] 3.4 Create authentication context and hooks
    - Implement React Context for auth state
    - Create useAuth hook for components
    - Handle token refresh logic
    - _Requirements: 1.3, 1.5_
  
  - [ ]* 3.5 Write unit tests for authentication edge cases
    - Test token expiration handling
    - Test network error scenarios
    - Test logout clears all auth state
    - _Requirements: 1.4, 1.5_

- [ ] 4. Implement user registration and profile backend
  - [x] 4.1 Create Auth Handler Lambda function
    - Implement POST /auth/register endpoint
    - Extract userId from Cognito event
    - Create user record in DynamoDB Users table
    - Include error handling and logging
    - _Requirements: 1.1, 1.6, 14.3, 14.4, 14.5_
  
  - [ ]* 4.2 Write property test for user registration persistence
    - **Property 1: User registration creates persistent records**
    - **Validates: Requirements 1.1, 1.6, 14.3, 14.4, 14.5**
  
  - [x] 4.3 Create Profile Handler Lambda function
    - Implement GET /profile endpoint
    - Implement PUT /profile endpoint
    - Implement POST /profile/image endpoint (pre-signed URL generation)
    - Extract userId from JWT token
    - Include authorization checks
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [ ]* 4.4 Write property test for profile field updates
    - **Property 6: Profile field updates persist**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  
  - [ ]* 4.5 Write property test for profile image upload
    - **Property 5: Profile image upload round-trip**
    - **Validates: Requirements 2.1, 2.4**

- [ ] 5. Implement registration and login UI
  - [x] 5.1 Create registration page component
    - Build form with email and password fields
    - Implement client-side validation
    - Call registerUser function on submit
    - Display success/error messages
    - Redirect to login after successful registration
    - _Requirements: 1.1, 1.2_
  
  - [x] 5.2 Create login page component
    - Build form with email and password fields
    - Call loginUser function on submit
    - Display error messages for invalid credentials
    - Redirect to home screen after successful login
    - _Requirements: 1.3, 1.4_
  
  - [ ]* 5.3 Write unit tests for registration and login forms
    - Test form validation
    - Test error message display
    - Test successful submission flow
    - _Requirements: 1.1, 1.3, 1.4_

- [ ] 6. Implement profile management UI
  - [x] 6.1 Create profile page component
    - Display current profile data (nombre, apellido, email, profile image)
    - Build edit form for nombre and apellido
    - Implement profile image upload with preview
    - Call profile API endpoints
    - Display success/error messages
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [ ]* 6.2 Write property test for profile image format validation
    - **Property 7: Profile image format validation**
    - **Validates: Requirements 2.5**
  
  - [ ]* 6.3 Write unit tests for profile UI
    - Test profile data display
    - Test edit form submission
    - Test image upload preview
    - _Requirements: 2.1, 2.2, 2.3_

- [~] 7. Checkpoint - Ensure authentication and profile work end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement policy backend APIs
  - [x] 8.1 Create Policy Handler Lambda function structure
    - Set up Lambda handler with routing for multiple endpoints
    - Implement JWT token validation utility
    - Implement userId extraction from token
    - Create DynamoDB query utilities
    - _Requirements: 12.1, 12.2_
  
  - [x] 8.2 Implement GET /policies endpoint
    - Query DynamoDB using userId GSI
    - Sort by createdAt descending
    - Limit to 10 most recent
    - Calculate renewalStatus for each policy
    - _Requirements: 9.1, 9.2, 12.2_
  
  - [x] 8.3 Implement GET /policies/:id endpoint
    - Get policy by policyId
    - Verify userId matches authenticated user
    - Return 403 if unauthorized
    - Calculate current renewalStatus
    - _Requirements: 5.1, 12.3_
  
  - [x] 8.4 Implement PUT /policies/:id endpoint
    - Verify userId matches authenticated user
    - Validate input fields
    - Recalculate fechaRenovacion if fechaInicio or tipoPoliza changed
    - Update updatedAt timestamp
    - Persist changes to DynamoDB
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 6.6_
  
  - [x] 8.5 Implement GET /policies/renewals endpoint
    - Query policies by userId
    - Filter by renewalStatus (30_DAYS, 60_DAYS, 90_DAYS)
    - Sort by fechaRenovacion ascending
    - Group by renewalStatus
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  
  - [x] 8.6 Implement POST /policies/upload-url endpoint
    - Generate unique S3 key with userId and UUID
    - Create pre-signed URL for S3 upload (5 minute expiration)
    - Return presignedUrl and s3Key
    - _Requirements: 3.2, 3.6_
  
  - [ ]* 8.7 Write property test for user data isolation
    - **Property 24: User-specific policy retrieval**
    - **Validates: Requirements 8.1, 12.2**
  
  - [ ]* 8.8 Write property test for cross-user access prevention
    - **Property 32: Cross-user access prevention**
    - **Validates: Requirements 5.6, 12.3, 12.4**
  
  - [ ]* 8.9 Write property test for API authentication enforcement
    - **Property 31: API authentication enforcement**
    - **Validates: Requirements 12.1, 12.6**

- [ ] 9. Implement renewal calculation utilities
  - [~] 9.1 Create calculateRenewalDate function
    - Implement 12-month calculation for Auto, GMM, Hogar, Vida temporal
    - Return null for Vida permanente
    - Handle null/invalid inputs gracefully
    - Use date-fns for date manipulation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_
  
  - [ ]* 9.2 Write property test for twelve-month renewal calculation
    - **Property 19: Twelve-month renewal calculation**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.7**
  
  - [ ]* 9.3 Write property test for permanent life policy renewal
    - **Property 20: Permanent life policy renewal**
    - **Validates: Requirements 6.5, 6.7**
  
  - [~] 9.4 Create calculateRenewalStatus function
    - Calculate days until renewal
    - Return OVERDUE, 30_DAYS, 60_DAYS, 90_DAYS, or NOT_URGENT
    - Handle null fechaRenovacion
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ]* 9.5 Write property test for renewal status classification
    - **Property 22: Renewal status classification correctness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
  
  - [ ]* 9.6 Write unit tests for date edge cases
    - Test leap years
    - Test month-end dates
    - Test null inputs
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Implement document processing Lambda
  - [~] 10.1 Create Document Processor Lambda function
    - Set up S3 event trigger handler
    - Extract userId and generate policyId from S3 key
    - Invoke AWS Textract AnalyzeDocument API
    - Extract raw text from Textract response
    - _Requirements: 3.3, 4.1, 13.4_
  
  - [~] 10.2 Implement text parsing logic
    - Create regex patterns for common fields (numeroPoliza, aseguradora, nombre, edad, dates)
    - Implement keyword matching for tipoPoliza detection
    - Normalize extracted values (trim whitespace, format dates)
    - Handle missing fields gracefully (store null)
    - _Requirements: 4.2, 4.7_
  
  - [~] 10.3 Implement policy record creation
    - Calculate fechaRenovacion using calculateRenewalDate
    - Calculate initial renewalStatus
    - Create policy record in DynamoDB with all fields
    - Set status to PROCESSED on success
    - Set status to FAILED on error with error message
    - _Requirements: 4.4, 4.5, 4.6, 13.5_
  
  - [ ]* 10.4 Write property test for Textract invocation
    - **Property 11: Textract invocation on upload**
    - **Validates: Requirements 4.1**
  
  - [ ]* 10.5 Write property test for successful processing
    - **Property 12: Successful processing creates policy record**
    - **Validates: Requirements 4.4, 4.6, 4.7, 13.4, 13.5**
  
  - [ ]* 10.6 Write unit tests for text parsing
    - Test regex patterns with sample text
    - Test keyword matching for policy types
    - Test handling of missing fields
    - _Requirements: 4.2, 4.7_

- [ ] 11. Implement policy upload UI
  - [~] 11.1 Create policy upload component
    - Build file picker for supported formats
    - Implement file validation (type and size)
    - Request pre-signed URL from API
    - Upload file directly to S3 using pre-signed URL
    - Display upload progress
    - Show success/error messages
    - Redirect to home screen after successful upload
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  
  - [ ]* 11.2 Write property test for supported document formats
    - **Property 9: Supported document formats are accepted**
    - **Validates: Requirements 3.1**
  
  - [ ]* 11.3 Write unit tests for upload UI
    - Test file validation
    - Test upload progress display
    - Test error handling
    - _Requirements: 3.1, 3.4, 3.5_

- [ ] 12. Implement home screen
  - [~] 12.1 Create home screen layout component
    - Implement mobile-first responsive design
    - Create sections for renewals and recent policies
    - Add prominent "Subir póliza" button
    - Use Tailwind CSS for styling
    - _Requirements: 10.1, 10.5, 10.7_
  
  - [~] 12.2 Create upcoming renewals section
    - Fetch renewals from GET /policies/renewals
    - Display grouped by status (30, 60, 90 días)
    - Show clienteNombre, clienteApellido, tipoPoliza, aseguradora, fechaRenovacion
    - Handle empty state with message
    - Make items tappable to navigate to detail
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [~] 12.3 Create recent policies section
    - Fetch policies from GET /policies
    - Display 10 most recent policies
    - Show clienteNombre, clienteApellido, tipoPoliza, createdAt
    - Handle empty state with encouragement message
    - Make items tappable to navigate to detail
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  
  - [ ]* 12.4 Write property test for recent policies limiting
    - **Property 29: Recent policies retrieval and limiting**
    - **Validates: Requirements 9.1, 9.2**
  
  - [ ]* 12.5 Write property test for renewals filtering
    - **Property 25: Upcoming renewals filtering**
    - **Validates: Requirements 8.2**
  
  - [ ]* 12.6 Write unit tests for home screen
    - Test empty states
    - Test data display
    - Test navigation
    - _Requirements: 8.6, 9.5_

- [ ] 13. Implement policy detail and edit UI
  - [~] 13.1 Create policy detail page component
    - Fetch policy data from GET /policies/:id
    - Display all policy fields in read-only mode
    - Add "Edit" button to switch to edit mode
    - Handle 403 errors (unauthorized access)
    - _Requirements: 5.1, 12.3_
  
  - [~] 13.2 Create policy edit form component
    - Build form with all editable fields
    - Pre-populate with current values
    - Implement field validation
    - Call PUT /policies/:id on save
    - Display success/error messages
    - Switch back to read-only mode after save
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 13.3 Write property test for policy updates with timestamp
    - **Property 17: Policy updates persist with timestamp**
    - **Validates: Requirements 5.3, 5.4**
  
  - [ ]* 13.4 Write property test for renewal recalculation
    - **Property 21: Renewal date recalculation on start date change**
    - **Validates: Requirements 6.6**
  
  - [ ]* 13.5 Write unit tests for policy edit form
    - Test field validation
    - Test save success
    - Test save errors
    - _Requirements: 5.2, 5.3_

- [~] 14. Checkpoint - Ensure core policy flow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement PWA capabilities
  - [~] 15.1 Create web app manifest
    - Define app name, short_name, description
    - Add app icons (192x192, 512x512)
    - Set theme_color and background_color
    - Set display mode to "standalone"
    - Set start_url to "/"
    - _Requirements: 11.1, 11.4, 11.6_
  
  - [~] 15.2 Implement service worker
    - Use next-pwa or Workbox
    - Cache critical assets (HTML, CSS, JS)
    - Implement cache-first strategy for static assets
    - Implement network-first strategy for API calls
    - Handle offline scenarios gracefully
    - _Requirements: 11.2, 11.5_
  
  - [ ]* 15.3 Write property test for service worker caching
    - **Property 33: Service worker caches critical assets**
    - **Validates: Requirements 11.5**
  
  - [ ]* 15.4 Write unit tests for PWA configuration
    - Test manifest file structure
    - Test service worker registration
    - _Requirements: 11.1, 11.2_

- [ ] 16. Implement mobile-first responsive design
  - [~] 16.1 Apply mobile-first styling to all components
    - Use Tailwind CSS responsive utilities
    - Ensure buttons are minimum 44x44 pixels
    - Add ample spacing between interactive elements
    - Implement single-column layout for mobile
    - Test on viewport widths below 768px
    - _Requirements: 10.1, 10.2, 10.3, 10.7_
  
  - [ ]* 16.2 Write property test for responsive layout
    - **Property 34: Responsive mobile layout**
    - **Validates: Requirements 10.7**
  
  - [~] 16.3 Implement minimalist design system
    - Define color palette (primary, secondary, neutral)
    - Define typography scale
    - Create reusable button components
    - Create reusable card components
    - Ensure clear visual hierarchy
    - _Requirements: 10.4_

- [ ] 17. Add error handling and loading states
  - [~] 17.1 Create error boundary component
    - Catch React errors
    - Display user-friendly error messages
    - Log errors for debugging
    - _Requirements: All (error handling)_
  
  - [~] 17.2 Add loading states to all async operations
    - Show spinners during API calls
    - Show skeleton screens for data loading
    - Disable buttons during submission
    - _Requirements: All (UX)_
  
  - [~] 17.3 Implement error toast notifications
    - Create toast component for error messages
    - Display network errors
    - Display validation errors
    - Auto-dismiss after timeout
    - _Requirements: All (error handling)_

- [ ] 18. Add data validation utilities
  - [~] 18.1 Create validation functions
    - Implement email validation
    - Implement date format validation (YYYY-MM-DD)
    - Implement age validation (18-100)
    - Implement required field validation
    - _Requirements: 5.2, 13.6_
  
  - [ ]* 18.2 Write property test for field validation
    - **Property 16: Policy field validation**
    - **Validates: Requirements 5.2**
  
  - [ ]* 18.3 Write property test for date format consistency
    - **Property 14: Date format consistency**
    - **Validates: Requirements 13.6, 14.5**

- [ ] 19. Integration and final wiring
  - [~] 19.1 Connect all components with routing
    - Set up Next.js App Router routes
    - Implement protected routes (require authentication)
    - Add navigation between pages
    - Handle 404 pages
    - _Requirements: All_
  
  - [~] 19.2 Configure environment variables
    - Set up .env.local for development
    - Document all required environment variables
    - Add Cognito User Pool ID and Client ID
    - Add API Gateway endpoint URL
    - Add S3 bucket name
    - Add AWS region
    - _Requirements: All_
  
  - [~] 19.3 Add API client configuration
    - Create centralized API client with base URL
    - Add request interceptor for auth tokens
    - Add response interceptor for error handling
    - Implement retry logic for transient errors
    - _Requirements: 12.1_
  
  - [ ]* 19.4 Write integration tests
    - Test complete user registration flow
    - Test complete policy upload flow
    - Test complete policy edit flow
    - _Requirements: 1.1, 3.2, 5.3_

- [~] 20. Final checkpoint - Ensure all tests pass and app is functional
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- The implementation follows an incremental approach: auth → profile → policies → upload → PWA
- AWS infrastructure setup (task 2) should be completed before backend implementation
- Frontend and backend can be developed in parallel after task 7 checkpoint
