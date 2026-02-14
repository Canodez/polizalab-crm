import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth-context';
import * as authModule from '../auth';

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
  const { user, isAuthenticated, isLoading, error, login, logout, refreshUser } = useAuth();

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

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleLogout}>Logout</button>
      <button onClick={handleRefresh}>Refresh</button>
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
      expect(screen.getByTestId('error')).toHaveTextContent('Session expired. Please login again.');
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
      expect(screen.getByTestId('error')).toHaveTextContent('Session expired. Please login again.');
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
        expect(screen.getByTestId('error')).toHaveTextContent('Login failed');
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
});
