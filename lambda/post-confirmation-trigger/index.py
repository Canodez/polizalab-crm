"""
Cognito Post-Confirmation Trigger
Creates user profile in DynamoDB after email confirmation
"""

import json
import boto3
import os
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('USERS_TABLE', 'Users')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """
    Cognito Post-Confirmation Trigger Handler
    
    This function is triggered after a user confirms their email.
    It creates a user profile in DynamoDB with basic information.
    
    Event structure:
    {
        "triggerSource": "PostConfirmation_ConfirmSignUp",
        "request": {
            "userAttributes": {
                "sub": "user-uuid",
                "email": "user@example.com",
                "email_verified": "true"
            }
        },
        "userName": "user-uuid"
    }
    """
    
    print(f"Post-confirmation trigger event: {json.dumps(event)}")
    
    try:
        # Extract user information from Cognito event
        user_attributes = event['request']['userAttributes']
        user_id = user_attributes['sub']
        email = user_attributes.get('email', '')
        
        # Create timestamp
        now = datetime.utcnow().isoformat() + 'Z'
        
        # Create user profile in DynamoDB
        item = {
            'userId': user_id,
            'email': email,
            'nombre': None,  # Will be filled by user later
            'apellido': None,  # Will be filled by user later
            'profileImage': None,  # Will be uploaded by user later
            'createdAt': now,
            'updatedAt': now
        }
        
        # Put item in DynamoDB
        table.put_item(Item=item)
        
        print(f"Successfully created profile for user {user_id}")
        
    except Exception as e:
        print(f"Error creating user profile: {str(e)}")
        # Don't fail the confirmation process if profile creation fails
        # The user can still login, and profile can be created later
    
    # Always return the event to Cognito
    # This is required for the trigger to work properly
    return event
