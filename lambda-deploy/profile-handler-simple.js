// Profile Handler Lambda - Versión simplificada
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || 'Users';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'polizalab-documents-dev';

exports.handler = async (event) => {
    console.log('Profile Handler invoked', JSON.stringify(event));
    
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };
    
    try {
        // Handle OPTIONS for CORS
        if (event.requestContext.http.method === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }
        
        // Extract userId from JWT token
        const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
        
        if (!userId) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                    error: {
                        code: 'AUTH_REQUIRED',
                        message: 'Authentication required'
                    }
                })
            };
        }
        
        const path = event.requestContext.http.path;
        const method = event.requestContext.http.method;
        
        // GET /profile
        if (path === '/profile' && method === 'GET') {
            const result = await docClient.send(new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId }
            }));
            
            if (!result.Item) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({
                        error: {
                            code: 'NOT_FOUND',
                            message: 'User profile not found'
                        }
                    })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result.Item)
            };
        }
        
        // PUT /profile
        if (path === '/profile' && method === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            
            if (!body.nombre || !body.apellido) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'nombre and apellido are required'
                        }
                    })
                };
            }
            
            await docClient.send(new UpdateCommand({
                TableName: USERS_TABLE,
                Key: { userId },
                UpdateExpression: 'SET nombre = :nombre, apellido = :apellido',
                ExpressionAttributeValues: {
                    ':nombre': body.nombre,
                    ':apellido': body.apellido
                }
            }));
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }
        
        // POST /profile/image
        if (path === '/profile/image' && method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            
            if (!body.fileName || !body.fileType) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'fileName and fileType are required'
                        }
                    })
                };
            }
            
            const s3Key = `profiles/${userId}/${body.fileName}`;
            
            const command = new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: s3Key,
                ContentType: body.fileType
            });
            
            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    presignedUrl,
                    s3Key
                })
            };
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
