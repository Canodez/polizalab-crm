import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';

// Environment variables for Cognito configuration
const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_REGION,
});

// Token storage keys
const TOKEN_STORAGE_KEYS = {
  ACCESS_TOKEN: 'polizalab_access_token',
  ID_TOKEN: 'polizalab_id_token',
  REFRESH_TOKEN: 'polizalab_refresh_token',
  USER_EMAIL: 'polizalab_user_email',
} as const;

/**
 * Authentication tokens returned from Cognito
 */
export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

/**
 * Current user information
 */
export interface CurrentUser {
  userId: string; // Cognito sub
  email: string;
  emailVerified: boolean;
}

/**
 * Register a new user with Cognito
 * @param email - User email address
 * @param password - User password
 * @returns Promise with userId (Cognito sub)
 * @throws Error if registration fails
 */
export async function registerUser(
  email: string,
  password: string
): Promise<{ userId: string; email: string }> {
  try {
    const command = new SignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email,
        },
      ],
    });

    const response = await cognitoClient.send(command);

    if (!response.UserSub) {
      throw new Error('Registration failed: No user ID returned');
    }

    return {
      userId: response.UserSub,
      email,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific Cognito errors
      if (error.name === 'UsernameExistsException') {
        throw new Error('An account with this email already exists');
      }
      if (error.name === 'InvalidPasswordException') {
        throw new Error('Password does not meet requirements');
      }
      if (error.name === 'InvalidParameterException') {
        throw new Error('Invalid email or password format');
      }
      throw new Error(`Registration failed: ${error.message}`);
    }
    throw new Error('Registration failed: Unknown error');
  }
}

/**
 * Login user with email and password
 * @param email - User email address
 * @param password - User password
 * @returns Promise with authentication tokens
 * @throws Error if login fails
 */
export async function loginUser(
  email: string,
  password: string
): Promise<AuthTokens> {
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await cognitoClient.send(command);

    if (
      !response.AuthenticationResult?.AccessToken ||
      !response.AuthenticationResult?.IdToken ||
      !response.AuthenticationResult?.RefreshToken
    ) {
      throw new Error('Login failed: Invalid response from authentication service');
    }

    const tokens: AuthTokens = {
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
    };

    // Store tokens securely
    storeTokens(tokens, email);

    return tokens;
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific Cognito errors
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Invalid email or password');
      }
      if (error.name === 'UserNotFoundException') {
        throw new Error('Invalid email or password');
      }
      if (error.name === 'UserNotConfirmedException') {
        throw new Error('Please verify your email before logging in');
      }
      throw new Error(`Login failed: ${error.message}`);
    }
    throw new Error('Login failed: Unknown error');
  }
}

/**
 * Logout current user and clear session
 * @throws Error if logout fails
 */
export async function logoutUser(): Promise<void> {
  try {
    const accessToken = getStoredAccessToken();

    if (accessToken) {
      // Sign out from Cognito (invalidates all tokens)
      const command = new GlobalSignOutCommand({
        AccessToken: accessToken,
      });

      try {
        await cognitoClient.send(command);
      } catch (error) {
        // Continue with local cleanup even if Cognito signout fails
        console.error('Cognito signout failed:', error);
      }
    }

    // Clear all stored tokens
    clearTokens();
  } catch (error) {
    // Always clear local tokens even if Cognito call fails
    clearTokens();
    if (error instanceof Error) {
      throw new Error(`Logout failed: ${error.message}`);
    }
    throw new Error('Logout failed: Unknown error');
  }
}

/**
 * Get current authenticated user information
 * @returns Promise with current user info
 * @throws Error if not authenticated or request fails
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    const accessToken = getStoredAccessToken();

    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    const response = await cognitoClient.send(command);

    if (!response.Username || !response.UserAttributes) {
      throw new Error('Failed to retrieve user information');
    }

    // Extract user attributes
    const emailAttr = response.UserAttributes.find((attr) => attr.Name === 'email');
    const emailVerifiedAttr = response.UserAttributes.find(
      (attr) => attr.Name === 'email_verified'
    );
    const subAttr = response.UserAttributes.find((attr) => attr.Name === 'sub');

    if (!emailAttr?.Value || !subAttr?.Value) {
      throw new Error('Missing required user attributes');
    }

    return {
      userId: subAttr.Value,
      email: emailAttr.Value,
      emailVerified: emailVerifiedAttr?.Value === 'true',
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotAuthorizedException') {
        // Token expired or invalid - clear stored tokens
        clearTokens();
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(`Failed to get current user: ${error.message}`);
    }
    throw new Error('Failed to get current user: Unknown error');
  }
}

/**
 * Check if user is currently authenticated
 * @returns true if user has valid tokens stored
 */
export function isAuthenticated(): boolean {
  return !!getStoredAccessToken();
}

/**
 * Get stored access token
 * @returns Access token or null if not found
 */
export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Get stored ID token
 * @returns ID token or null if not found
 */
export function getStoredIdToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(TOKEN_STORAGE_KEYS.ID_TOKEN);
}

/**
 * Store authentication tokens securely
 * Note: For MVP, using localStorage. In production, consider httpOnly cookies
 * or more secure storage mechanisms.
 */
function storeTokens(tokens: AuthTokens, email: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
  localStorage.setItem(TOKEN_STORAGE_KEYS.ID_TOKEN, tokens.idToken);
  localStorage.setItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  localStorage.setItem(TOKEN_STORAGE_KEYS.USER_EMAIL, email);
}

/**
 * Clear all stored authentication tokens
 */
function clearTokens(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(TOKEN_STORAGE_KEYS.ID_TOKEN);
  localStorage.removeItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(TOKEN_STORAGE_KEYS.USER_EMAIL);
}
