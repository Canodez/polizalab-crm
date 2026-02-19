import { profileApi, ApiError } from '../api-client';
import { logoutUser } from '../auth';

// Mock dependencies
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
}));

jest.mock('../auth', () => ({
  logoutUser: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('API Client - 401 Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('401 Unauthorized handling', () => {
    it('should call logout when receiving 401 error', async () => {
      // Mock fetch to return 401
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 401,
        ok: false,
      });

      // Mock fetchAuthSession to return a token
      const { fetchAuthSession } = require('aws-amplify/auth');
      fetchAuthSession.mockResolvedValueOnce({
        tokens: {
          idToken: {
            toString: () => 'mock-token',
          },
        },
      });

      // Attempt to get profile (should trigger 401 handling)
      await expect(profileApi.getProfile()).rejects.toThrow(ApiError);

      // Verify logout was called
      expect(logoutUser).toHaveBeenCalledTimes(1);
    });

    it('should throw ApiError with SESSION_EXPIRED code on 401', async () => {
      // Mock fetch to return 401
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 401,
        ok: false,
      });

      // Mock fetchAuthSession
      const { fetchAuthSession } = require('aws-amplify/auth');
      fetchAuthSession.mockResolvedValueOnce({
        tokens: {
          idToken: {
            toString: () => 'mock-token',
          },
        },
      });

      try {
        await profileApi.getProfile();
        fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).code).toBe('SESSION_EXPIRED');
        expect((error as ApiError).message).toBe('Tu sesión expiró');
      }
    });

    it('should handle logout errors gracefully and still throw ApiError', async () => {
      // Mock fetch to return 401
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 401,
        ok: false,
      });

      // Mock fetchAuthSession
      const { fetchAuthSession } = require('aws-amplify/auth');
      fetchAuthSession.mockResolvedValueOnce({
        tokens: {
          idToken: {
            toString: () => 'mock-token',
          },
        },
      });

      // Mock logoutUser to throw error
      (logoutUser as jest.Mock).mockRejectedValueOnce(new Error('Logout failed'));

      // Should still throw ApiError even if logout fails
      await expect(profileApi.getProfile()).rejects.toThrow(ApiError);
      
      // Verify logout was attempted
      expect(logoutUser).toHaveBeenCalledTimes(1);
    });
  });

  describe('Other API errors', () => {
    it('should handle non-401 errors normally without logout', async () => {
      // Mock fetch to return 500
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Internal server error' }),
      });

      // Mock fetchAuthSession
      const { fetchAuthSession } = require('aws-amplify/auth');
      fetchAuthSession.mockResolvedValueOnce({
        tokens: {
          idToken: {
            toString: () => 'mock-token',
          },
        },
      });

      try {
        await profileApi.getProfile();
        fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).message).toBe('Internal server error');
      }

      // Should NOT logout for non-401 errors
      expect(logoutUser).not.toHaveBeenCalled();
    });

    it('should handle successful API calls', async () => {
      const mockProfile = {
        userId: 'user-123',
        email: 'test@example.com',
        nombre: 'Test',
        apellido: 'User',
        profileImage: null,
        createdAt: '2024-01-01T00:00:00Z',
      };

      // Mock fetch to return success
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => mockProfile,
      });

      // Mock fetchAuthSession
      const { fetchAuthSession } = require('aws-amplify/auth');
      fetchAuthSession.mockResolvedValueOnce({
        tokens: {
          idToken: {
            toString: () => 'mock-token',
          },
        },
      });

      const result = await profileApi.getProfile();

      expect(result).toEqual(mockProfile);
      expect(logoutUser).not.toHaveBeenCalled();
    });
  });
});
