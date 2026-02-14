# Requirements Document - PolizaLab MVP

## Introduction

PolizaLab es un asistente diario mobile-first para agentes de seguros principiantes en México. El sistema permite subir pólizas en múltiples formatos, extraer datos automáticamente usando AWS Textract, y gestionar renovaciones próximas. El objetivo principal es evitar pérdida de dinero por desorganización, manteniendo una experiencia simple y rápida optimizada para uso móvil.

## Glossary

- **System**: PolizaLab MVP application
- **User**: Agente de seguros que utiliza la aplicación
- **Policy**: Póliza de seguros subida al sistema
- **Client**: Cliente del agente (persona asegurada)
- **Textract**: Servicio AWS de extracción de texto de documentos
- **Cognito**: Servicio AWS de autenticación y gestión de usuarios
- **DynamoDB**: Base de datos NoSQL de AWS
- **S3**: Servicio de almacenamiento de archivos de AWS
- **Lambda**: Servicio de funciones serverless de AWS
- **Renewal_Status**: Estado de renovación de una póliza (30 días, 60 días, 90 días)
- **Profile_Image**: Imagen de perfil del usuario almacenada en S3

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a new insurance agent, I want to register and login to the system, so that I can securely access my policy data.

#### Acceptance Criteria

1. WHEN a user provides email and password, THE System SHALL create a new account in Cognito
2. WHEN a user attempts to register with an existing email, THE System SHALL reject the registration and return an error message
3. WHEN a registered user provides valid credentials, THE System SHALL authenticate the user and grant access to the application
4. WHEN a user provides invalid credentials, THE System SHALL reject the login attempt and return an error message
5. WHEN an authenticated user requests logout, THE System SHALL terminate the session and clear authentication tokens
6. WHEN a user registers successfully, THE System SHALL create a corresponding user record in DynamoDB with userId, email, and createdAt timestamp

### Requirement 2: User Profile Management

**User Story:** As a user, I want to manage my profile information including name and profile image, so that I can personalize my account.

#### Acceptance Criteria

1. WHEN a user uploads a profile image, THE System SHALL store the image in S3 and save the S3 key reference in DynamoDB
2. WHEN a user updates their nombre (first name), THE System SHALL persist the change to the Users table in DynamoDB
3. WHEN a user updates their apellido (last name), THE System SHALL persist the change to the Users table in DynamoDB
4. WHEN a user requests their profile data, THE System SHALL retrieve and return all profile fields from DynamoDB
5. THE System SHALL validate that profile images are in supported formats (JPEG, PNG, WebP)
6. WHEN a user uploads a new profile image, THE System SHALL replace the previous image reference in DynamoDB

### Requirement 3: Policy Document Upload

**User Story:** As an insurance agent, I want to upload policy documents in various formats, so that I can digitize my paper-based policies.

#### Acceptance Criteria

1. THE System SHALL accept policy documents in PDF, Word (DOC/DOCX), Excel (XLS/XLSX), and image formats (JPEG, PNG)
2. WHEN a user uploads a policy document, THE System SHALL store the file in S3 with a unique key
3. WHEN a file is successfully uploaded to S3, THE System SHALL trigger a Lambda function for processing
4. WHEN a file upload fails, THE System SHALL return an error message to the user and not create a policy record
5. THE System SHALL validate file size limits before upload (maximum 10MB per file)
6. WHEN a user uploads a file, THE System SHALL associate the file with the authenticated user's userId

### Requirement 4: Automatic Policy Data Extraction

**User Story:** As an insurance agent, I want the system to automatically extract policy data from uploaded documents, so that I don't have to manually type all information.

#### Acceptance Criteria

1. WHEN a policy document is uploaded to S3, THE Lambda function SHALL invoke AWS Textract AnalyzeDocument API
2. WHEN Textract completes analysis, THE Lambda function SHALL extract the following fields: nombre cliente, apellidos cliente, edad, tipo póliza, cobertura, número póliza, fecha inicio, fecha fin, aseguradora
3. WHEN text extraction is complete, THE Lambda function SHALL apply simple parsing using regex and keyword matching to identify field values
4. WHEN field extraction completes, THE Lambda function SHALL create a policy record in DynamoDB with extracted data and status "PROCESSED"
5. WHEN Textract fails to process a document, THE Lambda function SHALL create a policy record with status "FAILED" and log the error
6. THE System SHALL store the S3 key reference in the policy record for future access to the original document
7. WHEN extraction cannot identify a required field, THE Lambda function SHALL store null for that field and allow manual editing

### Requirement 5: Manual Policy Data Editing

**User Story:** As an insurance agent, I want to manually edit extracted policy data, so that I can correct any errors from automatic extraction.

#### Acceptance Criteria

1. WHEN a user requests to edit a policy, THE System SHALL retrieve the current policy data from DynamoDB
2. WHEN a user modifies any policy field, THE System SHALL validate the field format before saving
3. WHEN a user saves policy changes, THE System SHALL update the policy record in DynamoDB with the new values
4. WHEN a policy is updated, THE System SHALL update the updatedAt timestamp
5. THE System SHALL allow editing of all extracted fields: clienteNombre, clienteApellido, edad, tipoPoliza, cobertura, numeroPoliza, fechaInicio, fechaFin, aseguradora
6. WHEN a user attempts to edit a policy they don't own, THE System SHALL reject the request and return an authorization error

### Requirement 6: Renewal Date Calculation

**User Story:** As an insurance agent, I want the system to automatically calculate renewal dates based on policy type, so that I can track when policies need renewal.

#### Acceptance Criteria

1. WHEN a policy of type "Auto" is created, THE System SHALL calculate fechaRenovacion as fechaInicio plus 12 months
2. WHEN a policy of type "GMM" is created, THE System SHALL calculate fechaRenovacion as fechaInicio plus 12 months
3. WHEN a policy of type "Hogar" is created, THE System SHALL calculate fechaRenovacion as fechaInicio plus 12 months
4. WHEN a policy of type "Vida temporal" is created, THE System SHALL calculate fechaRenovacion as fechaInicio plus 12 months
5. WHEN a policy of type "Vida permanente" is created, THE System SHALL set fechaRenovacion to null (manual renewal)
6. WHEN fechaInicio is updated for a policy, THE System SHALL recalculate fechaRenovacion based on the policy type rules
7. THE System SHALL store the calculated fechaRenovacion in the Policies table

### Requirement 7: Renewal Status Classification

**User Story:** As an insurance agent, I want to see which policies are coming up for renewal soon, so that I can contact clients proactively.

#### Acceptance Criteria

1. WHEN the current date is within 30 days of fechaRenovacion, THE System SHALL classify the policy with renewalStatus "30_DAYS"
2. WHEN the current date is within 31-60 days of fechaRenovacion, THE System SHALL classify the policy with renewalStatus "60_DAYS"
3. WHEN the current date is within 61-90 days of fechaRenovacion, THE System SHALL classify the policy with renewalStatus "90_DAYS"
4. WHEN the current date is more than 90 days before fechaRenovacion, THE System SHALL classify the policy with renewalStatus "NOT_URGENT"
5. WHEN a policy's fechaRenovacion is in the past, THE System SHALL classify the policy with renewalStatus "OVERDUE"
6. THE System SHALL update renewalStatus whenever a policy is retrieved or when renewal dates are recalculated

### Requirement 8: Upcoming Renewals View

**User Story:** As an insurance agent, I want to view upcoming renewals sorted by urgency, so that I can prioritize my client outreach.

#### Acceptance Criteria

1. WHEN a user requests the renewals view, THE System SHALL retrieve all policies belonging to that user from DynamoDB
2. WHEN displaying renewals, THE System SHALL filter policies to show only those with renewalStatus of "30_DAYS", "60_DAYS", or "90_DAYS"
3. WHEN displaying renewals, THE System SHALL sort policies by fechaRenovacion in ascending order (most urgent first)
4. WHEN displaying a renewal item, THE System SHALL show clienteNombre, clienteApellido, tipoPoliza, aseguradora, and fechaRenovacion
5. THE System SHALL group renewals by renewalStatus category (30 días, 60 días, 90 días)
6. WHEN no renewals are upcoming, THE System SHALL display a message indicating no upcoming renewals

### Requirement 9: Recent Policies View

**User Story:** As an insurance agent, I want to see my recently uploaded policies on the home screen, so that I can quickly access my latest work.

#### Acceptance Criteria

1. WHEN a user views the home screen, THE System SHALL retrieve the user's policies from DynamoDB sorted by createdAt descending
2. THE System SHALL display the 10 most recent policies on the home screen
3. WHEN displaying a recent policy, THE System SHALL show clienteNombre, clienteApellido, tipoPoliza, and createdAt date
4. WHEN a user taps on a recent policy, THE System SHALL navigate to the policy detail view
5. WHEN no policies exist, THE System SHALL display a message encouraging the user to upload their first policy

### Requirement 10: Mobile-First User Interface

**User Story:** As an insurance agent working in the field, I want a mobile-optimized interface, so that I can use the app easily on my phone.

#### Acceptance Criteria

1. THE System SHALL render all views with a mobile-first responsive design
2. THE System SHALL display large touch-friendly buttons (minimum 44x44 pixels)
3. THE System SHALL use ample spacing between interactive elements for easy tapping
4. THE System SHALL implement a minimalist design with clear visual hierarchy
5. THE System SHALL display a prominent "Subir póliza" button on the home screen
6. THE System SHALL organize the home screen to show renewals and recent policies in a vertical scrollable layout
7. WHEN the viewport width is below 768px, THE System SHALL optimize layout for single-column mobile view

### Requirement 11: Progressive Web App Installation

**User Story:** As an insurance agent, I want to install the app on my phone home screen, so that I can access it quickly like a native app.

#### Acceptance Criteria

1. THE System SHALL provide a web app manifest file with app name, icons, and theme colors
2. THE System SHALL implement a service worker for offline capability
3. WHEN a user visits the app on a mobile browser, THE System SHALL prompt for installation to home screen
4. WHEN installed, THE System SHALL launch in standalone mode without browser UI
5. THE System SHALL cache critical assets for offline access to the home screen
6. THE System SHALL display appropriate app icons on the device home screen when installed

### Requirement 12: User Authorization and Data Isolation

**User Story:** As a user, I want my policy data to be private and secure, so that other agents cannot access my client information.

#### Acceptance Criteria

1. WHEN a user makes an API request, THE System SHALL validate the Cognito authentication token
2. WHEN a user requests policies, THE System SHALL filter results to return only policies where userId matches the authenticated user
3. WHEN a user attempts to access a policy belonging to another user, THE System SHALL reject the request with a 403 Forbidden error
4. WHEN a user attempts to update a policy belonging to another user, THE System SHALL reject the request with a 403 Forbidden error
5. THE System SHALL include userId validation in all Lambda functions that access policy data
6. WHEN an unauthenticated request is made to protected endpoints, THE System SHALL reject the request with a 401 Unauthorized error

### Requirement 13: Policy Data Persistence

**User Story:** As a system administrator, I want policy data stored reliably in DynamoDB, so that user data is durable and queryable.

#### Acceptance Criteria

1. THE System SHALL store policy records in a DynamoDB table named "Policies"
2. THE Policies table SHALL use policyId as the partition key (PK)
3. THE Policies table SHALL include a Global Secondary Index (GSI) on userId for efficient user-based queries
4. WHEN a policy is created, THE System SHALL generate a unique policyId using UUID v4
5. THE System SHALL store all policy fields: policyId, userId, clienteNombre, clienteApellido, edad, tipoPoliza, cobertura, numeroPoliza, aseguradora, fechaInicio, fechaFin, fechaRenovacion, renewalStatus, s3Key, createdAt, updatedAt
6. WHEN storing dates, THE System SHALL use ISO 8601 format (YYYY-MM-DD)

### Requirement 14: User Data Persistence

**User Story:** As a system administrator, I want user profile data stored reliably in DynamoDB, so that user accounts are durable.

#### Acceptance Criteria

1. THE System SHALL store user records in a DynamoDB table named "Users"
2. THE Users table SHALL use userId as the partition key (PK)
3. WHEN a user registers, THE System SHALL use the Cognito user sub (UUID) as the userId
4. THE System SHALL store all user fields: userId, email, nombre, apellido, profileImage, createdAt
5. WHEN a user record is created, THE System SHALL set createdAt to the current ISO 8601 timestamp
6. THE System SHALL ensure userId matches the Cognito user sub for data consistency
