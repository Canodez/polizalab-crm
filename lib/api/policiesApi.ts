import { apiRequest, ApiError } from '../api-client';

export { ApiError };

export type PolicyStatus =
  | 'CREATED'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'VERIFIED';

export interface Policy {
  tenantId: string;
  policyId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  userId: string;
  status: PolicyStatus;
  statusReason?: string;
  lastError?: string;
  sourceFileName?: string;
  contentType?: string;
  fileSizeBytes?: number;
  s3Bucket?: string;
  s3KeyOriginal?: string;
  s3KeyTextractResult?: string;
  // CRM linkage
  policyType?: string;
  insurer?: string;
  // Extracted fields
  policyNumber?: string;
  insuredName?: string;
  startDate?: string;
  endDate?: string;
  premiumTotal?: number;
  currency?: string;
  rfc?: string;
  // Review metadata
  fieldConfidence?: Record<string, number>;
  needsReviewFields?: string[];
  extractionVersion?: number;
  verifiedAt?: string;
  verifiedByUserId?: string;
  // Derived
  fechaRenovacion?: string;
  renewalStatus?: string;
  // Renewal outcome tracking
  renewalOutcome?: string;
  renewalOutcomeAt?: string;
  renewedPolicyId?: string;
  renewalLostReason?: string;
  // Presigned (response-only, never stored)
  originalDocUrl?: string;
}

export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  policyType?: string;
  insurer?: string;
}

export interface UploadUrlResponse {
  policyId: string;
  s3KeyOriginal: string;
  presignedPutUrl: string;
  expiresIn: number;
}

export interface PatchPolicyData {
  policyNumber?: string;
  insuredName?: string;
  startDate?: string;
  endDate?: string;
  insurer?: string;
  policyType?: string;
  premiumTotal?: number;
  currency?: string;
}

export const policiesApi = {
  async getUploadUrl(req: UploadUrlRequest): Promise<UploadUrlResponse> {
    return apiRequest<UploadUrlResponse>('/policies/upload-url', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async ingest(policyId: string): Promise<{ policyId: string; status: string }> {
    return apiRequest<{ policyId: string; status: string }>(
      `/policies/${policyId}/ingest`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  },

  async listPolicies(): Promise<{ policies: Policy[]; count: number }> {
    return apiRequest<{ policies: Policy[]; count: number }>('/policies');
  },

  async getPolicy(id: string): Promise<Policy> {
    return apiRequest<Policy>(`/policies/${id}`);
  },

  async patchPolicy(id: string, data: PatchPolicyData): Promise<Policy> {
    return apiRequest<Policy>(`/policies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async getRenewals(window?: string): Promise<{ policies: Policy[]; count: number }> {
    const query = new URLSearchParams();
    if (window) query.set('window', window);
    const qs = query.toString();
    return apiRequest<{ policies: Policy[]; count: number }>(`/policies/renewals${qs ? `?${qs}` : ''}`);
  },

  async markRenewed(id: string, newPolicyId?: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/policies/${id}/mark-renewed`, {
      method: 'POST',
      body: JSON.stringify({ newPolicyId }),
    });
  },

  async markRenewalLost(id: string, reason: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/policies/${id}/mark-renewal-lost`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async deletePolicy(id: string): Promise<void> {
    return apiRequest<void>(`/policies/${id}`, { method: 'DELETE' });
  },
};
