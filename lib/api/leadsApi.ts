import { apiRequest, ApiError } from '../api-client';

export { ApiError };

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUOTING' | 'WON' | 'LOST';
export type ProductInterest = 'AUTO' | 'VIDA' | 'GMM' | 'HOGAR' | 'PYME' | 'OTRO';
export type LeadSource = 'WHATSAPP' | 'REFERIDO' | 'WEB' | 'FACEBOOK' | 'EVENTO' | 'OTRO';
export type NextActionType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'FOLLOWUP';

export interface TimelineEntry {
  id: string;
  type: NextActionType;
  note: string;
  createdAt: string;
  createdByUserId: string;
}

export interface Lead {
  tenantId: string;
  leadId: string;
  userId: string;
  createdByUserId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  status: LeadStatus;
  productInterest: ProductInterest;
  source?: LeadSource | null;
  sourceDetail?: string | null;
  assignedToUserId?: string | null;
  lastContactAt?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  notes?: string | null;
  tags?: string[] | null;
  timeline: TimelineEntry[];
  convertedClientId?: string | null;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadData {
  fullName: string;
  phone: string;
  productInterest: ProductInterest;
  email?: string | null;
  status?: LeadStatus;
  source?: LeadSource | null;
  sourceDetail?: string | null;
  assignedToUserId?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  notes?: string | null;
  tags?: string[] | null;
}

export interface PatchLeadData {
  fullName?: string;
  phone?: string;
  email?: string | null;
  status?: LeadStatus;
  productInterest?: ProductInterest;
  source?: LeadSource | null;
  sourceDetail?: string | null;
  assignedToUserId?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  notes?: string | null;
  tags?: string[] | null;
}

export interface LogContactData {
  type?: NextActionType;
  note?: string;
}

export interface LeadListParams {
  search?: string;
  status?: string;
  productInterest?: string;
  source?: string;
  sort?: string;
  limit?: number;
  nextToken?: string;
}

export interface LeadListResponse {
  leads: Lead[];
  count: number;
  nextToken?: string;
}

export interface CreateLeadResponse {
  lead: Lead;
  created: boolean;
  duplicateOf?: string;
  message?: string;
}

export interface ConvertLeadResponse {
  success: boolean;
  clientId?: string;
  action: 'created' | 'linked' | 'duplicate_found';
  existingClient?: {
    clientId: string;
    firstName: string;
    lastName: string;
    field: string;
  };
  client?: Record<string, unknown>;
}

export const leadsApi = {
  async listLeads(params?: LeadListParams): Promise<LeadListResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.productInterest) query.set('productInterest', params.productInterest);
    if (params?.source) query.set('source', params.source);
    if (params?.sort) query.set('sort', params.sort);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.nextToken) query.set('nextToken', params.nextToken);
    const qs = query.toString();
    return apiRequest<LeadListResponse>(`/leads${qs ? `?${qs}` : ''}`);
  },

  async getLead(id: string): Promise<Lead> {
    return apiRequest<Lead>(`/leads/${id}`);
  },

  async createLead(data: CreateLeadData): Promise<CreateLeadResponse> {
    return apiRequest<CreateLeadResponse>('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async patchLead(id: string, data: PatchLeadData): Promise<Lead> {
    return apiRequest<Lead>(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async logContact(id: string, data: LogContactData): Promise<Lead> {
    return apiRequest<Lead>(`/leads/${id}/log-contact`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async convertLead(
    id: string,
    body?: { forceLink?: boolean; linkClientId?: string },
  ): Promise<ConvertLeadResponse> {
    return apiRequest<ConvertLeadResponse>(`/leads/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  },

  async deleteLead(id: string): Promise<{ success: boolean; leadId: string }> {
    return apiRequest<{ success: boolean; leadId: string }>(`/leads/${id}`, {
      method: 'DELETE',
    });
  },
};
