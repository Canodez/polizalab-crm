import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth-context';
import * as authModule from '../auth';
import { Hub } from 'aws-amplify/utils';

// Mock the auth module
jest.mock('../auth');

const mockLoginUser = authModule.loginUser as jest.MockedFunction<typeof authModule.loginUser>;
const mockLogoutUser = authModule.logoutUser as jest.MockedFunction<typeof authModule.logoutUser>;
const mockGetCurrentUser = authModule.getCurrentUser as jest.MockedFunction<
  typeof authModule.getCurrentUser
>;
const mockIsAuthenticated = authModule.isAuthenticated as jest.MockedFunction<
  typeof authModule.isAuthenticated
>;

// Test component that uses the auth hook
function TestComponent() {
  const { user, isAuthenticated, isLoading, error, login, logout, refreshUser, checkSession } = useAuth();
  const [sessionStatus, setSessionStatus] = React.useState<boolean | null>(null);

  const handleLogin = async () => {
    try {
      await login('test@example.com', 'password');
    } catch (err) {
      // Error is already handled in context
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // Error is already handled in context
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshUser();
    } catch (err) {
      // Error is already handled in context
    }
  };

  const handleCheckSession = async () => {
    const status = await checkSession();
    setSessionStatus(status);
  };

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
      <div data-testid="session-status">{sessionStatus === null ? 'not-checked' : sessionStatus ? 'active' : 'inactive'}</div>
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleLogout}>Logout</button>
      <button onClick={handleRefresh}>Refresh</button>
      <button onClick={handleCheckSession}>Check Session</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AuthProvider initialization', () => {
    it('should initialize with loading state', () => {
      mockIsAuthenticated.mockReturnValue(false);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });

    it('should load authenticated user on mount', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('error')).toHaveTextContent('no-error');
    });

    it('should handle no stored tokens on mount', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('error')).toHaveTextContent('no-error');
    });

    it('should handle expired token on mount', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockRejectedValue(new Error('Session expired. Please login again.'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('error')).toHaveTextContent('Sesión expirada');
    });
  });

  describe('login', () => {
    it('should successfully login user', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(false);
      mockLoginUser.mockResolvedValue({
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
      });
      mockGetCurrentUser.mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('error')).toHaveTextContent('no-error');
      expect(mockLoginUser).toHaveBeenCalledWith('test@example.com', 'password');
      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    it('should handle login failure', async () => {
      mockIsAuthenticated.mockReturnValue(false);
      mockLoginUser.mockRejectedValue(new Error('Invalid email or password'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Invalid email or password');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });

    it('should set loading state during login', async () => {
      mockIsAuthenticated.mockReturnValue(false);
      mockLoginUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({} as any), 100))
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const loginButton = screen.getByText('Login');
      act(() => {
        loginButton.click();
      });

      // Should show loading immediately
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogoutUser.mockResolvedValue();

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('error')).toHaveTextContent('no-error');
      expect(mockLogoutUser).toHaveBeenCalled();
    });

    it('should clear state even if logout fails', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogoutUser.mockRejectedValue(new Error('Network error'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    });
  });

  describe('refreshUser', () => {
    it('should successfully refresh user data', async () => {
      const initialUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: false,
      };

      const updatedUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(initialUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      // Clear previous calls and set up new mock for refresh
      mockGetCurrentUser.mockClear();
      mockGetCurrentUser.mockResolvedValueOnce(updatedUser);

      const refreshButton = screen.getByText('Refresh');
      await act(async () => {
        refreshButton.click();
      });

      await waitFor(() => {
        expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });

    it('should handle refresh failure and clear state', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      // Now set up for refresh failure
      mockGetCurrentUser.mockRejectedValueOnce(new Error('Session expired. Please login again.'));

      const refreshButton = screen.getByText('Refresh');
      await act(async () => {
        refreshButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('error')).toHaveTextContent('Sesión expirada');
    });
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle unknown error types during login', async () => {
      mockIsAuthenticated.mockReturnValue(false);
      mockLoginUser.mockRejectedValue('Unknown error');

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Error al iniciar sesión');
      });
    });

    it('should handle unknown error types during logout', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogoutUser.mockRejectedValue('Unknown error');

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      const logoutButton = screen.getByText('Logout');
      await act(async () => {
        logoutButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Logout failed');
      });
    });

    it('should handle unknown error types during refresh', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValueOnce(mockUser).mockRejectedValueOnce('Unknown error');

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      const refreshButton = screen.getByText('Refresh');
      await act(async () => {
        refreshButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to refresh user');
      });
    });
  });

  describe('Hub events - token refresh failure', () => {
    it('should handle tokenRefresh_failure event and update state', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      // Simulate tokenRefresh_failure event
      await act(async () => {
        Hub.dispatch('auth', {
          event: 'tokenRefresh_failure',
          data: {},
          message: 'Token refresh failed',
        });
      });

      // Should update state to not authenticated
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      });

      // Should show error message
      expect(screen.getByTestId('error')).toHaveTextContent('Sesión expirada');

      // Should clear user
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');

      // Note: Redirect to /login?expired=true is tested in E2E tests
    });

    it('should handle signedOut event', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockReturnValue(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      // Simulate signedOut event
      await act(async () => {
        Hub.dispatch('auth', {
          event: 'signedOut',
          data: {},
          message: 'User signed out',
        });
      });

      // Should update state to not authenticated
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      });

      // Should clear user
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');

      // Should not show error
      expect(screen.getByTestId('error')).toHaveTextContent('no-error');
    });
  });

  describe('checkSession method', () => {
    it('should return true when user is authenticated', async () => {
      mockIsAuthenticated.mockResolvedValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const checkButton = screen.getByText('Check Session');
      await act(async () => {
        checkButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-status')).toHaveTextContent('active');
      });

      expect(mockIsAuthenticated).toHaveBeenCalled();
    });

    it('should return false when user is not authenticated', async () => {
      mockIsAuthenticated.mockResolvedValue(false);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const checkButton = screen.getByText('Check Session');
      await act(async () => {
        checkButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-status')).toHaveTextContent('inactive');
      });
    });

    it('should return false on error without modifying state', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockResolvedValueOnce(true);
      mockGetCurrentUser.mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      // Now make checkSession fail
      mockIsAuthenticated.mockRejectedValueOnce(new Error('Network error'));

      const checkButton = screen.getByText('Check Session');
      await act(async () => {
        checkButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-status')).toHaveTextContent('inactive');
      });

      // State should remain unchanged
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });
  });

  describe('error classification and retry logic', () => {
    it('should show network error message for network failures', async () => {
      mockIsAuthenticated.mockReturnValue(false);
      const networkError = new Error('Network request failed');
      networkError.name = 'NetworkError';
      mockLoginUser.mockRejectedValue(networkError);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      const loginButton = screen.getByText('Login');
      await act(async () => {
        loginButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Error de conexión. Por favor verifica tu internet.');
      });
    });

    it('should show session expired message for auth errors', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      };

      mockIsAuthenticated.mockResolvedValueOnce(true);
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      });

      // Simulate session expiration on refresh
      const authError = new Error('Token expired');
      authError.name = 'NotAuthorizedException';
      mockGetCurrentUser.mockRejectedValueOnce(authError);

      const refreshButton = screen.getByText('Refresh');
      await act(async () => {
        refreshButton.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Sesión expirada');
      });
    });

    it('should retry network errors during loadUser', async () => {
      const networkError = new Error('Network request failed');
      networkError.name = 'NetworkError';

      // Track call count
      let callCount = 0;
      mockIsAuthenticated.mockImplementation(() => {
        callCount++;
        return Promise.reject(networkError);
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for loading to finish (after all retries)
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      }, { timeout: 15000 });

      // Should have retried 3 times
      expect(callCount).toBe(3);
      expect(screen.getByTestId('error')).toHaveTextContent('Error de conexión. Por favor verifica tu internet.');
    });

    it('should not retry authentication errors', async () => {
      const authError = new Error('Invalid credentials');
      authError.name = 'NotAuthorizedException';

      let callCount = 0;
      mockIsAuthenticated.mockImplementation(() => {
        callCount++;
        return Promise.reject(authError);
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      }, { timeout: 5000 });

      // Should only try once for auth errors
      expect(callCount).toBe(1);
      expect(screen.getByTestId('error')).toHaveTextContent('Sesión expirada');
    });

    it('should give up after max retries for network errors', async () => {
      const networkError = new Error('Network request failed');
      networkError.name = 'NetworkError';

      let callCount = 0;
      mockIsAuthenticated.mockImplementation(() => {
        callCount++;
        return Promise.reject(networkError);
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      }, { timeout: 15000 });

      // Should try 3 times (initial + 2 retries)
      expect(callCount).toBe(3);
      expect(screen.getByTestId('error')).toHaveTextContent('Error de conexión. Por favor verifica tu internet.');
    });
  });
});
