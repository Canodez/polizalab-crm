# Profile Lambda Unit Tests

This directory contains unit tests for the Profile Lambda handler.

## Test Coverage

The tests cover the following scenarios as specified in task 8.3:

### 1. GET Existing Profile
- Returns 200 with profile data
- Handles None values properly
- Validates DynamoDB get_item is called correctly

### 2. GET Non-Existent Profile Creates Default
- Creates default profile when profile doesn't exist (Requirement 9.1)
- Extracts email from Cognito JWT token (Requirement 9.4)
- Uses email as name fallback when name claim is missing (Requirement 9.4)
- Handles concurrent profile creation race conditions (Requirement 9.3)
- Uses DynamoDB ConditionExpression to prevent duplicates

### 3. Error Handling Scenarios
- Returns 401 when authorization is missing (Requirement 9.5)
- Returns 500 when DynamoDB errors occur (Requirement 9.5)
- Returns 200 for OPTIONS requests (CORS preflight)
- Returns 404 for invalid endpoints
- Returns 400 for PUT requests with missing required fields
- Returns 400 for PUT requests with invalid JSON

### 4. CORS Handling
- Sets correct CORS headers for CloudFront origin
- Sets correct CORS headers for custom domain
- Defaults to CloudFront origin for unknown origins

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Running Tests

Run all tests:
```bash
cd lambda-deploy
python -m pytest __tests__/test_profile_handler.py -v
```

Run with coverage:
```bash
python -m pytest __tests__/test_profile_handler.py -v --cov=profile_handler --cov-report=term-missing
```

Run specific test class:
```bash
python -m pytest __tests__/test_profile_handler.py::TestProfileHandlerGetExisting -v
```

Run specific test:
```bash
python -m pytest __tests__/test_profile_handler.py::TestProfileHandlerGetExisting::test_get_existing_profile_returns_200 -v
```

## Test Structure

Tests are organized into classes by functionality:
- `TestProfileHandlerGetExisting`: Tests for existing profile retrieval
- `TestProfileHandlerGetNonExistent`: Tests for default profile creation
- `TestProfileHandlerErrorHandling`: Tests for error scenarios
- `TestProfileHandlerCORS`: Tests for CORS header handling

## Requirements Validation

These tests validate the following requirements:
- **Requirement 9.1**: Profile Lambda creates default profile for non-existent profiles
- **Requirement 9.3**: Idempotent profile creation using DynamoDB ConditionExpression
- **Requirement 9.4**: Email and name extraction from Cognito JWT token
- **Requirement 9.5**: Error handling for authentication and DynamoDB errors
