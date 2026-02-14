"""
Profile Handler Lambda Function
Handles user profile operations (GET, PUT) and profile image uploads
"""
import json
import os
import boto3
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

table_name = os.environ.get('DYNAMODB_USERS_TABLE', 'Users')
bucket_name = os.environ.get('S3_BUCKET_NAME', 'polizalab-documents-dev')

users_table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """Main Lambda handler"""
    print(f"Profile Handler invoked: {json.dumps(event)}")
    
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
        
        # Extract userId from JWT token
        user_id = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {}).get('sub')
        
        if not user_id:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({
                    'error': {
                        'code': 'AUTH_REQUIRED',
                        'message': 'Authentication required'
                    }
                })
            }
        
        # Route to appropriate handler
        path = event.get('requestContext', {}).get('http', {}).get('path', '')
        
        if path == '/profile' and http_method == 'GET':
            return handle_get_profile(user_id, headers)
        
        if path == '/profile' and http_method == 'PUT':
            return handle_update_profile(user_id, event, headers)
        
        if path == '/profile/image' and http_method == 'POST':
            return handle_image_upload(user_id, event, headers)
        
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

def handle_get_profile(user_id, headers):
    """Handle GET /profile"""
    try:
        response = users_table.get_item(Key={'userId': user_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({
                    'error': {
                        'code': 'NOT_FOUND',
                        'message': 'User profile not found'
                    }
                })
            }
        
        # Convert None values to null for JSON
        item = response['Item']
        for key, value in item.items():
            if value is None:
                item[key] = None
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(item, default=str)
        }
        
    except Exception as e:
        print(f"Error in handle_get_profile: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'Failed to retrieve profile'
                }
            })
        }

def handle_update_profile(user_id, event, headers):
    """Handle PUT /profile"""
    try:
        body = json.loads(event.get('body', '{}'))
        
        nombre = body.get('nombre')
        apellido = body.get('apellido')
        
        if not nombre or not apellido:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'nombre and apellido are required'
                    }
                })
            }
        
        # Update user profile
        users_table.update_item(
            Key={'userId': user_id},
            UpdateExpression='SET nombre = :nombre, apellido = :apellido',
            ExpressionAttributeValues={
                ':nombre': nombre,
                ':apellido': apellido
            }
        )
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'success': True})
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
        print(f"Error in handle_update_profile: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'Failed to update profile'
                }
            })
        }

def handle_image_upload(user_id, event, headers):
    """Handle POST /profile/image - Generate pre-signed URL"""
    try:
        body = json.loads(event.get('body', '{}'))
        
        file_name = body.get('fileName')
        file_type = body.get('fileType')
        
        if not file_name or not file_type:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'fileName and fileType are required'
                    }
                })
            }
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file_type not in allowed_types:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': {
                        'code': 'INVALID_FILE_TYPE',
                        'message': 'Only JPEG, PNG, and WebP images are allowed'
                    }
                })
            }
        
        # Generate S3 key
        s3_key = f"profiles/{user_id}/{file_name}"
        
        # Generate pre-signed URL
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ContentType': file_type
            },
            ExpiresIn=300  # 5 minutes
        )
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'presignedUrl': presigned_url,
                's3Key': s3_key
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
        print(f"Error in handle_image_upload: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'Failed to generate upload URL'
                }
            })
        }
