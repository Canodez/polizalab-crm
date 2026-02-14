# Authentication Library

This directory contains the authentication utilities and context for the PolizaLab MVP application.

## Files

- `auth.ts` - Core authentication functions using AWS Cognito
- `auth-context.tsx` - React Context and hooks for managing auth state
- `constants.ts` - Application constants

## Usage

### 1. Wrap your app with AuthProvider

```tsx
// app/layout.tsx
import { AuthProvider } from '@/lib/auth-context';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### 2. Use the useAuth hook in components

```tsx
'use client';

import { useAuth } from '@/lib/auth-context';

export function LoginForm() {
  const { login, isLoading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      // Redirect to home page
    } catch (err) {
      // Error is already set in context state
      console.error('Login failed:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}
      {/* form fields */}
      <button disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

### 3. Access user information

```tsx
'use client';

import { useAuth } from '@/lib/auth-context';

export function UserProfile() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <p>Email: {user.email}</p>
      <p>User ID: {user.userId}</p>
      <p>Email Verified: {user.emailVerified ? 'Yes' : 'No'}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### 4. Protect routes

```tsx
'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProtectedPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <div>Protected content</div>;
}
```

### 5. Refresh user data

```tsx
'use client';

import { useAuth } from '@/lib/auth-context';

export function RefreshButton() {
  const { refreshUser, isLoading } = useAuth();

  const handleRefresh = async () => {
    try {
      await refreshUser();
      console.log('User data refreshed');
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  return (
    <button onClick={handleRefresh} disabled={isLoading}>
      Refresh User Data
    </button>
  );
}
```

## API Reference

### AuthProvider

React context provider that manages authentication state.

**Props:**
- `children: React.ReactNode` - Child components

### useAuth()

Hook to access authentication context.

**Returns:**
- `user: CurrentUser | null` - Current authenticated user
- `isAuthenticated: boolean` - Whether user is authenticated
- `isLoading: boolean` - Whether an auth operation is in progress
- `error: string | null` - Current error message
- `login: (email: string, password: string) => Promise<void>` - Login function
- `logout: () => Promise<void>` - Logout function
- `refreshUser: () => Promise<void>` - Refresh user data function

**Throws:**
- Error if used outside AuthProvider

### CurrentUser

```typescript
interface CurrentUser {
  userId: string;      // Cognito sub (UUID)
  email: string;       // User email
  emailVerified: boolean; // Email verification status
}
```

## Features

- ✅ Automatic token management
- ✅ Token storage in localStorage
- ✅ Automatic user loading on mount
- ✅ Token expiration handling
- ✅ Error state management
- ✅ Loading state management
- ✅ Type-safe with TypeScript
- ✅ Comprehensive test coverage

## Token Refresh

The context automatically handles token expiration:
- When `getCurrentUser()` fails with "NotAuthorizedException", tokens are cleared
- The user is set to unauthenticated state
- The error message prompts the user to login again
- Use the `refreshUser()` function to manually refresh user data

## Error Handling

All auth operations catch errors and update the context state:
- Errors are stored in the `error` state
- Loading state is properly managed
- Failed operations don't leave the app in an inconsistent state
- Errors are also thrown so components can handle them if needed

## Testing

Run tests with:
```bash
npm test lib/__tests__/auth-context.test.tsx
```

All authentication functionality is thoroughly tested including:
- Provider initialization
- Login/logout flows
- Token refresh
- Error handling
- Loading states
