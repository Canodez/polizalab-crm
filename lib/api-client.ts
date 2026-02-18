import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * API Client for PolizaLab backend
 * Handles HTTP requests with authentication and error handling
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || '';

/**
 * Get authentication token from Amplify
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.message || `Request failed with status ${response.status}`,
      response.status,
      errorData.code
    );
  }

  return response.json();
}

/**
 * Profile API
 */
export const profileApi = {
  /**
   * Get current user profile
   */
  async getProfile() {
    return apiRequest<{
      userId: string;
      email: string;
      nombre: string | null;
      apellido: string | null;
      profileImage: string | null;
      createdAt: string;
    }>('/profile');
  },

  /**
   * Update user profile
   */
  async updateProfile(data: { nombre: string; apellido: string }) {
    return apiRequest<{ success: boolean }>('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get pre-signed URL for profile image upload
   */
  async getImageUploadUrl(fileName: string, fileType: string) {
    return apiRequest<{ presignedUrl: string; s3Key: string }>('/profile/image', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType }),
    });
  },
};
