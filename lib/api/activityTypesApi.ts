import { apiRequest, ApiError } from '../api-client';

export { ApiError };

export interface ActivityType {
  code: string;
  label: string;
  sortOrder: number;
  isFavorite: boolean;
  isActive: boolean;
  isSystem: boolean;
  hasOverride: boolean;
}

export interface ActivityTypeListResponse {
  activityTypes: ActivityType[];
  count: number;
}

export interface UpdateActivityTypeData {
  label?: string;
  isActive?: boolean;
  isFavorite?: boolean;
  sortOrder?: number;
}

export interface ReorderItem {
  code: string;
  sortOrder: number;
}

export const activityTypesApi = {
  async list(): Promise<ActivityTypeListResponse> {
    return apiRequest<ActivityTypeListResponse>('/activity-types');
  },

  async update(code: string, data: UpdateActivityTypeData): Promise<ActivityType> {
    return apiRequest<ActivityType>(`/activity-types/${code}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async reorder(items: ReorderItem[]): Promise<{ success: boolean; updated: number }> {
    return apiRequest<{ success: boolean; updated: number }>('/activity-types/reorder', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};
