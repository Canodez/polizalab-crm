import { leadsApi } from '../leadsApi';
import { apiRequest } from '../../api-client';

jest.mock('../../api-client', () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    code?: string;
    constructor(message: string, statusCode: number, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('leadsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listLeads', () => {
    it('calls GET /leads with no params', async () => {
      mockApiRequest.mockResolvedValueOnce({ leads: [], count: 0 });
      await leadsApi.listLeads();
      expect(mockApiRequest).toHaveBeenCalledWith('/leads');
    });

    it('passes search param', async () => {
      mockApiRequest.mockResolvedValueOnce({ leads: [], count: 0 });
      await leadsApi.listLeads({ search: 'maria' });
      expect(mockApiRequest).toHaveBeenCalledWith('/leads?search=maria');
    });

    it('passes status filter', async () => {
      mockApiRequest.mockResolvedValueOnce({ leads: [], count: 0 });
      await leadsApi.listLeads({ status: 'NEW' });
      expect(mockApiRequest).toHaveBeenCalledWith('/leads?status=NEW');
    });

    it('passes multiple params', async () => {
      mockApiRequest.mockResolvedValueOnce({ leads: [], count: 0 });
      await leadsApi.listLeads({ search: 'test', status: 'CONTACTED', limit: 10 });
      const callArg = mockApiRequest.mock.calls[0][0];
      expect(callArg).toContain('search=test');
      expect(callArg).toContain('status=CONTACTED');
      expect(callArg).toContain('limit=10');
    });
  });

  describe('getLead', () => {
    it('calls GET /leads/:id', async () => {
      const mockLead = { leadId: 'lead-1', fullName: 'Test' };
      mockApiRequest.mockResolvedValueOnce(mockLead);
      const result = await leadsApi.getLead('lead-1');
      expect(mockApiRequest).toHaveBeenCalledWith('/leads/lead-1');
      expect(result).toEqual(mockLead);
    });
  });

  describe('createLead', () => {
    it('calls POST /leads with body', async () => {
      const data = { fullName: 'Test Lead', phone: '5512345678', productInterest: 'AUTO' as const };
      mockApiRequest.mockResolvedValueOnce({ lead: data, created: true });
      await leadsApi.createLead(data);
      expect(mockApiRequest).toHaveBeenCalledWith('/leads', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('patchLead', () => {
    it('calls PATCH /leads/:id with body', async () => {
      const data = { fullName: 'Updated Name' };
      mockApiRequest.mockResolvedValueOnce({ leadId: 'lead-1', ...data });
      await leadsApi.patchLead('lead-1', data);
      expect(mockApiRequest).toHaveBeenCalledWith('/leads/lead-1', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    });
  });

  describe('logContact', () => {
    it('calls POST /leads/:id/log-contact', async () => {
      const data = { type: 'CALL' as const, note: 'Spoke with lead' };
      mockApiRequest.mockResolvedValueOnce({});
      await leadsApi.logContact('lead-1', data);
      expect(mockApiRequest).toHaveBeenCalledWith('/leads/lead-1/log-contact', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
  });

  describe('convertLead', () => {
    it('calls POST /leads/:id/convert with empty body', async () => {
      mockApiRequest.mockResolvedValueOnce({ success: true, clientId: 'c1', action: 'created' });
      await leadsApi.convertLead('lead-1');
      expect(mockApiRequest).toHaveBeenCalledWith('/leads/lead-1/convert', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    });

    it('passes forceLink and linkClientId', async () => {
      mockApiRequest.mockResolvedValueOnce({ success: true, clientId: 'c1', action: 'linked' });
      await leadsApi.convertLead('lead-1', { forceLink: true, linkClientId: 'c1' });
      expect(mockApiRequest).toHaveBeenCalledWith('/leads/lead-1/convert', {
        method: 'POST',
        body: JSON.stringify({ forceLink: true, linkClientId: 'c1' }),
      });
    });
  });

  describe('deleteLead', () => {
    it('calls DELETE /leads/:id', async () => {
      mockApiRequest.mockResolvedValueOnce({ success: true, leadId: 'lead-1' });
      const result = await leadsApi.deleteLead('lead-1');
      expect(mockApiRequest).toHaveBeenCalledWith('/leads/lead-1', {
        method: 'DELETE',
      });
      expect(result.success).toBe(true);
    });
  });
});
