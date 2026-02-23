import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const S3_BUCKET = process.env.S3_BUCKET || 'polizalab-documents-dev';
const PRESIGNED_URL_EXPIRATION = 300; // 5 minutes

interface UpdateProfileRequestBody {
  nombre?: string;
  apellido?: string;
  profileImageUrl?: string;
  preferredLanguage?: string;
  timeZone?: string;
  emailNotificationsEnabled?: boolean;
}

interface ProfileImageRequestBody {
  fileName: string;
  fileType?: string;      // legacy field name
  contentType?: string;  // field name used by the frontend
}

/**
 * Profile Handler Lambda Function
 * Handles user profile operations including get, update, and profile image upload
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Support both REST API v1 (event.path/httpMethod) and HTTP API v2 (event.rawPath/requestContext.http.method)
  const path = event.path || (event as any).rawPath || '';
  const method = event.httpMethod || (event as any).requestContext?.http?.method || '';

  console.log('Profile Handler invoked', {
    path,
    method,
    headers: event.headers
  });

  try {
    // Extract userId from JWT token
    const userId = extractUserIdFromToken(event);
    if (!userId) {
      return createErrorResponse(401, 'AUTH_REQUIRED', 'Authentication token is required');
    }

    // Route to appropriate handler
    if (path === '/profile' && method === 'GET') {
      return await handleGetProfile(userId, event);
    }

    if (path === '/profile' && method === 'PUT') {
      return await handleUpdateProfile(userId, event);
    }

    if (path === '/profile/image' && method === 'POST') {
      return await handleGetImageUploadUrl(userId, event);
    }

    return createErrorResponse(404, 'NOT_FOUND', 'Endpoint not found');
  } catch (error) {
    console.error('Unhandled error in Profile Handler', error);
    return createErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};

/**
 * Extract userId from JWT token in Authorization header
 */
function extractUserIdFromToken(event: APIGatewayProxyEvent): string | null {
  try {
    // REST API v1 (Cognito authorizer): requestContext.authorizer.claims.sub
    // HTTP API v2 (JWT authorizer): requestContext.authorizer.jwt.claims.sub
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      (event.requestContext?.authorizer as any)?.jwt?.claims?.sub;

    if (userId) {
      return userId;
    }

    // Fallback: parse JWT token manually (for testing or custom authorizer)
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return null;
    }

    // Decode JWT payload (base64 decode the middle part)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub || null;
  } catch (error) {
    console.error('Error extracting userId from token', error);
    return null;
  }
}

/**
 * Handle GET /profile
 * Retrieves user profile data from DynamoDB
 * Also updates lastLoginAt timestamp on each access
 */
async function handleGetProfile(userId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    console.log('Getting profile', { userId });

    const result = await docClient.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId },
      })
    );

    if (!result.Item) {
      return createErrorResponse(404, 'NOT_FOUND', 'User profile not found');
    }

    // Update lastLoginAt and deviceInfo asynchronously (don't wait for it)
    const now = new Date().toISOString();
    const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || '';
    docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'SET lastLoginAt = :lastLoginAt, deviceInfo = :deviceInfo',
        ExpressionAttributeValues: {
          ':lastLoginAt': now,
          ':deviceInfo': userAgent,
        },
      })
    ).catch(error => {
      // Log error but don't fail the request
      console.error('Failed to update lastLoginAt', { userId, error });
    });

    console.log('Profile retrieved successfully', { userId });

    // Convert profileImage S3 key to a presigned GET URL (24h expiry)
    const profileData = { ...result.Item };
    if (profileData.profileImage) {
      profileData.profileImageUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: profileData.profileImage }),
        { expiresIn: 86400 }
      );
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(profileData),
    };
  } catch (error: any) {
    console.error('Error in handleGetProfile', error);

    if (error.name === 'ResourceNotFoundException') {
      return createErrorResponse(500, 'INTERNAL_ERROR', 'Database table not found');
    }

    return createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to retrieve profile');
  }
}

/**
 * Handle PUT /profile
 * Updates user profile fields (nombre, apellido)
 */
async function handleUpdateProfile(
  userId: string,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return createErrorResponse(400, 'VALIDATION_ERROR', 'Request body is required');
    }

    const body: UpdateProfileRequestBody = JSON.parse(event.body);

    // Validate that at least one field is provided
    if (
      body.nombre === undefined &&
      body.apellido === undefined &&
      body.profileImageUrl === undefined &&
      body.preferredLanguage === undefined &&
      body.timeZone === undefined &&
      body.emailNotificationsEnabled === undefined
    ) {
      return createErrorResponse(
        400,
        'VALIDATION_ERROR',
        'At least one field is required'
      );
    }

    // Validate profileImageUrl if provided
    if (body.profileImageUrl !== undefined && body.profileImageUrl !== null && body.profileImageUrl !== '') {
      const isValidS3Url = validateS3Url(body.profileImageUrl, S3_BUCKET);
      if (!isValidS3Url) {
        return createErrorResponse(
          400,
          'VALIDATION_ERROR',
          'Invalid profileImageUrl. Must be a valid S3 URL from the configured bucket',
          {
            profileImageUrl: `Must be a URL from bucket: ${S3_BUCKET}`,
          }
        );
      }
    }

    console.log('Updating profile', { userId, updates: body });

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (body.nombre !== undefined) {
      updateExpressions.push('#nombre = :nombre');
      expressionAttributeNames['#nombre'] = 'nombre';
      expressionAttributeValues[':nombre'] = body.nombre;
    }

    if (body.apellido !== undefined) {
      updateExpressions.push('#apellido = :apellido');
      expressionAttributeNames['#apellido'] = 'apellido';
      expressionAttributeValues[':apellido'] = body.apellido;
    }

    if (body.profileImageUrl !== undefined) {
      updateExpressions.push('#profileImageUrl = :profileImageUrl');
      expressionAttributeNames['#profileImageUrl'] = 'profileImageUrl';
      expressionAttributeValues[':profileImageUrl'] = body.profileImageUrl;
    }

    if (body.preferredLanguage !== undefined) {
      updateExpressions.push('#preferredLanguage = :preferredLanguage');
      expressionAttributeNames['#preferredLanguage'] = 'preferredLanguage';
      expressionAttributeValues[':preferredLanguage'] = body.preferredLanguage;
    }

    if (body.timeZone !== undefined) {
      updateExpressions.push('#timeZone = :timeZone');
      expressionAttributeNames['#timeZone'] = 'timeZone';
      expressionAttributeValues[':timeZone'] = body.timeZone;
    }

    if (body.emailNotificationsEnabled !== undefined) {
      updateExpressions.push('#emailNotificationsEnabled = :emailNotificationsEnabled');
      expressionAttributeNames['#emailNotificationsEnabled'] = 'emailNotificationsEnabled';
      expressionAttributeValues[':emailNotificationsEnabled'] = body.emailNotificationsEnabled;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        // Ensure the user exists before updating
        ConditionExpression: 'attribute_exists(userId)',
      })
    );

    console.log('Profile updated successfully', { userId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
      }),
    };
  } catch (error: any) {
    console.error('Error in handleUpdateProfile', error);

    if (error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'NOT_FOUND', 'User profile not found');
    }

    if (error.name === 'ResourceNotFoundException') {
      return createErrorResponse(500, 'INTERNAL_ERROR', 'Database table not found');
    }

    return createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to update profile');
  }
}

/**
 * Handle POST /profile/image
 * Generates a pre-signed URL for profile image upload to S3
 */
async function handleGetImageUploadUrl(
  userId: string,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return createErrorResponse(400, 'VALIDATION_ERROR', 'Request body is required');
    }

    const body: ProfileImageRequestBody = JSON.parse(event.body);

    // Accept either contentType (frontend) or fileType (legacy)
    const resolvedContentType = body.contentType || body.fileType;

    // Validate required fields
    if (!body.fileName || !resolvedContentType) {
      return createErrorResponse(
        400,
        'VALIDATION_ERROR',
        'fileName and contentType are required',
        {
          fileName: !body.fileName ? 'Required' : undefined,
          contentType: !resolvedContentType ? 'Required' : undefined,
        }
      );
    }

    // Validate file type (JPEG, PNG, WebP)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(resolvedContentType.toLowerCase())) {
      return createErrorResponse(
        400,
        'VALIDATION_ERROR',
        'Invalid file type. Only JPEG, PNG, and WebP are supported',
        {
          fileType: `Must be one of: ${allowedTypes.join(', ')}`,
        }
      );
    }

    // Generate S3 key: profiles/{userId}/{fileName}
    const s3Key = `profiles/${userId}/${body.fileName}`;

    console.log('Generating pre-signed URL', { userId, s3Key, contentType: resolvedContentType });

    // Generate pre-signed URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      ContentType: resolvedContentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    // Update user profile with new profileImage S3 key
    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'SET profileImage = :profileImage',
        ExpressionAttributeValues: {
          ':profileImage': s3Key,
        },
        ConditionExpression: 'attribute_exists(userId)',
      })
    );

    console.log('Pre-signed URL generated and profile updated', { userId, s3Key });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        presignedUrl,
        s3Key,
      }),
    };
  } catch (error: any) {
    console.error('Error in handleGetImageUploadUrl', error);

    if (error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'NOT_FOUND', 'User profile not found');
    }

    if (error.name === 'ResourceNotFoundException') {
      return createErrorResponse(500, 'INTERNAL_ERROR', 'Database table not found');
    }

    return createErrorResponse(500, 'INTERNAL_ERROR', 'Failed to generate upload URL');
  }
}

/**
 * Validate S3 URL
 * Ensures the URL is from the expected S3 bucket
 */
function validateS3Url(url: string, expectedBucket: string): boolean {
  try {
    // Check if it's a valid URL
    const parsedUrl = new URL(url);
    
    // Accept S3 URLs in these formats:
    // 1. https://bucket-name.s3.amazonaws.com/key
    // 2. https://bucket-name.s3.region.amazonaws.com/key
    // 3. https://s3.amazonaws.com/bucket-name/key
    // 4. https://s3.region.amazonaws.com/bucket-name/key
    
    const hostname = parsedUrl.hostname;
    
    // Format 1 & 2: bucket-name.s3[.region].amazonaws.com
    if (hostname.startsWith(`${expectedBucket}.s3.`) && hostname.endsWith('.amazonaws.com')) {
      return true;
    }
    
    if (hostname === `${expectedBucket}.s3.amazonaws.com`) {
      return true;
    }
    
    // Format 3 & 4: s3[.region].amazonaws.com/bucket-name/...
    if ((hostname.startsWith('s3.') || hostname === 's3.amazonaws.com') && 
        hostname.endsWith('.amazonaws.com')) {
      const pathParts = parsedUrl.pathname.split('/').filter(p => p);
      if (pathParts.length > 0 && pathParts[0] === expectedBucket) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper function to create consistent error responses
 */
function createErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, any>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      error: {
        code,
        message,
        ...(details && { details }),
      },
    }),
  };
}
