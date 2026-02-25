import { apiRequest, ApiError } from '../api-client';
import { Policy } from './policiesApi';

export { ApiError };

export type ClientStatus = 'active' | 'archived';
export type ClientCreatedFrom = 'manual' | 'policy_extraction';

export interface Client {
  tenantId: string;
  clientId: string;
  userId: string;
  // Identity
  firstName: string;
  lastName: string;
  rfc: string | null;
  curp: string | null;
  // Contact
  email: string | null;
  phone: string | null;
  // Address
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  // Metadata
  status: ClientStatus;
  createdFrom: ClientCreatedFrom;
  sourcePolicyId: string | null;
  policyCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientData {
  firstName: string;
  lastName: string;
  rfc?: string | null;
  curp?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  notes?: string | null;
}

export interface UpsertClientData extends CreateClientData {
  sourcePolicyId?: string | null;
}

export interface PatchClientData {
  firstName?: string;
  lastName?: string;
  rfc?: string | null;
  curp?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  notes?: string | null;
}

export interface ClientListParams {
  search?: string;
  status?: string;
  createdFrom?: string;
  sort?: string;
  limit?: number;
  nextToken?: string;
}

export interface ClientListResponse {
  clients: Client[];
  count: number;
  nextToken?: string;
}

export interface ClientDetailResponse extends Client {
  policies: Policy[];
}

export interface UpsertClientResponse {
  client: Client;
  created: boolean;
  matched?: {
    field: string;
    existingClientId: string;
  };
}

export interface DuplicateCheckResponse {
  isDuplicate: boolean;
  existingClient?: {
    clientId: string;
    field: string;
    firstName?: string;
    lastName?: string;
  };
}

export const clientsApi = {
  async listClients(params?: ClientListParams): Promise<ClientListResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.createdFrom) query.set('createdFrom', params.createdFrom);
    if (params?.sort) query.set('sort', params.sort);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.nextToken) query.set('nextToken', params.nextToken);
    const qs = query.toString();
    return apiRequest<ClientListResponse>(`/clients${qs ? `?${qs}` : ''}`);
  },

  async getClient(id: string): Promise<ClientDetailResponse> {
    return apiRequest<ClientDetailResponse>(`/clients/${id}`);
  },

  async createClient(data: CreateClientData): Promise<Client> {
    return apiRequest<Client>('/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async upsertClient(data: UpsertClientData): Promise<UpsertClientResponse> {
    return apiRequest<UpsertClientResponse>('/clients/upsert', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async patchClient(id: string, data: PatchClientData): Promise<Client> {
    return apiRequest<Client>(`/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async archiveClient(id: string): Promise<void> {
    return apiRequest<void>(`/clients/${id}/archive`, { method: 'POST', body: JSON.stringify({}) });
  },

  async unarchiveClient(id: string): Promise<void> {
    return apiRequest<void>(`/clients/${id}/unarchive`, { method: 'POST', body: JSON.stringify({}) });
  },

  async checkDuplicate(params: {
    email?: string;
    rfc?: string;
    phone?: string;
  }): Promise<DuplicateCheckResponse> {
    const query = new URLSearchParams();
    if (params.email) query.set('email', params.email);
    if (params.rfc) query.set('rfc', params.rfc);
    if (params.phone) query.set('phone', params.phone);
    return apiRequest<DuplicateCheckResponse>(`/clients/check-duplicate?${query.toString()}`);
  },

  async deleteClient(id: string): Promise<{ success: boolean; clientId: string; policiesUnlinked: number }> {
    return apiRequest<{ success: boolean; clientId: string; policiesUnlinked: number }>(`/clients/${id}`, {
      method: 'DELETE',
    });
  },

  async linkPolicy(clientId: string, policyId: string): Promise<void> {
    return apiRequest<void>(`/clients/${clientId}/policies/${policyId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
