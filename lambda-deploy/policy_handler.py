import json
import boto3
import os
from datetime import datetime, timedelta
from decimal import Decimal
import uuid

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

POLICIES_TABLE = os.environ.get('DYNAMODB_POLICIES_TABLE', 'Policies')
S3_BUCKET = os.environ.get('S3_BUCKET_NAME', 'polizalab-documents-dev')

policies_table = dynamodb.Table(POLICIES_TABLE)


def decimal_default(obj):
    """JSON serializer for Decimal objects"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def extract_user_id(event):
    """Extract userId from JWT token"""
    # Try Cognito authorizer context first
    try:
        return event['requestContext']['authorizer']['jwt']['claims']['sub']
    except (KeyError, TypeError):
        pass
    
    # Fallback to Authorization header
    try:
        auth_header = event['headers'].get('Authorization') or event['headers'].get('authorization')
        if not auth_header:
            return None
        
        token = auth_header.replace('Bearer ', '')
        import base64
        payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
        return payload.get('sub')
    except Exception:
        return None


def calculate_renewal_date(tipo_poliza, fecha_inicio):
    """Calculate renewal date (12 months for most types, null for Vida permanente)"""
    if not tipo_poliza or not fecha_inicio:
        return None
    
    if tipo_poliza == 'Vida permanente':
        return None
    
    try:
        start_date = datetime.strptime(fecha_inicio, '%Y-%m-%d')
        # Add 12 months
        renewal_date = start_date.replace(year=start_date.year + 1)
        return renewal_date.strftime('%Y-%m-%d')
    except Exception:
        return None


def calculate_renewal_status(fecha_renovacion):
    """Calculate renewal status based on days until renewal"""
    if not fecha_renovacion:
        return 'NOT_URGENT'
    
    try:
        renewal_date = datetime.strptime(fecha_renovacion, '%Y-%m-%d')
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        days_until_renewal = (renewal_date - today).days
        
        if days_until_renewal < 0:
            return 'OVERDUE'
        elif days_until_renewal <= 30:
            return '30_DAYS'
        elif days_until_renewal <= 60:
            return '60_DAYS'
        elif days_until_renewal <= 90:
            return '90_DAYS'
        else:
            return 'NOT_URGENT'
    except Exception:
        return 'NOT_URGENT'


def list_policies(user_id):
    """GET /policies - List user's policies"""
    try:
        response = policies_table.query(
            IndexName='userId-index',
            KeyConditionExpression='userId = :userId',
            ExpressionAttributeValues={':userId': user_id},
            ScanIndexForward=False,  # Sort by createdAt DESC
            Limit=10
        )
        
        policies = response.get('Items', [])
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'policies': policies}, default=decimal_default)
        }
    except Exception as e:
        print(f'Error listing policies: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }


def get_policy(user_id, policy_id):
    """GET /policies/:id - Get single policy"""
    try:
        response = policies_table.get_item(Key={'policyId': policy_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Policy not found'})
            }
        
        policy = response['Item']
        
        # Authorization check
        if policy.get('userId') != user_id:
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Forbidden'})
            }
        
        # Recalculate renewal status
        policy['renewalStatus'] = calculate_renewal_status(policy.get('fechaRenovacion'))
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(policy, default=decimal_default)
        }
    except Exception as e:
        print(f'Error getting policy: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }


def update_policy(user_id, policy_id, updates):
    """PUT /policies/:id - Update policy"""
    try:
        # First, get the policy to verify ownership
        response = policies_table.get_item(Key={'policyId': policy_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Policy not found'})
            }
        
        policy = response['Item']
        
        # Authorization check
        if policy.get('userId') != user_id:
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Forbidden'})
            }
        
        # Recalculate fechaRenovacion if fechaInicio or tipoPoliza changed
        if 'fechaInicio' in updates or 'tipoPoliza' in updates:
            new_fecha_inicio = updates.get('fechaInicio', policy.get('fechaInicio'))
            new_tipo_poliza = updates.get('tipoPoliza', policy.get('tipoPoliza'))
            updates['fechaRenovacion'] = calculate_renewal_date(new_tipo_poliza, new_fecha_inicio)
        
        # Build update expression
        update_expressions = []
        expression_attribute_names = {}
        expression_attribute_values = {}
        
        allowed_fields = [
            'clienteNombre', 'clienteApellido', 'edad', 'tipoPoliza',
            'cobertura', 'numeroPoliza', 'aseguradora', 'fechaInicio',
            'fechaFin', 'fechaRenovacion'
        ]
        
        for field in allowed_fields:
            if field in updates:
                update_expressions.append(f'#{field} = :{field}')
                expression_attribute_names[f'#{field}'] = field
                expression_attribute_values[f':{field}'] = updates[field]
        
        # Always update updatedAt
        update_expressions.append('#updatedAt = :updatedAt')
        expression_attribute_names['#updatedAt'] = 'updatedAt'
        expression_attribute_values[':updatedAt'] = datetime.utcnow().isoformat()
        
        # Update the policy
        response = policies_table.update_item(
            Key={'policyId': policy_id},
            UpdateExpression='SET ' + ', '.join(update_expressions),
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues='ALL_NEW'
        )
        
        updated_policy = response['Attributes']
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': True,
                'policy': updated_policy
            }, default=decimal_default)
        }
    except Exception as e:
        print(f'Error updating policy: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }


def get_upcoming_renewals(user_id):
    """GET /policies/renewals - Get upcoming renewals"""
    try:
        response = policies_table.query(
            IndexName='userId-index',
            KeyConditionExpression='userId = :userId',
            ExpressionAttributeValues={':userId': user_id}
        )
        
        policies = response.get('Items', [])
        
        # Recalculate renewal status for each policy
        for policy in policies:
            policy['renewalStatus'] = calculate_renewal_status(policy.get('fechaRenovacion'))
        
        # Filter for urgent renewals
        urgent_policies = [
            p for p in policies
            if p.get('renewalStatus') in ['30_DAYS', '60_DAYS', '90_DAYS']
        ]
        
        # Sort by fechaRenovacion ascending
        urgent_policies.sort(key=lambda p: p.get('fechaRenovacion') or '9999-12-31')
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'renewals': urgent_policies}, default=decimal_default)
        }
    except Exception as e:
        print(f'Error getting renewals: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }


def get_document_upload_url(user_id, body):
    """POST /policies/upload-url - Generate pre-signed URL"""
    try:
        file_name = body.get('fileName')
        file_type = body.get('fileType')
        
        if not file_name or not file_type:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'fileName and fileType are required'})
            }
        
        s3_key = f'policies/{user_id}/{str(uuid.uuid4())}/{file_name}'
        
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': s3_key,
                'ContentType': file_type
            },
            ExpiresIn=300  # 5 minutes
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'presignedUrl': presigned_url,
                's3Key': s3_key
            })
        }
    except Exception as e:
        print(f'Error generating upload URL: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }


def lambda_handler(event, context):
    """Main Lambda handler"""
    print(f'Event: {json.dumps(event)}')
    
    try:
        user_id = extract_user_id(event)
        
        if not user_id:
            return {
                'statusCode': 401,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Unauthorized'})
            }
        
        method = event['httpMethod']
        path = event['path']
        
        # Route requests
        if method == 'GET' and path == '/policies':
            return list_policies(user_id)
        
        if method == 'GET' and path == '/policies/renewals':
            return get_upcoming_renewals(user_id)
        
        if method == 'GET' and path.startswith('/policies/'):
            policy_id = event.get('pathParameters', {}).get('id')
            if policy_id:
                return get_policy(user_id, policy_id)
        
        if method == 'PUT' and path.startswith('/policies/'):
            policy_id = event.get('pathParameters', {}).get('id')
            if policy_id:
                body = json.loads(event.get('body', '{}'))
                return update_policy(user_id, policy_id, body)
        
        if method == 'POST' and path == '/policies/upload-url':
            body = json.loads(event.get('body', '{}'))
            return get_document_upload_url(user_id, body)
        
        return {
            'statusCode': 404,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Not found'})
        }
    
    except Exception as e:
        print(f'Error: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
