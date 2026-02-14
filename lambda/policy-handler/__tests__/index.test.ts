import { handler } from '../index';
import { DynamoDBClient, QueryCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';

const dynamoMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://presigned-url.example.com'),
}));

describe('Policy Handler Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    process.env.DYNAMODB_POLICIES_TABLE = 'Policies';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
  });

  const mockEvent = (method: string, path: string, userId: string, body?: any, pathParams?: any) => ({
    httpMethod: method,
    path,
    headers: { Authorization: `Bearer mock.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64')}.sig` },
    body: body ? JSON.stringify(body) : undefined,
    pathParameters: pathParams,
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: userId,
          },
        },
      },
    },
  });

  describe('GET /policies', () => {
    it('should list user policies', async () => {
      const userId = 'user-123';
      const mockPolicies = [
        {
          policyId: 'policy-1',
          userId,
          clienteNombre: 'Juan',
          clienteApellido: 'Pérez',
          tipoPoliza: 'Auto',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({
        Items: mockPolicies.map(p => marshall(p)),
      });

      const event = mockEvent('GET', '/policies', userId);
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.policies).toHaveLength(1);
      expect(body.policies[0].policyId).toBe('policy-1');
    });

    it('should return empty array when no policies exist', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const event = mockEvent('GET', '/policies', 'user-123');
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.policies).toEqual([]);
    });

    it('should return 401 when no userId in token', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/policies',
        headers: {},
      };

      const result = await handler(event as any);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('GET /policies/:id', () => {
    it('should return policy details', async () => {
      const userId = 'user-123';
      const policyId = 'policy-1';
      const mockPolicy = {
        policyId,
        userId,
        clienteNombre: 'Juan',
        clienteApellido: 'Pérez',
        tipoPoliza: 'Auto',
        fechaRenovacion: '2025-12-31',
        createdAt: '2024-01-01T00:00:00Z',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      const event = mockEvent('GET', `/policies/${policyId}`, userId, undefined, { id: policyId });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.policyId).toBe(policyId);
      expect(body.renewalStatus).toBeDefined();
    });

    it('should return 404 when policy not found', async () => {
      dynamoMock.on(GetItemCommand).resolves({ Item: undefined });

      const event = mockEvent('GET', '/policies/nonexistent', 'user-123', undefined, { id: 'nonexistent' });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Policy not found');
    });

    it('should return 403 when accessing another user policy', async () => {
      const mockPolicy = {
        policyId: 'policy-1',
        userId: 'other-user',
        clienteNombre: 'Juan',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      const event = mockEvent('GET', '/policies/policy-1', 'user-123', undefined, { id: 'policy-1' });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('PUT /policies/:id', () => {
    it('should update policy fields', async () => {
      const userId = 'user-123';
      const policyId = 'policy-1';
      const mockPolicy = {
        policyId,
        userId,
        clienteNombre: 'Juan',
        tipoPoliza: 'Auto',
        fechaInicio: '2024-01-01',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall({
          ...mockPolicy,
          clienteNombre: 'Carlos',
          updatedAt: '2024-01-02T00:00:00Z',
        }),
      });

      const updates = { clienteNombre: 'Carlos' };
      const event = mockEvent('PUT', `/policies/${policyId}`, userId, updates, { id: policyId });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.policy.clienteNombre).toBe('Carlos');
    });

    it('should recalculate fechaRenovacion when fechaInicio changes', async () => {
      const userId = 'user-123';
      const policyId = 'policy-1';
      const mockPolicy = {
        policyId,
        userId,
        tipoPoliza: 'Auto',
        fechaInicio: '2024-01-01',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall({
          ...mockPolicy,
          fechaInicio: '2024-06-01',
          fechaRenovacion: '2025-06-01',
          updatedAt: '2024-01-02T00:00:00Z',
        }),
      });

      const updates = { fechaInicio: '2024-06-01' };
      const event = mockEvent('PUT', `/policies/${policyId}`, userId, updates, { id: policyId });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
    });

    it('should return 403 when updating another user policy', async () => {
      const mockPolicy = {
        policyId: 'policy-1',
        userId: 'other-user',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      const event = mockEvent('PUT', '/policies/policy-1', 'user-123', { clienteNombre: 'Test' }, { id: 'policy-1' });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(403);
    });
  });

  describe('GET /policies/renewals', () => {
    it('should return upcoming renewals sorted by date', async () => {
      const userId = 'user-123';
      const today = new Date();
      const in20Days = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const in50Days = new Date(today.getTime() + 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const mockPolicies = [
        {
          policyId: 'policy-1',
          userId,
          fechaRenovacion: in50Days,
          clienteNombre: 'Juan',
        },
        {
          policyId: 'policy-2',
          userId,
          fechaRenovacion: in20Days,
          clienteNombre: 'María',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({
        Items: mockPolicies.map(p => marshall(p)),
      });

      const event = mockEvent('GET', '/policies/renewals', userId);
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.renewals).toHaveLength(2);
      // Should be sorted by date ascending (earliest first)
      expect(body.renewals[0].policyId).toBe('policy-2');
      expect(body.renewals[1].policyId).toBe('policy-1');
    });

    it('should filter out non-urgent renewals', async () => {
      const userId = 'user-123';
      const today = new Date();
      const in20Days = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const in120Days = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const mockPolicies = [
        {
          policyId: 'policy-1',
          userId,
          fechaRenovacion: in20Days,
        },
        {
          policyId: 'policy-2',
          userId,
          fechaRenovacion: in120Days,
        },
      ];

      dynamoMock.on(QueryCommand).resolves({
        Items: mockPolicies.map(p => marshall(p)),
      });

      const event = mockEvent('GET', '/policies/renewals', userId);
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.renewals).toHaveLength(1);
      expect(body.renewals[0].policyId).toBe('policy-1');
    });
  });

  describe('POST /policies/upload-url', () => {
    it('should generate pre-signed URL', async () => {
      const userId = 'user-123';
      const body = {
        fileName: 'policy.pdf',
        fileType: 'application/pdf',
      };

      const event = mockEvent('POST', '/policies/upload-url', userId, body);
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.presignedUrl).toBe('https://presigned-url.example.com');
      expect(responseBody.s3Key).toContain(`policies/${userId}/`);
      expect(responseBody.s3Key).toContain('policy.pdf');
    });

    it('should return 400 when fileName is missing', async () => {
      const body = { fileType: 'application/pdf' };

      const event = mockEvent('POST', '/policies/upload-url', 'user-123', body);
      const result = await handler(event as any);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toContain('required');
    });
  });

  describe('Renewal calculations', () => {
    it('should calculate 30_DAYS status correctly', async () => {
      const userId = 'user-123';
      const today = new Date();
      const in25Days = new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const mockPolicy = {
        policyId: 'policy-1',
        userId,
        fechaRenovacion: in25Days,
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      const event = mockEvent('GET', '/policies/policy-1', userId, undefined, { id: 'policy-1' });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.renewalStatus).toBe('30_DAYS');
    });

    it('should calculate OVERDUE status correctly', async () => {
      const userId = 'user-123';
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const mockPolicy = {
        policyId: 'policy-1',
        userId,
        fechaRenovacion: yesterday,
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockPolicy),
      });

      const event = mockEvent('GET', '/policies/policy-1', userId, undefined, { id: 'policy-1' });
      const result = await handler(event as any);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.renewalStatus).toBe('OVERDUE');
    });
  });

  describe('Error handling', () => {
    it('should return 500 on DynamoDB error', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const event = mockEvent('GET', '/policies', 'user-123');
      const result = await handler(event as any);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 404 for unknown routes', async () => {
      const event = mockEvent('GET', '/unknown', 'user-123');
      const result = await handler(event as any);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Not found');
    });
  });
});
