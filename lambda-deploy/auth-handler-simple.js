// Auth Handler Lambda - Versión simplificada para despliegue rápido
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || 'Users';

exports.handler = async (event) => {
    console.log('Auth Handler invoked', JSON.stringify(event));
    
    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };
    
    try {
        // Handle OPTIONS for CORS preflight
        if (event.requestContext.http.method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers,
                body: ''
            };
        }
        
        // Handle POST /auth/register
        if (event.requestContext.http.path === '/auth/register' && event.requestContext.http.method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            
            if (!body.cognitoUserId || !body.email) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'cognitoUserId and email are required'
                        }
                    })
                };
            }
            
            const userRecord = {
                userId: body.cognitoUserId,
                email: body.email,
                nombre: null,
                apellido: null,
                profileImage: null,
                createdAt: new Date().toISOString()
            };
            
            try {
                await docClient.send(new PutCommand({
                    TableName: USERS_TABLE,
                    Item: userRecord,
                    ConditionExpression: 'attribute_not_exists(userId)'
                }));
                
                return {
                    statusCode: 201,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        userId: userRecord.userId
                    })
                };
            } catch (error) {
                if (error.name === 'ConditionalCheckFailedException') {
                    return {
                        statusCode: 409,
                        headers,
                        body: JSON.stringify({
                            error: {
                                code: 'USER_EXISTS',
                                message: 'User already exists'
                            }
                        })
                    };
                }
                throw error;
            }
        }
        
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: {
                    code: 'NOT_FOUND',
                    message: 'Endpoint not found'
                }
            })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'An unexpected error occurred'
                }
            })
        };
    }
};
