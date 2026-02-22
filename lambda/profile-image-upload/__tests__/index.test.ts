import { handler } from '../index';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Mock = mockClient(S3Client);

describe('Profile Image Upload Lambda', () => {
  beforeEach(() => {
    s3Mock.reset();
    process.env.S3_BUCKET = 'test-bucket';
  });

  const createMockEvent = (
    body: any,
    userId: string = 'test-user-123'
  ): APIGatewayProxyEvent => {
    return {
      httpMethod: 'POST',
      path: '/profile/image/upload',
      headers: {
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(body),
      requestContext: {
        authorizer: {
          claims: {
            sub: userId,
          },
        },
      } as any,
    } as APIGatewayProxyEvent;
  };

  describe('Authentication', () => {
    it('should return 401 if no authorization header', async () => {
      const event = createMockEvent({ fileName: 'test.jpg', fileType: 'image/jpeg' });
      delete event.headers.Authorization;
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error.code).toBe('AUTH_REQUIRED');
    });

    it('should extract userId from requestContext', async () => {
      const event = createMockEvent(
        { fileName: 'test.jpg', fileType: 'image/jpeg' },
        'user-from-context'
      );

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Validation', () => {
    it('should return 400 if body is missing', async () => {
      const event = createMockEvent(null);
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if fileName is missing', async () => {
      const event = createMockEvent({ fileType: 'image/jpeg' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.message).toContain('fileName');
    });

    it('should return 400 if fileType is missing', async () => {
      const event = createMockEvent({ fileName: 'test.jpg' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.message).toContain('fileType');
    });

    it('should return 400 for invalid file type', async () => {
      const event = createMockEvent({
        fileName: 'test.pdf',
        fileType: 'application/pdf',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.message).toContain('Invalid file type');
    });

    it('should accept image/jpeg', async () => {
      const event = createMockEvent({
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should accept image/png', async () => {
      const event = createMockEvent({
        fileName: 'test.png',
        fileType: 'image/png',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should accept image/webp', async () => {
      const event = createMockEvent({
        fileName: 'test.webp',
        fileType: 'image/webp',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should return 400 if file size exceeds limit', async () => {
      const event = createMockEvent({
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
        fileSize: 3 * 1024 * 1024, // 3MB
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.message).toContain('exceeds maximum');
    });
  });

  describe('File Name Sanitization', () => {
    it('should sanitize file names with special characters', async () => {
      const event = createMockEvent({
        fileName: '../../../etc/passwd',
        fileType: 'image/jpeg',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.s3Key).not.toContain('../');
      expect(body.s3Key).toMatch(/profiles\/test-user-123\/\d+-_____etc_passwd/);
    });
  });

  describe('Pre-signed URL Generation', () => {
    it('should generate pre-signed URL successfully', async () => {
      const event = createMockEvent({
        fileName: 'profile.jpg',
        fileType: 'image/jpeg',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.presignedUrl).toBeDefined();
      expect(body.s3Key).toMatch(/profiles\/test-user-123\/\d+-profile\.jpg/);
      expect(body.expiresIn).toBe(300);
    });

    it('should include userId in S3 key', async () => {
      const event = createMockEvent(
        { fileName: 'avatar.png', fileType: 'image/png' },
        'user-456'
      );

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.s3Key).toContain('profiles/user-456/');
    });

    it('should include timestamp in S3 key', async () => {
      const event = createMockEvent({
        fileName: 'photo.jpg',
        fileType: 'image/jpeg',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.s3Key).toMatch(/profiles\/test-user-123\/\d+-photo\.jpg/);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in success response', async () => {
      const event = createMockEvent({
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
      });

      s3Mock.on(PutObjectCommand).resolves({});

      const result = await handler(event);

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
      expect(result.headers['Access-Control-Allow-Headers']).toBe(
        'Content-Type, Authorization'
      );
    });

    it('should include CORS headers in error response', async () => {
      const event = createMockEvent({
        fileName: 'test.pdf',
        fileType: 'application/pdf',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('HTTP Methods', () => {
    it('should return 405 for GET requests', async () => {
      const event = createMockEvent({
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
      });
      event.httpMethod = 'GET';

      const result = await handler(event);

      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body).error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('should return 405 for PUT requests', async () => {
      const event = createMockEvent({
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
      });
      event.httpMethod = 'PUT';

      const result = await handler(event);

      expect(result.statusCode).toBe(405);
    });
  });
});
