"""
Auth Handler Lambda Function
Handles user registration by creating a user record in DynamoDB
"""
import json
import os
from datetime import datetime
import boto3
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_USERS_TABLE', 'Users')
users_table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """Main Lambda handler"""
    print(f"Auth Handler invoked: {json.dumps(event)}")
    
    # CORS headers
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }
    
    try:
        # Handle OPTIONS for CORS preflight
        http_method = event.get('requestContext', {}).get('http', {}).get('method', '')
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': ''
            }
        
        # Handle POST /auth/register
        path = event.get('requestContext', {}).get('http', {}).get('path', '')
        if path == '/auth/register' and http_method == 'POST':
            return handle_register(event, headers)
        
        return {
            'statusCode': 404,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'NOT_FOUND',
                    'message': 'Endpoint not found'
                }
            })
        }
        
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'An unexpected error occurred'
                }
            })
        }

def handle_register(event, headers):
    """Handle POST /auth/register"""
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        
        # Validate required fields
        cognito_user_id = body.get('cognitoUserId')
        email = body.get('email')
        
        if not cognito_user_id or not email:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'cognitoUserId and email are required'
                    }
                })
            }
        
        # Create user record
        user_record = {
            'userId': cognito_user_id,
            'email': email,
            'nombre': None,
            'apellido': None,
            'profileImage': None,
            'createdAt': datetime.utcnow().isoformat() + 'Z'
        }
        
        print(f"Creating user record: {cognito_user_id}")
        
        # Put item with condition to prevent duplicates
        try:
            users_table.put_item(
                Item=user_record,
                ConditionExpression='attribute_not_exists(userId)'
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return {
                    'statusCode': 409,
                    'headers': headers,
                    'body': json.dumps({
                        'error': {
                            'code': 'USER_EXISTS',
                            'message': 'User already exists'
                        }
                    })
                }
            raise
        
        print(f"User record created successfully: {cognito_user_id}")
        
        return {
            'statusCode': 201,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'userId': cognito_user_id
            })
        }
        
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'INVALID_JSON',
                    'message': 'Invalid JSON in request body'
                }
            })
        }
    except Exception as e:
        print(f"Error in handle_register: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'Failed to create user record'
                }
            })
        }
