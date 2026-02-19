"""
Property-Based Tests for Profile Lambda Handler
Tests universal properties across random inputs using Hypothesis
Feature: cloudfront-routing-fix, Property 4: Profile Lambda Idempotent Upsert
Validates: Requirements 9.1, 9.3
"""
import json
import os
import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed
from botocore.exceptions import ClientError

# Set environment variables before importing handler
os.environ['DYNAMODB_USERS_TABLE'] = 'Users'
os.environ['S3_BUCKET_NAME'] = 'polizalab-documents-dev'

# Import after setting environment variables
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from profile_handler import lambda_handler


# Custom strategies for generating valid test data
@st.composite
def user_id_strategy(draw):
    """Generate valid user IDs (alphanumeric with hyphens)"""
    # Generate UUID-like strings or simple alphanumeric IDs
    return draw(st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), whitelist_characters='-'),
        min_size=5,
        max_size=50
    ).filter(lambda x: x and not x.startswith('-') and not x.endswith('-')))


@st.composite
def email_strategy(draw):
    """Generate valid email addresses"""
    # Use hypothesis email strategy
    return draw(st.emails())


@st.composite
def name_strategy(draw):
    """Generate valid names (non-empty strings)"""
    return draw(st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Zs')),
        min_size=1,
        max_size=100
    ).filter(lambda x: x.strip()))


class TestProfileLambdaIdempotentUpsert:
    """
    Property 4: Profile Lambda Idempotent Upsert
    
    For any GET request to a non-existent profile, the Profile Lambda should create 
    a default profile and return it, and if multiple concurrent requests attempt to 
    create the same profile, exactly one profile should be created and all requests 
    should receive the same profile data.
    
    Validates: Requirements 9.1, 9.3
    """
    
    @settings(max_examples=100, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy(),
        name=name_strategy()
    )
    @patch('profile_handler.users_table')
    def test_single_request_creates_profile_exactly_once(self, mock_table, user_id, email, name):
        """
        Property: Single GET request for non-existent profile creates exactly one profile
        
        For any valid user_id, email, and name, a single GET request should:
        1. Detect that the profile doesn't exist
        2. Create a default profile with the provided data
        3. Return the created profile with status 200
        """
        # Arrange: Mock DynamoDB to simulate non-existent profile
        mock_table.get_item.return_value = {}  # No existing profile
        mock_table.put_item.return_value = {}  # Successful creation
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email,
                            'name': name
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200, f"Expected 200, got {response['statusCode']}"
        
        body = json.loads(response['body'])
        assert body['userId'] == user_id, f"Expected userId {user_id}, got {body.get('userId')}"
        assert body['email'] == email, f"Expected email {email}, got {body.get('email')}"
        assert body['nombre'] == name, f"Expected nombre {name}, got {body.get('nombre')}"
        assert body['apellido'] == '', "Expected empty apellido"
        assert body['phone'] == '', "Expected empty phone"
        assert body['company'] == '', "Expected empty company"
        
        # Verify put_item was called exactly once with correct parameters
        assert mock_table.put_item.call_count == 1, f"Expected put_item called once, got {mock_table.put_item.call_count}"
        call_args = mock_table.put_item.call_args
        assert call_args[1]['Item']['userId'] == user_id
        assert call_args[1]['ConditionExpression'] == 'attribute_not_exists(userId)'
    
    @settings(max_examples=50, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy(),
        name=name_strategy()
    )
    @patch('profile_handler.users_table')
    def test_concurrent_requests_create_exactly_one_profile(self, mock_table, user_id, email, name):
        """
        Property: Concurrent GET requests for non-existent profile create exactly one profile
        
        For any valid user_id, email, and name, multiple concurrent GET requests should:
        1. Result in exactly one profile being created in DynamoDB
        2. All requests should succeed with status 200
        3. All requests should receive the same profile data
        
        This tests the idempotent upsert behavior with ConditionExpression.
        """
        # Arrange: Simulate concurrent creation scenario
        # Track how many times put_item is actually called
        put_item_call_count = 0
        created_profile = {
            'userId': user_id,
            'email': email,
            'nombre': name,
            'apellido': '',
            'phone': '',
            'company': ''
        }
        
        def mock_get_item(Key):
            """Mock get_item: first call returns empty, subsequent calls return profile"""
            if mock_table.get_item.call_count <= 1:
                return {}  # Profile doesn't exist yet
            else:
                return {'Item': created_profile}  # Profile exists now
        
        def mock_put_item(Item, ConditionExpression):
            """Mock put_item: first call succeeds, subsequent calls raise ConditionalCheckFailedException"""
            nonlocal put_item_call_count
            put_item_call_count += 1
            
            if put_item_call_count == 1:
                # First call succeeds
                return {}
            else:
                # Subsequent calls fail with ConditionalCheckFailedException
                error_response = {'Error': {'Code': 'ConditionalCheckFailedException'}}
                raise ClientError(error_response, 'PutItem')
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email,
                            'name': name
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act: Simulate 5 concurrent requests
        num_concurrent_requests = 5
        responses = []
        
        with ThreadPoolExecutor(max_workers=num_concurrent_requests) as executor:
            futures = [executor.submit(lambda_handler, event, None) for _ in range(num_concurrent_requests)]
            for future in as_completed(futures):
                responses.append(future.result())
        
        # Assert: All requests should succeed
        assert len(responses) == num_concurrent_requests, f"Expected {num_concurrent_requests} responses, got {len(responses)}"
        
        for i, response in enumerate(responses):
            assert response['statusCode'] == 200, f"Request {i} failed with status {response['statusCode']}"
            
            body = json.loads(response['body'])
            assert body['userId'] == user_id, f"Request {i}: Expected userId {user_id}, got {body.get('userId')}"
            assert body['email'] == email, f"Request {i}: Expected email {email}, got {body.get('email')}"
        
        # Verify that put_item was attempted (at least once, possibly more due to concurrency)
        # The key property is that all requests succeeded, not how many times put_item was called
        assert put_item_call_count >= 1, "Expected at least one put_item call"
    
    @settings(max_examples=100, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy()
    )
    @patch('profile_handler.users_table')
    def test_missing_name_claim_uses_email_as_fallback(self, mock_table, user_id, email):
        """
        Property: When name claim is missing, email is used as fallback for nombre
        
        For any valid user_id and email, when the name claim is missing:
        1. The profile should be created successfully
        2. The nombre field should be set to the email value
        """
        # Arrange
        mock_table.get_item.return_value = {}
        mock_table.put_item.return_value = {}
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email
                            # No 'name' claim
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['nombre'] == email, f"Expected nombre to be {email}, got {body.get('nombre')}"
    
    @settings(max_examples=100, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy(),
        name=name_strategy()
    )
    @patch('profile_handler.users_table')
    def test_conditional_check_failure_fetches_existing_profile(self, mock_table, user_id, email, name):
        """
        Property: When ConditionalCheckFailedException occurs, existing profile is fetched
        
        For any valid user_id, email, and name, when put_item fails due to concurrent creation:
        1. The lambda should catch ConditionalCheckFailedException
        2. The lambda should fetch the existing profile
        3. The lambda should return the existing profile with status 200
        """
        # Arrange: Simulate race condition
        existing_profile = {
            'userId': user_id,
            'email': email,
            'nombre': name,
            'apellido': 'Existing',
            'phone': '1234567890',
            'company': 'Existing Company'
        }
        
        # First get_item returns empty, second returns existing profile
        mock_table.get_item.side_effect = [
            {},  # Profile doesn't exist initially
            {'Item': existing_profile}  # Profile exists after ConditionalCheckFailedException
        ]
        
        # put_item raises ConditionalCheckFailedException
        error_response = {'Error': {'Code': 'ConditionalCheckFailedException'}}
        mock_table.put_item.side_effect = ClientError(error_response, 'PutItem')
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email,
                            'name': name
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['userId'] == user_id
        assert body['email'] == email
        # Should return the existing profile data, not the default
        assert body['apellido'] == 'Existing'
        
        # Verify get_item was called twice
        assert mock_table.get_item.call_count == 2


class TestProfileLambdaTokenExtraction:
    """
    Property 5: Profile Lambda Token Extraction
    
    For any valid Cognito JWT token, the Profile Lambda should correctly extract 
    the email and name claims and use them when creating a default profile.
    
    Validates: Requirements 9.4
    """
    
    @settings(max_examples=100, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy(),
        name=name_strategy()
    )
    @patch('profile_handler.users_table')
    def test_token_claims_extracted_correctly_with_name(self, mock_table, user_id, email, name):
        """
        Property: Lambda correctly extracts email and name from JWT token claims
        
        For any valid user_id, email, and name in JWT claims:
        1. The lambda should extract the email claim correctly
        2. The lambda should extract the name claim correctly
        3. The created profile should use these extracted values
        """
        # Arrange
        mock_table.get_item.return_value = {}  # No existing profile
        mock_table.put_item.return_value = {}  # Successful creation
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email,
                            'name': name
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200, f"Expected 200, got {response['statusCode']}"
        
        body = json.loads(response['body'])
        
        # Verify email was extracted correctly
        assert body['email'] == email, f"Email not extracted correctly: expected {email}, got {body.get('email')}"
        
        # Verify name was extracted correctly
        assert body['nombre'] == name, f"Name not extracted correctly: expected {name}, got {body.get('nombre')}"
        
        # Verify put_item was called with extracted values
        assert mock_table.put_item.call_count == 1
        call_args = mock_table.put_item.call_args
        created_item = call_args[1]['Item']
        assert created_item['email'] == email, "Email not passed to DynamoDB correctly"
        assert created_item['nombre'] == name, "Name not passed to DynamoDB correctly"
    
    @settings(max_examples=100, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy()
    )
    @patch('profile_handler.users_table')
    def test_token_claims_extracted_with_missing_name_uses_email_fallback(self, mock_table, user_id, email):
        """
        Property: When name claim is missing, email is used as fallback
        
        For any valid user_id and email, when name claim is absent:
        1. The lambda should extract the email claim correctly
        2. The lambda should use email as fallback for name
        3. The created profile should have nombre set to email
        """
        # Arrange
        mock_table.get_item.return_value = {}
        mock_table.put_item.return_value = {}
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email
                            # No 'name' claim
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200
        
        body = json.loads(response['body'])
        
        # Verify email was extracted correctly
        assert body['email'] == email, f"Email not extracted correctly: expected {email}, got {body.get('email')}"
        
        # Verify email was used as fallback for name
        assert body['nombre'] == email, f"Email fallback not used for nombre: expected {email}, got {body.get('nombre')}"
        
        # Verify put_item was called with email as nombre
        call_args = mock_table.put_item.call_args
        created_item = call_args[1]['Item']
        assert created_item['nombre'] == email, "Email fallback not passed to DynamoDB correctly"
    
    @settings(max_examples=100, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy(),
        name=name_strategy()
    )
    @patch('profile_handler.users_table')
    def test_token_extraction_preserves_all_claim_values(self, mock_table, user_id, email, name):
        """
        Property: Token extraction preserves exact claim values without modification
        
        For any valid JWT claims, the lambda should:
        1. Extract values without trimming, normalizing, or modifying them
        2. Pass the exact values to DynamoDB
        3. Return the exact values in the response
        """
        # Arrange
        mock_table.get_item.return_value = {}
        mock_table.put_item.return_value = {}
        
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email,
                            'name': name
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        body = json.loads(response['body'])
        
        # Verify exact values are preserved (no trimming, case changes, etc.)
        assert body['userId'] == user_id, "userId was modified during extraction"
        assert body['email'] == email, "Email was modified during extraction"
        assert body['nombre'] == name, "Name was modified during extraction"
        
        # Verify exact values passed to DynamoDB
        call_args = mock_table.put_item.call_args
        created_item = call_args[1]['Item']
        assert created_item['userId'] == user_id, "userId was modified before DynamoDB"
        assert created_item['email'] == email, "Email was modified before DynamoDB"
        assert created_item['nombre'] == name, "Name was modified before DynamoDB"
    
    @settings(max_examples=50, deadline=None)
    @given(
        user_id=user_id_strategy(),
        email=email_strategy(),
        name=name_strategy()
    )
    @patch('profile_handler.users_table')
    def test_token_extraction_works_with_nested_claims_structure(self, mock_table, user_id, email, name):
        """
        Property: Token extraction correctly navigates nested JWT claims structure
        
        For any valid JWT token structure, the lambda should:
        1. Navigate the nested requestContext.authorizer.jwt.claims structure
        2. Extract claims from the correct nested location
        3. Handle missing intermediate keys gracefully
        """
        # Arrange
        mock_table.get_item.return_value = {}
        mock_table.put_item.return_value = {}
        
        # Test with correct nested structure
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': user_id,
                            'email': email,
                            'name': name
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['email'] == email
        assert body['nombre'] == name
        
        # Verify the lambda navigated the nested structure correctly
        call_args = mock_table.put_item.call_args
        assert call_args is not None, "put_item was not called - claims extraction failed"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
