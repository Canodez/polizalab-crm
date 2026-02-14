import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  isAuthenticated,
  getStoredAccessToken,
  getStoredIdToken,
} from '../auth';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cognito-identity-provider');

const mockSend = jest.fn();
const mockCognitoClient = CognitoIdentityProviderClient as jest.MockedClass<
  typeof CognitoIdentityProviderClient
>;

describe('Authentication Utilities', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();

    // Mock the Cognito client
    mockCognitoClient.prototype.send = mockSend;
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      const mockUserId = 'test-user-id-123';
      const email = 'test@example.com';
      const password = 'TestPassword123!';

      mockSend.mockResolvedValueOnce({
        UserSub: mockUserId,
      });

      const result = await registerUser(email, password);

      expect(result).toEqual({
        userId: mockUserId,
        email,
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(SignUpCommand));
    });

    it('should throw error when email already exists', async () => {
      const error = new Error('User already exists');
      error.name = 'UsernameExistsException';
      mockSend.mockRejectedValueOnce(error);

      await expect(registerUser('existing@example.com', 'Password123!')).rejects.toThrow(
        'An account with this email already exists'
      );
    });

    it('should throw error for invalid password', async () => {
      const error = new Error('Invalid password');
      error.name = 'InvalidPasswordException';
      mockSend.mockRejectedValueOnce(error);

      await expect(registerUser('test@example.com', 'weak')).rejects.toThrow(
        'Password does not meet requirements'
      );
    });

    it('should throw error for invalid email format', async () => {
      const error = new Error('Invalid parameter');
      error.name = 'InvalidParameterException';
      mockSend.mockRejectedValueOnce(error);

      await expect(registerUser('invalid-email', 'Password123!')).rejects.toThrow(
        'Invalid email or password format'
      );
    });

    it('should throw error when no user ID is returned', async () => {
      mockSend.mockResolvedValueOnce({
        UserSub: undefined,
      });

      await expect(registerUser('test@example.com', 'Password123!')).rejects.toThrow(
        'Registration failed: No user ID returned'
      );
    });
  });

  describe('loginUser', () => {
    it('should successfully login and store tokens', async () => {
      const email = 'test@example.com';
      const password = 'Password123!';
      const mockTokens = {
        AccessToken: 'mock-access-token',
        IdToken: 'mock-id-token',
        RefreshToken: 'mock-refresh-token',
      };

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: mockTokens,
      });

      const result = await loginUser(email, password);

      expect(result).toEqual({
        accessToken: mockTokens.AccessToken,
        idToken: mockTokens.IdToken,
        refreshToken: mockTokens.RefreshToken,
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(InitiateAuthCommand));
      expect(localStorage.getItem('polizalab_access_token')).toBe(mockTokens.AccessToken);
      expect(localStorage.getItem('polizalab_id_token')).toBe(mockTokens.IdToken);
      expect(localStorage.getItem('polizalab_refresh_token')).toBe(mockTokens.RefreshToken);
      expect(localStorage.getItem('polizalab_user_email')).toBe(email);
    });

    it('should throw error for invalid credentials', async () => {
      const error = new Error('Incorrect username or password');
      error.name = 'NotAuthorizedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(loginUser('test@example.com', 'WrongPassword')).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should throw error for non-existent user', async () => {
      const error = new Error('User does not exist');
      error.name = 'UserNotFoundException';
      mockSend.mockRejectedValueOnce(error);

      await expect(loginUser('nonexistent@example.com', 'Password123!')).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should throw error for unconfirmed user', async () => {
      const error = new Error('User is not confirmed');
      error.name = 'UserNotConfirmedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(loginUser('unconfirmed@example.com', 'Password123!')).rejects.toThrow(
        'Please verify your email before logging in'
      );
    });

    it('should throw error when tokens are missing', async () => {
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'token',
          // Missing IdToken and RefreshToken
        },
      });

      await expect(loginUser('test@example.com', 'Password123!')).rejects.toThrow(
        'Login failed: Invalid response from authentication service'
      );
    });
  });

  describe('logoutUser', () => {
    it('should successfully logout and clear tokens', async () => {
      // Set up stored tokens
      localStorage.setItem('polizalab_access_token', 'mock-access-token');
      localStorage.setItem('polizalab_id_token', 'mock-id-token');
      localStorage.setItem('polizalab_refresh_token', 'mock-refresh-token');
      localStorage.setItem('polizalab_user_email', 'test@example.com');

      mockSend.mockResolvedValueOnce({});

      await logoutUser();

      expect(mockSend).toHaveBeenCalledWith(expect.any(GlobalSignOutCommand));
      expect(localStorage.getItem('polizalab_access_token')).toBeNull();
      expect(localStorage.getItem('polizalab_id_token')).toBeNull();
      expect(localStorage.getItem('polizalab_refresh_token')).toBeNull();
      expect(localStorage.getItem('polizalab_user_email')).toBeNull();
    });

    it('should clear tokens even if Cognito signout fails', async () => {
      localStorage.setItem('polizalab_access_token', 'mock-access-token');

      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await logoutUser();

      // Tokens should still be cleared
      expect(localStorage.getItem('polizalab_access_token')).toBeNull();
    });

    it('should handle logout when no tokens are stored', async () => {
      await logoutUser();

      expect(mockSend).not.toHaveBeenCalled();
      expect(localStorage.getItem('polizalab_access_token')).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('should successfully get current user info', async () => {
      localStorage.setItem('polizalab_access_token', 'mock-access-token');

      const mockUserAttributes = [
        { Name: 'sub', Value: 'user-id-123' },
        { Name: 'email', Value: 'test@example.com' },
        { Name: 'email_verified', Value: 'true' },
      ];

      mockSend.mockResolvedValueOnce({
        Username: 'test@example.com',
        UserAttributes: mockUserAttributes,
      });

      const result = await getCurrentUser();

      expect(result).toEqual({
        userId: 'user-id-123',
        email: 'test@example.com',
        emailVerified: true,
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetUserCommand));
    });

    it('should throw error when not authenticated', async () => {
      await expect(getCurrentUser()).rejects.toThrow('Not authenticated');
    });

    it('should throw error and clear tokens when token is expired', async () => {
      localStorage.setItem('polizalab_access_token', 'expired-token');

      const error = new Error('Token expired');
      error.name = 'NotAuthorizedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(getCurrentUser()).rejects.toThrow('Session expired. Please login again.');
      expect(localStorage.getItem('polizalab_access_token')).toBeNull();
    });

    it('should throw error when user attributes are missing', async () => {
      localStorage.setItem('polizalab_access_token', 'mock-access-token');

      mockSend.mockResolvedValueOnce({
        Username: 'test@example.com',
        UserAttributes: [
          { Name: 'sub', Value: 'user-id-123' },
          // Missing email attribute
        ],
      });

      await expect(getCurrentUser()).rejects.toThrow('Missing required user attributes');
    });

    it('should handle email_verified as false', async () => {
      localStorage.setItem('polizalab_access_token', 'mock-access-token');

      mockSend.mockResolvedValueOnce({
        Username: 'test@example.com',
        UserAttributes: [
          { Name: 'sub', Value: 'user-id-123' },
          { Name: 'email', Value: 'test@example.com' },
          { Name: 'email_verified', Value: 'false' },
        ],
      });

      const result = await getCurrentUser();

      expect(result.emailVerified).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when access token exists', () => {
      localStorage.setItem('polizalab_access_token', 'mock-access-token');
      expect(isAuthenticated()).toBe(true);
    });

    it('should return false when no access token exists', () => {
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('getStoredAccessToken', () => {
    it('should return access token when it exists', () => {
      localStorage.setItem('polizalab_access_token', 'mock-access-token');
      expect(getStoredAccessToken()).toBe('mock-access-token');
    });

    it('should return null when no access token exists', () => {
      expect(getStoredAccessToken()).toBeNull();
    });
  });

  describe('getStoredIdToken', () => {
    it('should return ID token when it exists', () => {
      localStorage.setItem('polizalab_id_token', 'mock-id-token');
      expect(getStoredIdToken()).toBe('mock-id-token');
    });

    it('should return null when no ID token exists', () => {
      expect(getStoredIdToken()).toBeNull();
    });
  });

  describe('Token expiration handling', () => {
    it('should handle token expiration during getCurrentUser', async () => {
      localStorage.setItem('polizalab_access_token', 'expired-token');
      localStorage.setItem('polizalab_id_token', 'expired-id-token');

      const error = new Error('Token expired');
      error.name = 'NotAuthorizedException';
      mockSend.mockRejectedValueOnce(error);

      await expect(getCurrentUser()).rejects.toThrow('Session expired');

      // All tokens should be cleared
      expect(localStorage.getItem('polizalab_access_token')).toBeNull();
      expect(localStorage.getItem('polizalab_id_token')).toBeNull();
    });
  });

  describe('Network error scenarios', () => {
    it('should handle network errors during login', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(loginUser('test@example.com', 'Password123!')).rejects.toThrow(
        'Login failed: Network error'
      );
    });

    it('should handle network errors during registration', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      await expect(registerUser('test@example.com', 'Password123!')).rejects.toThrow(
        'Registration failed: Network error'
      );
    });
  });
});
