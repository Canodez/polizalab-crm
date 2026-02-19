"""
Unit tests for Profile Lambda Handler
Tests GET existing profile, GET non-existent profile creates default, and error handling scenarios
Requirements: 9.1, 9.4, 9.5
"""
import json
import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError

# Set environment variables before importing handler
os.environ['DYNAMODB_USERS_TABLE'] = 'Users'
os.environ['S3_BUCKET_NAME'] = 'polizalab-documents-dev'

# Import after setting environment variables
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from profile_handler import lambda_handler, handle_get_profile, handle_update_profile


class TestProfileHandlerGetExisting:
    """Test GET request for existing profile"""
    
    @patch('profile_handler.users_table')
    def test_get_existing_profile_returns_200(self, mock_table):
        """Test that GET request for existing profile returns 200 with profile data"""
        # Arrange
        user_id = 'test-user-123'
        existing_profile = {
            'userId': user_id,
            'email': 'test@example.com',
            'nombre': 'Test',
            'apellido': 'User',
            'phone': '1234567890',
            'company': 'Test Company'
        }
        
        mock_table.get_item.return_value = {'Item': existing_profile}
        
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
                            'email': 'test@example.com',
                            'name': 'Test User'
                        }
                    }
                }
            },
            'headers': {
                'origin': 'https://crm.antesdefirmar.org'
            }
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['userId'] == user_id
        assert body['email'] == 'test@example.com'
        assert body['nombre'] == 'Test'
        mock_table.get_item.assert_called_once_with(Key={'userId': user_id})
    
    @patch('profile_handler.users_table')
    def test_get_existing_profile_handles_none_values(self, mock_table):
        """Test that None values in profile are properly serialized"""
        # Arrange
        user_id = 'test-user-456'
        existing_profile = {
            'userId': user_id,
            'email': 'test@example.com',
            'nombre': 'Test',
            'apellido': None,
            'phone': None,
            'company': None
        }
        
        mock_table.get_item.return_value = {'Item': existing_profile}
        
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
                            'email': 'test@example.com'
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
        assert body['apellido'] is None
        assert body['phone'] is None


class TestProfileHandlerGetNonExistent:
    """Test GET request for non-existent profile creates default"""
    
    @patch('profile_handler.users_table')
    def test_get_nonexistent_profile_creates_default(self, mock_table):
        """Test that GET request for non-existent profile creates default profile (Requirement 9.1)"""
        # Arrange
        user_id = 'new-user-789'
        email = 'newuser@example.com'
        name = 'New User'
        
        # First get_item returns no profile
        mock_table.get_item.return_value = {}
        
        # put_item succeeds (no concurrent creation)
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
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['userId'] == user_id
        assert body['email'] == email
        assert body['nombre'] == name
        assert body['apellido'] == ''
        assert body['phone'] == ''
        assert body['company'] == ''
        
        # Verify put_item was called with correct parameters
        mock_table.put_item.assert_called_once()
        call_args = mock_table.put_item.call_args
        assert call_args[1]['Item']['userId'] == user_id
        assert call_args[1]['ConditionExpression'] == 'attribute_not_exists(userId)'
    
    @patch('profile_handler.users_table')
    def test_get_nonexistent_profile_extracts_email_from_token(self, mock_table):
        """Test that email is extracted from Cognito JWT token (Requirement 9.4)"""
        # Arrange
        user_id = 'user-email-test'
        email = 'extracted@example.com'
        
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
    
    @patch('profile_handler.users_table')
    def test_get_nonexistent_profile_uses_email_as_name_fallback(self, mock_table):
        """Test that email is used as name fallback when name claim is missing (Requirement 9.4)"""
        # Arrange
        user_id = 'user-no-name'
        email = 'fallback@example.com'
        
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
        assert body['nombre'] == email  # Should use email as fallback
    
    @patch('profile_handler.users_table')
    def test_concurrent_profile_creation_handles_race_condition(self, mock_table):
        """Test that concurrent profile creation is handled gracefully (Requirement 9.3)"""
        # Arrange
        user_id = 'concurrent-user'
        email = 'concurrent@example.com'
        
        # First get_item returns no profile
        # Second get_item (after ConditionalCheckFailedException) returns existing profile
        existing_profile = {
            'userId': user_id,
            'email': email,
            'nombre': 'Concurrent User',
            'apellido': 'Test',
            'phone': '',
            'company': ''
        }
        
        mock_table.get_item.side_effect = [
            {},  # First call: no profile
            {'Item': existing_profile}  # Second call: profile exists
        ]
        
        # put_item raises ConditionalCheckFailedException (profile created by another request)
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
                            'name': 'Concurrent User'
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
        
        # Verify get_item was called twice (once initially, once after ConditionalCheckFailedException)
        assert mock_table.get_item.call_count == 2


class TestProfileHandlerErrorHandling:
    """Test error handling scenarios"""
    
    def test_missing_authorization_returns_401(self):
        """Test that missing authorization returns 401 (Requirement 9.5)"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {}  # No 'sub' claim
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 401
        body = json.loads(response['body'])
        assert body['error']['code'] == 'AUTH_REQUIRED'
    
    @patch('profile_handler.users_table')
    def test_dynamodb_error_returns_500(self, mock_table):
        """Test that DynamoDB errors return 500 (Requirement 9.5)"""
        # Arrange
        user_id = 'error-user'
        
        # Simulate DynamoDB error
        error_response = {'Error': {'Code': 'InternalServerError', 'Message': 'DynamoDB error'}}
        mock_table.get_item.side_effect = ClientError(error_response, 'GetItem')
        
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
                            'email': 'error@example.com'
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['error']['code'] == 'INTERNAL_ERROR'
    
    def test_options_request_returns_200(self):
        """Test that OPTIONS request returns 200 for CORS preflight"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'OPTIONS',
                    'path': '/profile'
                }
            },
            'headers': {
                'origin': 'https://crm.antesdefirmar.org'
            }
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 200
        assert 'Access-Control-Allow-Origin' in response['headers']
        assert 'Access-Control-Allow-Methods' in response['headers']
    
    def test_invalid_endpoint_returns_404(self):
        """Test that invalid endpoint returns 404"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'GET',
                    'path': '/invalid'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': 'test-user'
                        }
                    }
                }
            },
            'headers': {}
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert body['error']['code'] == 'NOT_FOUND'
    
    @patch('profile_handler.users_table')
    def test_update_profile_missing_fields_returns_400(self, mock_table):
        """Test that PUT request with missing required fields returns 400"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'PUT',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': 'test-user'
                        }
                    }
                }
            },
            'headers': {},
            'body': json.dumps({'nombre': 'Test'})  # Missing 'apellido'
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['error']['code'] == 'VALIDATION_ERROR'
    
    @patch('profile_handler.users_table')
    def test_update_profile_invalid_json_returns_400(self, mock_table):
        """Test that PUT request with invalid JSON returns 400"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'PUT',
                    'path': '/profile'
                },
                'authorizer': {
                    'jwt': {
                        'claims': {
                            'sub': 'test-user'
                        }
                    }
                }
            },
            'headers': {},
            'body': 'invalid json'
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['error']['code'] == 'INVALID_JSON'


class TestProfileHandlerCORS:
    """Test CORS header handling"""
    
    def test_cors_headers_for_cloudfront_origin(self):
        """Test that CORS headers are set correctly for CloudFront origin"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'OPTIONS',
                    'path': '/profile'
                }
            },
            'headers': {
                'origin': 'https://d4srl7zbv9blh.cloudfront.net'
            }
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['headers']['Access-Control-Allow-Origin'] == 'https://d4srl7zbv9blh.cloudfront.net'
        assert response['headers']['Access-Control-Allow-Credentials'] == 'true'
    
    def test_cors_headers_for_custom_domain(self):
        """Test that CORS headers are set correctly for custom domain"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'OPTIONS',
                    'path': '/profile'
                }
            },
            'headers': {
                'origin': 'https://crm.antesdefirmar.org'
            }
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['headers']['Access-Control-Allow-Origin'] == 'https://crm.antesdefirmar.org'
    
    def test_cors_headers_for_unknown_origin(self):
        """Test that CORS headers default to CloudFront for unknown origin"""
        # Arrange
        event = {
            'requestContext': {
                'http': {
                    'method': 'OPTIONS',
                    'path': '/profile'
                }
            },
            'headers': {
                'origin': 'https://unknown.com'
            }
        }
        
        # Act
        response = lambda_handler(event, None)
        
        # Assert
        assert response['headers']['Access-Control-Allow-Origin'] == 'https://d4srl7zbv9blh.cloudfront.net'
