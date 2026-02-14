import { profileApi, ApiError } from '../api-client';

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    (fetch as jest.Mock).mockClear();
  });

  describe('profileApi', () => {
    const mockToken = 'mock-jwt-token';
    const mockTokens = {
      idToken: mockToken,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    };

    beforeEach(() => {
      localStorageMock.setItem('auth_tokens', JSON.stringify(mockTokens));
    });

    describe('getProfile', () => {
      it('fetches profile with auth token', async () => {
        const mockProfile = {
          userId: 'user-123',
          email: 'test@example.com',
          nombre: 'Juan',
          apellido: 'Pérez',
          profileImage: null,
          createdAt: '2024-01-01T00:00:00Z',
        };

        (fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockProfile,
        });

        const result = await profileApi.getProfile();

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/profile'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: `Bearer ${mockToken}`,
              'Content-Type': 'application/json',
            }),
          })
        );
        expect(result).toEqual(mockProfile);
      });

      it('throws ApiError on failed request', async () => {
        (fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ message: 'Unauthorized', code: 'AUTH_REQUIRED' }),
        });

        await expect(profileApi.getProfile()).rejects.toThrow(ApiError);
        await expect(profileApi.getProfile()).rejects.toThrow('Unauthorized');
      });

      it('handles network errors', async () => {
        (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

        await expect(profileApi.getProfile()).rejects.toThrow('Network error');
      });
    });

    describe('updateProfile', () => {
      it('updates profile with correct data', async () => {
        const updateData = { nombre: 'Carlos', apellido: 'García' };

        (fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ success: true }),
        });

        const result = await profileApi.updateProfile(updateData);

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/profile'),
          expect.objectContaining({
            method: 'PUT',
            headers: expect.objectContaining({
              Authorization: `Bearer ${mockToken}`,
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify(updateData),
          })
        );
        expect(result).toEqual({ success: true });
      });

      it('throws ApiError on validation error', async () => {
        (fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            message: 'Validation error',
            code: 'VALIDATION_ERROR',
          }),
        });

        await expect(
          profileApi.updateProfile({ nombre: '', apellido: '' })
        ).rejects.toThrow(ApiError);
      });
    });

    describe('getImageUploadUrl', () => {
      it('requests pre-signed URL with file info', async () => {
        const mockResponse = {
          presignedUrl: 'https://s3.amazonaws.com/bucket/key?signature=xyz',
          s3Key: 'profiles/user-123/image.jpg',
        };

        (fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await profileApi.getImageUploadUrl('image.jpg', 'image/jpeg');

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/profile/image'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: `Bearer ${mockToken}`,
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ fileName: 'image.jpg', fileType: 'image/jpeg' }),
          })
        );
        expect(result).toEqual(mockResponse);
      });

      it('throws ApiError on server error', async () => {
        (fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ message: 'Internal server error' }),
        });

        await expect(
          profileApi.getImageUploadUrl('image.jpg', 'image/jpeg')
        ).rejects.toThrow(ApiError);
      });
    });
  });

  describe('ApiError', () => {
    it('creates error with message and status code', () => {
      const error = new ApiError('Test error', 400, 'TEST_ERROR');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('ApiError');
    });

    it('creates error without code', () => {
      const error = new ApiError('Test error', 500);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBeUndefined();
    });
  });

  describe('Authentication', () => {
    it('makes request without token when not authenticated', async () => {
      localStorageMock.clear();

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await profileApi.getProfile();

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });

    it('handles invalid token JSON in localStorage', async () => {
      localStorageMock.setItem('auth_tokens', 'invalid-json');

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await profileApi.getProfile();

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });
  });
});
