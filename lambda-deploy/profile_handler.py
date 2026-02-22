"""
Profile Handler Lambda Function
Handles user profile operations (GET, PUT) and profile image uploads
"""
import json
import os
import uuid
import time
from pathlib import Path
import boto3
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

table_name = os.environ.get('DYNAMODB_USERS_TABLE', 'Users')
bucket_name = os.environ.get('S3_BUCKET_NAME', 'polizalab-documents-dev')

users_table = dynamodb.Table(table_name)

# Constants
PRESIGNED_URL_EXPIRY = 300  # 5 minutes
ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

def lambda_handler(event, context):
    """Main Lambda handler"""
    print(f"Profile Handler invoked: {json.dumps(event)}")
    
    # CORS headers - Allow both CloudFront and custom domain
    origin = event.get('headers', {}).get('origin', '')
    allowed_origins = [
        'http://localhost:3000',
        'https://d4srl7zbv9blh.cloudfront.net',
        'https://crm.antesdefirmar.org'
    ]
    
    # Set CORS origin based on request origin
    cors_origin = origin if origin in allowed_origins else allowed_origins[0]
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': cors_origin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
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
            return error_response(401, 'AUTH_REQUIRED', 'Authentication required', headers)
        
        # Route to appropriate handler
        path = event.get('requestContext', {}).get('http', {}).get('path', '')
        
        if path == '/profile' and http_method == 'GET':
            return handle_get_profile(user_id, headers, event)
        
        if path == '/profile' and http_method == 'PUT':
            return handle_update_profile(user_id, event, headers)
        
        if path == '/profile/image' and http_method == 'POST':
            return handle_image_upload(user_id, event, headers)
        
        return error_response(404, 'NOT_FOUND', 'Endpoint not found', headers)
        
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return error_response(500, 'INTERNAL_ERROR', 'An unexpected error occurred', headers)

def error_response(status_code, error_code, message, headers):
    """Helper to build consistent error responses"""
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps({
            'error': {
                'code': error_code,
                'message': message
            }
        })
    }

def parse_body(event):
    """Helper to parse request body"""
    try:
        body_str = event.get('body', '{}')
        return json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        return None

def get_file_extension(filename):
    """Extract file extension from filename"""
    if not filename:
        return ''
    return Path(filename).suffix.lstrip('.')

def handle_get_profile(user_id, headers, event=None):
    """Handle GET /profile with idempotent profile creation and image URL generation"""
    try:
        response = users_table.get_item(Key={'userId': user_id})
        
        if 'Item' not in response:
            # Profile doesn't exist, create default profile from Cognito claims
            print(f"Profile not found for user {user_id}, creating default profile")
            
            # Extract email and name from Cognito JWT claims
            claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {}) if event else {}
            email = claims.get('email', '')
            name = claims.get('name', email)  # Fallback to email if name not available
            
            # Create default profile
            default_profile = {
                'userId': user_id,
                'email': email,
                'nombre': name,
                'apellido': '',
                'phone': '',
                'company': '',
                'createdAt': int(time.time())
            }
            
            # Idempotent put - only create if doesn't exist
            try:
                users_table.put_item(
                    Item=default_profile,
                    ConditionExpression='attribute_not_exists(userId)'
                )
                print(f"Default profile created for user {user_id}")
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps(default_profile, default=str)
                }
                
            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    # Profile was created by another concurrent request, fetch it
                    print(f"Profile already exists for user {user_id}, fetching it")
                    response = users_table.get_item(Key={'userId': user_id})
                    
                    if 'Item' not in response:
                        return error_response(404, 'PROFILE_NOT_FOUND', 'Profile not found', headers)
                
                else:
                    # Re-raise if it's a different error
                    raise
        
        # Convert None values to null for JSON
        item = response['Item']
        for key, value in item.items():
            if value is None:
                item[key] = None
        
        # Generate presigned GET URL if profileImageKey exists
        if item.get('profileImageKey'):
            try:
                profile_image_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': bucket_name,
                        'Key': item['profileImageKey']
                    },
                    ExpiresIn=PRESIGNED_URL_EXPIRY
                )
                item['profileImageUrl'] = profile_image_url
                item['profileImageUrlExpiresIn'] = PRESIGNED_URL_EXPIRY
                print(f"Generated presigned GET URL for user {user_id}")
            except Exception as e:
                print(f"Error generating presigned URL: {str(e)}")
                # Don't fail the request, just omit the URL
                item['profileImageUrl'] = None
        else:
            item['profileImageUrl'] = None
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(item, default=str)
        }
        
    except Exception as e:
        print(f"Error in handle_get_profile: {str(e)}")
        return error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve profile', headers)

def handle_update_profile(user_id, event, headers):
    """Handle PUT /profile - PATCH semantics, update only provided fields"""
    try:
        body = parse_body(event)
        if body is None:
            return error_response(400, 'INVALID_JSON', 'Invalid JSON in request body', headers)
        
        # Extract fields
        nombre = body.get('nombre')
        apellido = body.get('apellido')
        profile_image_key = body.get('profileImageKey')
        
        # Build update expression dynamically
        update_parts = []
        expr_attr_values = {}
        
        if nombre is not None:
            update_parts.append('nombre = :nombre')
            expr_attr_values[':nombre'] = nombre
        
        if apellido is not None:
            update_parts.append('apellido = :apellido')
            expr_attr_values[':apellido'] = apellido
        
        if profile_image_key is not None:
            update_parts.append('profileImageKey = :profileImageKey')
            update_parts.append('profileImageUpdatedAt = :profileImageUpdatedAt')
            expr_attr_values[':profileImageKey'] = profile_image_key
            expr_attr_values[':profileImageUpdatedAt'] = int(time.time())
        
        # Validate at least one field provided
        if not update_parts:
            return error_response(400, 'VALIDATION_ERROR', 'At least one field must be provided', headers)
        
        # Validate nombre and apellido if both are being set
        if nombre is not None and apellido is not None:
            if not nombre or not apellido:
                return error_response(400, 'VALIDATION_ERROR', 'nombre and apellido cannot be empty', headers)
        
        # Update user profile
        update_expression = 'SET ' + ', '.join(update_parts)
        
        users_table.update_item(
            Key={'userId': user_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expr_attr_values
        )
        
        print(f"Profile updated for user {user_id}: {list(body.keys())}")
        
        # Return updated profile
        return handle_get_profile(user_id, headers)
        
    except json.JSONDecodeError:
        return error_response(400, 'INVALID_JSON', 'Invalid JSON in request body', headers)
    except Exception as e:
        print(f"Error in handle_update_profile: {str(e)}")
        return error_response(500, 'INTERNAL_ERROR', 'Failed to update profile', headers)

def handle_image_upload(user_id, event, headers):
    """Handle POST /profile/image - Generate pre-signed URL and persist metadata"""
    try:
        body = parse_body(event)
        if body is None:
            return error_response(400, 'INVALID_JSON', 'Invalid JSON in request body', headers)
        
        file_name = body.get('fileName')
        content_type = body.get('contentType') or body.get('fileType')
        
        # Validate required fields
        if not file_name:
            return error_response(400, 'VALIDATION_ERROR', 'fileName is required', headers)
        
        if not content_type:
            return error_response(400, 'VALIDATION_ERROR', 'contentType is required', headers)
        
        # Validate content type is an image
        if not content_type.startswith('image/'):
            return error_response(400, 'INVALID_FILE_TYPE', 'Only image files are allowed', headers)
        
        # Validate file type is in allowed list
        if content_type not in ALLOWED_IMAGE_TYPES:
            return error_response(
                400,
                'INVALID_FILE_TYPE',
                f'Only {", ".join(ALLOWED_IMAGE_TYPES)} images are allowed',
                headers
            )
        
        # Generate unique S3 key with UUID to prevent cache collisions
        file_ext = get_file_extension(file_name)
        unique_id = str(uuid.uuid4())
        s3_key = f"profiles/{user_id}/{unique_id}.{file_ext}" if file_ext else f"profiles/{user_id}/{unique_id}"
        
        # Generate pre-signed PUT URL
        try:
            presigned_url = s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': bucket_name,
                    'Key': s3_key,
                    'ContentType': content_type
                },
                ExpiresIn=PRESIGNED_URL_EXPIRY
            )
        except Exception as e:
            print(f"Error generating presigned URL: {str(e)}")
            return error_response(500, 'S3_ERROR', 'Failed to generate upload URL', headers)
        
        # Persist image metadata to DynamoDB
        try:
            current_time = int(time.time())
            users_table.update_item(
                Key={'userId': user_id},
                UpdateExpression='SET profileImageKey = :key, profileImageUpdatedAt = :updatedAt, profileImageContentType = :contentType, profileImageFileName = :fileName',
                ExpressionAttributeValues={
                    ':key': s3_key,
                    ':updatedAt': current_time,
                    ':contentType': content_type,
                    ':fileName': file_name
                }
            )
            print(f"Image metadata saved for user {user_id}: {s3_key}")
        except Exception as e:
            print(f"Error saving image metadata: {str(e)}")
            return error_response(500, 'DB_ERROR', 'Failed to save image metadata', headers)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'presignedUrl': presigned_url,
                's3Key': s3_key,
                'expiresIn': PRESIGNED_URL_EXPIRY
            })
        }
        
    except Exception as e:
        print(f"Error in handle_image_upload: {str(e)}")
        return error_response(500, 'INTERNAL_ERROR', 'Failed to generate upload URL', headers)
