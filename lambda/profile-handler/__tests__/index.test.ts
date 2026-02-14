import { handler } from '../index';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK clients
const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.com'),
}));

describe('Profile Handler Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    jest.clearAllMocks();
  });

  const createMockEvent = (
    path: string,
    method: string,
    body?: any,
    userId: string = 'test-user-123'
  ): APIGatewayProxyEvent => {
    return {
      path,
      httpMethod: method,
      headers: {
        Authorization: `Bearer mock.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64')}.signature`,
      },
      body: body ? JSON.stringify(body) : null,
      requestContext: {
        authorizer: {
          claims: {
            sub: userId,
          },
        },
      },
    } as any;
  };

  describe('GET /profile', () => {
    it('should return user profile when user exists', async () => {
      const mockUser = {
        userId: 'test-user-123',
        email: 'test@example.com',
        nombre: 'Juan',
        apellido: 'Pérez',
        profileImage: 'profiles/test-user-123/avatar.jpg',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockUser,
      });

      const event = createMockEvent('/profile', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual(mockUser);
      expect(ddbMock.calls()).toHaveLength(1);
    });

    it('should return 404 when user profile not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const event = createMockEvent('/profile', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('User profile not found');
    });

    it('should return 401 when no authentication token provided', async () => {
      const event = createMockEvent('/profile', 'GET');
      delete event.headers.Authorization;
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should handle DynamoDB errors gracefully', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent('/profile', 'GET');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('PUT /profile', () => {
    it('should update profile with nombre and apellido', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile', 'PUT', {
        nombre: 'Carlos',
        apellido: 'García',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(ddbMock.calls()).toHaveLength(1);

      const updateCall = ddbMock.call(0);
      expect(updateCall.args[0].input).toMatchObject({
        TableName: 'Users',
        Key: { userId: 'test-user-123' },
      });
    });

    it('should update profile with only nombre', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile', 'PUT', {
        nombre: 'Carlos',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });

    it('should update profile with only apellido', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile', 'PUT', {
        apellido: 'García',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 when no fields provided', async () => {
      const event = createMockEvent('/profile', 'PUT', {});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('At least one field');
    });

    it('should return 400 when body is missing', async () => {
      const event = createMockEvent('/profile', 'PUT');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Request body is required');
    });

    it('should return 404 when user does not exist', async () => {
      const error: any = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(error);

      const event = createMockEvent('/profile', 'PUT', {
        nombre: 'Carlos',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 401 when no authentication token provided', async () => {
      const event = createMockEvent('/profile', 'PUT', { nombre: 'Test' });
      delete event.headers.Authorization;
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('POST /profile/image', () => {
    it('should generate pre-signed URL for valid image upload', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.jpg',
        fileType: 'image/jpeg',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.presignedUrl).toBe('https://mock-presigned-url.com');
      expect(body.s3Key).toBe('profiles/test-user-123/avatar.jpg');
      expect(ddbMock.calls()).toHaveLength(1);

      const updateCall = ddbMock.call(0);
      expect(updateCall.args[0].input).toMatchObject({
        TableName: 'Users',
        Key: { userId: 'test-user-123' },
        UpdateExpression: 'SET profileImage = :profileImage',
        ExpressionAttributeValues: {
          ':profileImage': 'profiles/test-user-123/avatar.jpg',
        },
      });
    });

    it('should accept PNG file type', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.png',
        fileType: 'image/png',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.s3Key).toBe('profiles/test-user-123/avatar.png');
    });

    it('should accept WebP file type', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.webp',
        fileType: 'image/webp',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.s3Key).toBe('profiles/test-user-123/avatar.webp');
    });

    it('should reject unsupported file types', async () => {
      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'document.pdf',
        fileType: 'application/pdf',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid file type');
      expect(body.error.details.fileType).toContain('image/jpeg');
      expect(body.error.details.fileType).toContain('image/png');
      expect(body.error.details.fileType).toContain('image/webp');
    });

    it('should return 400 when fileName is missing', async () => {
      const event = createMockEvent('/profile/image', 'POST', {
        fileType: 'image/jpeg',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fileName).toBe('Required');
    });

    it('should return 400 when fileType is missing', async () => {
      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.jpg',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fileType).toBe('Required');
    });

    it('should return 400 when body is missing', async () => {
      const event = createMockEvent('/profile/image', 'POST');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Request body is required');
    });

    it('should return 404 when user does not exist', async () => {
      const error: any = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(error);

      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.jpg',
        fileType: 'image/jpeg',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 401 when no authentication token provided', async () => {
      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.jpg',
        fileType: 'image/jpeg',
      });
      delete event.headers.Authorization;
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should handle case-insensitive file types', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const event = createMockEvent('/profile/image', 'POST', {
        fileName: 'avatar.jpg',
        fileType: 'IMAGE/JPEG',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Unknown endpoints', () => {
    it('should return 404 for unknown paths', async () => {
      const event = createMockEvent('/unknown', 'GET');

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Endpoint not found');
    });

    it('should return 404 for unsupported methods', async () => {
      const event = createMockEvent('/profile', 'DELETE');

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('JWT token extraction', () => {
    it('should extract userId from requestContext authorizer claims', async () => {
      const mockUser = {
        userId: 'user-from-context',
        email: 'test@example.com',
        nombre: null,
        apellido: null,
        profileImage: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockUser,
      });

      const event = createMockEvent('/profile', 'GET', undefined, 'user-from-context');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.userId).toBe('user-from-context');
    });

    it('should fallback to parsing JWT token from Authorization header', async () => {
      const mockUser = {
        userId: 'user-from-token',
        email: 'test@example.com',
        nombre: null,
        apellido: null,
        profileImage: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockUser,
      });

      const event = createMockEvent('/profile', 'GET', undefined, 'user-from-token');
      // Remove requestContext to force JWT parsing
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.userId).toBe('user-from-token');
    });

    it('should return 401 for malformed JWT token', async () => {
      const event = createMockEvent('/profile', 'GET');
      event.headers.Authorization = 'Bearer invalid-token';
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('AUTH_REQUIRED');
    });
  });
});
