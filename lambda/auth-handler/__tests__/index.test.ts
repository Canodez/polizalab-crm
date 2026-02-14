import { handler } from '../index';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Auth Handler Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.USERS_TABLE = 'Users';
  });

  describe('POST /auth/register', () => {
    it('should create a user record successfully', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          cognitoUserId: 'test-uuid-123',
          email: 'test@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('test-uuid-123');

      // Verify DynamoDB was called with correct parameters
      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBe('Users');
      expect(calls[0].args[0].input.Item).toMatchObject({
        userId: 'test-uuid-123',
        email: 'test@example.com',
        nombre: null,
        apellido: null,
        profileImage: null,
      });
      expect(calls[0].args[0].input.Item.createdAt).toBeDefined();
    });

    it('should return 400 when body is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Request body is required');
    });

    it('should return 400 when cognitoUserId is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('required');
    });

    it('should return 400 when email is missing', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          cognitoUserId: 'test-uuid-123',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('required');
    });

    it('should return 409 when user already exists', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(error);

      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          cognitoUserId: 'existing-uuid',
          email: 'existing@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('USER_EXISTS');
      expect(body.error.message).toBe('User already exists');
    });

    it('should return 500 when DynamoDB table not found', async () => {
      const error = new Error('ResourceNotFoundException');
      error.name = 'ResourceNotFoundException';
      ddbMock.on(PutCommand).rejects(error);

      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          cognitoUserId: 'test-uuid-123',
          email: 'test@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Database table not found');
    });

    it('should return 500 on unexpected DynamoDB error', async () => {
      ddbMock.on(PutCommand).rejects(new Error('Unexpected error'));

      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          cognitoUserId: 'test-uuid-123',
          email: 'test@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should include CORS headers in all responses', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event: Partial<APIGatewayProxyEvent> = {
        path: '/auth/register',
        httpMethod: 'POST',
        body: JSON.stringify({
          cognitoUserId: 'test-uuid-123',
          email: 'test@example.com',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });
  });

  describe('Unknown routes', () => {
    it('should return 404 for unknown paths', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        path: '/unknown',
        httpMethod: 'GET',
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
