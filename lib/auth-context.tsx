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
      const authenticated = await checkIsAuthenticated();
      
      if (authenticated) {
        const user = await getCurrentUser();
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
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load user',
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
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
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
      const user = await getCurrentUser();
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh user',
      });
      throw error;
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshUser,
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
