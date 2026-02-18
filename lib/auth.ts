import {
  signUp,
  signIn,
  signOut,
  getCurrentUser as amplifyGetCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth';

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
    const { userId } = await signUp({
      username: email,
      password,
      options: {
        userAttributes: {
          email,
        },
        autoSignIn: false,
      },
    });

    if (!userId) {
      throw new Error('Registration failed: No user ID returned');
    }

    return {
      userId,
      email,
    };
  } catch (error: any) {
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
    throw new Error(`Registration failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Login user with email and password
 * @param email - User email address
 * @param password - User password
 * @returns Promise that resolves when login is successful
 * @throws Error if login fails
 */
export async function loginUser(email: string, password: string): Promise<void> {
  try {
    const { isSignedIn } = await signIn({
      username: email,
      password,
    });

    if (!isSignedIn) {
      throw new Error('Login failed: User not signed in');
    }
  } catch (error: any) {
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
    throw new Error(`Login failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Logout current user and clear session
 * @throws Error if logout fails
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut();
  } catch (error: any) {
    throw new Error(`Logout failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get current authenticated user information
 * @returns Promise with current user info
 * @throws Error if not authenticated or request fails
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    await amplifyGetCurrentUser();
    const attributes = await fetchUserAttributes();

    if (!attributes.email || !attributes.sub) {
      throw new Error('Missing required user attributes');
    }

    return {
      userId: attributes.sub,
      email: attributes.email,
      emailVerified: attributes.email_verified === 'true',
    };
  } catch (error: any) {
    if (error.name === 'UserUnAuthenticatedException') {
      throw new Error('Not authenticated');
    }
    throw new Error(`Failed to get current user: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Check if user is currently authenticated
 * @returns true if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    await amplifyGetCurrentUser();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current access token
 * @returns Access token or null if not authenticated
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}

/**
 * Get current ID token
 * @returns ID token or null if not authenticated
 */
export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}
