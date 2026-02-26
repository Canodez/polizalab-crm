import { apiRequest, ApiError } from '../api-client';

export { ApiError };

export type OpportunityProduct = 'AUTO' | 'VIDA' | 'GMM' | 'HOGAR' | 'PYME' | 'OTRO';
export type OpportunityStage = 'CALIFICAR' | 'DATOS_MINIMOS' | 'COTIZANDO' | 'PROPUESTA_ENVIADA' | 'NEGOCIACION' | 'GANADA' | 'PERDIDA';
export type LostReason = 'PRECIO' | 'COBERTURA' | 'COMPETENCIA' | 'SIN_RESPUESTA' | 'CAMBIO_PLANES' | 'OTRO';
export type CommissionType = 'PCT' | 'AMOUNT';

export interface StageHistoryEntry {
  stage: OpportunityStage;
  changedAt: string;
  changedByUserId: string;
}

export interface Quote {
  id: string;
  insurer: string;
  premium: number;
  terms?: string;
  createdAt: string;
}

export interface Opportunity {
  tenantId: string;
  opportunityId: string;
  userId: string;
  leadId?: string | null;
  clientId?: string | null;
  entityName?: string | null;
  product: OpportunityProduct;
  stage: OpportunityStage;
  stageHistory: StageHistoryEntry[];
  commissionType?: CommissionType | null;
  commissionValue?: number | null;
  estimatedPremium?: number | null;
  currency?: string | null;
  quotes?: Quote[] | null;
  closedReason?: LostReason | null;
  closedAt?: string | null;
  wonPolicyId?: string | null;
  nextActivityId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOpportunityData {
  product: OpportunityProduct;
  leadId?: string;
  clientId?: string;
  entityName?: string;
  stage?: OpportunityStage;
  commissionType?: CommissionType;
  commissionValue?: number;
  estimatedPremium?: number;
  currency?: string;
  notes?: string;
}

export interface PatchOpportunityData {
  entityName?: string | null;
  product?: OpportunityProduct;
  commissionType?: CommissionType | null;
  commissionValue?: number | null;
  estimatedPremium?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface OpportunityListParams {
  stage?: string;
  product?: string;
  search?: string;
  limit?: number;
  nextToken?: string;
}

export interface OpportunityListResponse {
  opportunities: Opportunity[];
  count: number;
  nextToken?: string;
}

export interface AddQuoteData {
  insurer: string;
  premium: number;
  terms?: string;
}

export const opportunitiesApi = {
  async list(params?: OpportunityListParams): Promise<OpportunityListResponse> {
    const query = new URLSearchParams();
    if (params?.stage) query.set('stage', params.stage);
    if (params?.product) query.set('product', params.product);
    if (params?.search) query.set('search', params.search);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.nextToken) query.set('nextToken', params.nextToken);
    const qs = query.toString();
    return apiRequest<OpportunityListResponse>(`/opportunities${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<Opportunity> {
    return apiRequest<Opportunity>(`/opportunities/${id}`);
  },

  async create(data: CreateOpportunityData): Promise<{ opportunity: Opportunity; created: boolean }> {
    return apiRequest<{ opportunity: Opportunity; created: boolean }>('/opportunities', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async patch(id: string, data: PatchOpportunityData): Promise<Opportunity> {
    return apiRequest<Opportunity>(`/opportunities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/opportunities/${id}`, {
      method: 'DELETE',
    });
  },

  async advanceStage(id: string, targetStage: OpportunityStage): Promise<Opportunity> {
    return apiRequest<Opportunity>(`/opportunities/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ targetStage }),
    });
  },

  async closeWon(id: string): Promise<{ opportunity: Opportunity; ctaUploadPolicy: boolean }> {
    return apiRequest<{ opportunity: Opportunity; ctaUploadPolicy: boolean }>(`/opportunities/${id}/close-won`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async closeLost(id: string, reason: LostReason, notes?: string): Promise<Opportunity> {
    return apiRequest<Opportunity>(`/opportunities/${id}/close-lost`, {
      method: 'POST',
      body: JSON.stringify({ reason, notes }),
    });
  },

  async addQuote(id: string, data: AddQuoteData): Promise<Opportunity> {
    return apiRequest<Opportunity>(`/opportunities/${id}/quotes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
