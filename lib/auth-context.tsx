'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import amplifyConfig from './amplify-config';
import {
  loginUser,
  logoutUser,
  getCurrentUser,
  isAuthenticated as checkIsAuthenticated,
  type CurrentUser,
} from './auth';

// Configure Amplify (only runs once)
Amplify.configure(amplifyConfig, { ssr: false });

/**
 * Error types for better error handling
 */
enum AuthErrorType {
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Classify error type based on error object
 */
function classifyError(error: any): AuthErrorType {
  // Network errors
  if (
    error.message?.includes('Network') ||
    error.message?.includes('network') ||
    error.message?.includes('fetch') ||
    error.name === 'NetworkError' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT'
  ) {
    return AuthErrorType.NETWORK_ERROR;
  }

  // Session expired / authentication errors
  if (
    error.name === 'NotAuthorizedException' ||
    error.name === 'UserUnAuthenticatedException' ||
    error.message?.includes('expired') ||
    error.message?.includes('Not authenticated')
  ) {
    return AuthErrorType.SESSION_EXPIRED;
  }

  // Other authentication errors
  if (
    error.name === 'InvalidPasswordException' ||
    error.name === 'UserNotFoundException' ||
    error.message?.includes('Invalid')
  ) {
    return AuthErrorType.AUTHENTICATION_ERROR;
  }

  return AuthErrorType.UNKNOWN_ERROR;
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorType = classifyError(error);

      // Only retry network errors
      if (errorType !== AuthErrorType.NETWORK_ERROR) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Authentication state
 */
interface AuthState {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Authentication context value
 */
interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkSession: () => Promise<boolean>;
}

/**
 * Authentication context
 */
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Authentication provider props
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider component
 * Manages authentication state and provides auth methods to child components
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  /**
   * Load user from Amplify session
   */
  const loadUser = useCallback(async () => {
    try {
      const authenticated = await retryWithBackoff(
        () => checkIsAuthenticated(),
        3,
        1000
      );
      
      if (authenticated) {
        const user = await retryWithBackoff(
          () => getCurrentUser(),
          3,
          1000
        );
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      const errorType = classifyError(error);
      let errorMessage = 'Failed to load user';

      if (errorType === AuthErrorType.SESSION_EXPIRED) {
        errorMessage = 'Sesión expirada';
      } else if (errorType === AuthErrorType.NETWORK_ERROR) {
        errorMessage = 'Error de conexión. Por favor verifica tu internet.';
      } else if (errorType === AuthErrorType.AUTHENTICATION_ERROR) {
        errorMessage = 'Error de autenticación';
      }

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
    }
  }, []);

  /**
   * Initialize auth state on mount and listen to auth events
   */
  useEffect(() => {
    loadUser();

    // Listen to Amplify auth events
    const hubListener = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          loadUser();
          break;
        case 'signedOut':
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
          break;
        case 'tokenRefresh':
          // Token refreshed successfully
          break;
        case 'tokenRefresh_failure':
          // Token refresh failed - user needs to re-authenticate
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: 'Sesión expirada',
          });
          // Redirect to login with expired flag (only in browser)
          if (typeof window !== 'undefined') {
            window.location.assign('/login?expired=true');
          }
          break;
      }
    });

    return () => hubListener();
  }, [loadUser]);

  /**
   * Login user with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await loginUser(email, password);
      const user = await getCurrentUser();

      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      // Trigger profile fetch to update lastLoginAt in DynamoDB
      // This is done asynchronously and doesn't block the login flow
      if (typeof window !== 'undefined') {
        // Import profileApi dynamically to avoid circular dependencies
        import('./api-client').then(({ profileApi }) => {
          profileApi.getProfile().catch(error => {
            console.error('Failed to update lastLoginAt on login:', error);
          });
        });
      }
    } catch (error) {
      const errorType = classifyError(error);
      let errorMessage = 'Login failed';

      if (errorType === AuthErrorType.NETWORK_ERROR) {
        errorMessage = 'Error de conexión. Por favor verifica tu internet.';
      } else if (errorType === AuthErrorType.AUTHENTICATION_ERROR) {
        errorMessage = error instanceof Error ? error.message : 'Credenciales inválidas';
      } else {
        errorMessage = error instanceof Error ? error.message : 'Error al iniciar sesión';
      }

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  }, []);

  /**
   * Logout current user
   */
  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await logoutUser();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Even if logout fails, clear local state
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      });
      throw error;
    }
  }, []);

  /**
   * Refresh user data from Cognito
   */
  const refreshUser = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const user = await retryWithBackoff(
        () => getCurrentUser(),
        3,
        1000
      );
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const errorType = classifyError(error);
      let errorMessage = 'Failed to refresh user';

      if (errorType === AuthErrorType.SESSION_EXPIRED) {
        errorMessage = 'Sesión expirada';
      } else if (errorType === AuthErrorType.NETWORK_ERROR) {
        errorMessage = 'Error de conexión. Por favor verifica tu internet.';
      }

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  }, []);

  /**
   * Check current session status
   * Returns true if user is authenticated, false otherwise
   * Does not modify state, only checks current authentication status
   */
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      const authenticated = await checkIsAuthenticated();
      return authenticated;
    } catch (error) {
      console.error('Error checking session:', error);
      return false;
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshUser,
    checkSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication context
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
