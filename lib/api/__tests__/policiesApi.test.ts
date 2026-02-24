import { policiesApi, ApiError } from '../policiesApi';

jest.mock('../../api-client', () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { apiRequest } from '../../api-client';

const mockApiRequest = apiRequest as jest.Mock;

describe('policiesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listPolicies', () => {
    it('calls GET /policies', async () => {
      const result = { policies: [], count: 0 };
      mockApiRequest.mockResolvedValue(result);

      const data = await policiesApi.listPolicies();

      expect(mockApiRequest).toHaveBeenCalledWith('/policies');
      expect(data).toEqual(result);
    });
  });

  describe('getPolicy', () => {
    it('calls GET /policies/:id', async () => {
      const policy = {
        tenantId: 'default', policyId: 'p1', userId: 'u1',
        createdByUserId: 'u1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
        status: 'EXTRACTED' as const,
      };
      mockApiRequest.mockResolvedValue(policy);

      const data = await policiesApi.getPolicy('p1');

      expect(mockApiRequest).toHaveBeenCalledWith('/policies/p1');
      expect(data).toEqual(policy);
    });
  });

  describe('patchPolicy', () => {
    it('calls PATCH /policies/:id with data', async () => {
      const updated = {
        tenantId: 'default', policyId: 'p1', userId: 'u1',
        createdByUserId: 'u1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
        status: 'VERIFIED' as const,
        insurer: 'AXA',
      };
      mockApiRequest.mockResolvedValue(updated);

      const data = await policiesApi.patchPolicy('p1', { insurer: 'AXA' });

      expect(mockApiRequest).toHaveBeenCalledWith('/policies/p1', {
        method: 'PATCH',
        body: JSON.stringify({ insurer: 'AXA' }),
      });
      expect(data).toEqual(updated);
    });
  });

  describe('getUploadUrl', () => {
    it('calls POST /policies/upload-url with request body', async () => {
      const result = {
        policyId: 'pol-1',
        s3KeyOriginal: 'policies/default/usr-1/pol-1/original.pdf',
        presignedPutUrl: 'https://s3.example.com/upload',
        expiresIn: 300,
      };
      mockApiRequest.mockResolvedValue(result);

      const req = { fileName: 'poliza.pdf', contentType: 'application/pdf', fileSizeBytes: 500000 };
      const data = await policiesApi.getUploadUrl(req);

      expect(mockApiRequest).toHaveBeenCalledWith('/policies/upload-url', {
        method: 'POST',
        body: JSON.stringify(req),
      });
      expect(data).toEqual(result);
    });
  });

  describe('ingest', () => {
    it('calls POST /policies/:id/ingest', async () => {
      const result = { policyId: 'p1', status: 'UPLOADED' };
      mockApiRequest.mockResolvedValue(result);

      const data = await policiesApi.ingest('p1');

      expect(mockApiRequest).toHaveBeenCalledWith('/policies/p1/ingest', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(data).toEqual(result);
    });
  });

  describe('getRenewals', () => {
    it('calls GET /policies/renewals', async () => {
      const result = { policies: [], count: 0 };
      mockApiRequest.mockResolvedValue(result);

      const data = await policiesApi.getRenewals();

      expect(mockApiRequest).toHaveBeenCalledWith('/policies/renewals');
      expect(data).toEqual(result);
    });
  });

  it('re-exports ApiError', () => {
    expect(ApiError).toBeDefined();
    const err = new ApiError('test', 404);
    expect(err.statusCode).toBe(404);
  });
});
