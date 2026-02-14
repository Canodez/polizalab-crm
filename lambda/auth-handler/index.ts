import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE || 'Users';

interface RegisterRequestBody {
  cognitoUserId: string;
  email: string;
}

/**
 * Auth Handler Lambda Function
 * Handles user registration by creating a user record in DynamoDB
 * after successful Cognito registration
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Auth Handler invoked', { path: event.path, method: event.httpMethod });

  try {
    // Route to appropriate handler
    if (event.path === '/auth/register' && event.httpMethod === 'POST') {
      return await handleRegister(event);
    }

    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
        },
      }),
    };
  } catch (error) {
    console.error('Unhandled error in Auth Handler', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      }),
    };
  }
};

/**
 * Handle POST /auth/register
 * Creates a user record in DynamoDB after Cognito registration
 */
async function handleRegister(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body is required',
          },
        }),
      };
    }

    const body: RegisterRequestBody = JSON.parse(event.body);

    // Validate required fields
    if (!body.cognitoUserId || !body.email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'cognitoUserId and email are required',
            details: {
              cognitoUserId: !body.cognitoUserId ? 'Required' : undefined,
              email: !body.email ? 'Required' : undefined,
            },
          },
        }),
      };
    }

    // Create user record in DynamoDB
    const userRecord = {
      userId: body.cognitoUserId,
      email: body.email,
      nombre: null,
      apellido: null,
      profileImage: null,
      createdAt: new Date().toISOString(),
    };

    console.log('Creating user record', { userId: userRecord.userId });

    await docClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: userRecord,
        // Prevent overwriting existing user records
        ConditionExpression: 'attribute_not_exists(userId)',
      })
    );

    console.log('User record created successfully', { userId: userRecord.userId });

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        userId: userRecord.userId,
      }),
    };
  } catch (error: any) {
    console.error('Error in handleRegister', error);

    // Handle duplicate user (ConditionalCheckFailedException)
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'USER_EXISTS',
            message: 'User already exists',
          },
        }),
      };
    }

    // Handle DynamoDB errors
    if (error.name === 'ResourceNotFoundException') {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Database table not found',
          },
        }),
      };
    }

    // Generic error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create user record',
        },
      }),
    };
  }
}
