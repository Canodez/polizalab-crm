import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const s3Client = new S3Client({});

const S3_BUCKET = process.env.S3_BUCKET || 'polizalab-profile-images';
const PRESIGNED_URL_EXPIRATION = 300; // 5 minutes
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

interface ProfileImageRequestBody {
  fileName: string;
  fileType: string;
  fileSize?: number;
}

/**
 * Profile Image Upload Lambda Function
 * Generates pre-signed URLs for uploading profile images to S3
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Profile Image Upload Handler invoked', {
    path: event.path,
    method: event.httpMethod,
    headers: event.headers,
  });

  try {
    // Extract userId from JWT token
    const userId = extractUserIdFromToken(event);
    if (!userId) {
      return createErrorResponse(401, 'AUTH_REQUIRED', 'Authentication token is required');
    }

    // Only handle POST requests
    if (event.httpMethod !== 'POST') {
      return createErrorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST method is allowed');
    }

    if (!event.body) {
      return createErrorResponse(400, 'VALIDATION_ERROR', 'Request body is required');
    }

    const body: ProfileImageRequestBody = JSON.parse(event.body);

    // Validate required fields
    if (!body.fileName || !body.fileType) {
      return createErrorResponse(
        400,
        'VALIDATION_ERROR',
        'fileName and fileType are required',
        {
          fileName: !body.fileName ? 'Required' : undefined,
          fileType: !body.fileType ? 'Required' : undefined,
        }
      );
    }

    // Validate file type (JPEG, PNG, WebP)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(body.fileType.toLowerCase())) {
      return createErrorResponse(
        400,
        'VALIDATION_ERROR',
        'Invalid file type. Only JPEG, PNG, and WebP are supported',
        {
          fileType: `Must be one of: ${allowedTypes.join(', ')}`,
        }
      );
    }

    // Validate file size if provided
    if (body.fileSize && body.fileSize > MAX_FILE_SIZE) {
      return createErrorResponse(
        400,
        'VALIDATION_ERROR',
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        {
          fileSize: `Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        }
      );
    }

    // Sanitize fileName to prevent path traversal
    const sanitizedFileName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Generate S3 key: profiles/{userId}/{timestamp}-{fileName}
    const timestamp = Date.now();
    const s3Key = `profiles/${userId}/${timestamp}-${sanitizedFileName}`;

    console.log('Generating pre-signed URL', {
      userId,
      s3Key,
      fileType: body.fileType,
      fileSize: body.fileSize,
    });

    // Generate pre-signed URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      ContentType: body.fileType,
      // Add metadata
      Metadata: {
        userId,
        uploadedAt: new Date().toISOString(),
      },
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    console.log('Pre-signed URL generated successfully', { userId, s3Key });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: JSON.stringify({
        presignedUrl,
        s3Key,
        expiresIn: PRESIGNED_URL_EXPIRATION,
      }),
    };
  } catch (error) {
    console.error('Unhandled error in Profile Image Upload Handler', error);
    return createErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};

/**
 * Extract userId from JWT token in Authorization header
 */
function extractUserIdFromToken(event: APIGatewayProxyEvent): string | null {
  try {
    // In API Gateway with Cognito authorizer, the userId is available in requestContext
    const userId = event.requestContext?.authorizer?.claims?.sub;

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
