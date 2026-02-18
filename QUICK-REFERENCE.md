# 🚀 Quick Reference - Amplify Auth

## Development Server
```bash
npm run dev
# http://localhost:3000
```

## Build & Deploy
```bash
# Build
npm run build

# Deploy to S3
aws s3 sync out/ s3://polizalab-crm-frontend/ --delete --cache-control "public, max-age=31536000, immutable" --exclude "*.html" --exclude "*.json"
aws s3 sync out/ s3://polizalab-crm-frontend/ --cache-control "public, max-age=0, must-revalidate" --exclude "*" --include "*.html" --include "*.json"

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id E1WB95BQGR0YAT --paths "/*"
```

## Common Auth Operations

### Login
```typescript
import { signIn } from 'aws-amplify/auth';
await signIn({ username: email, password });
```

### Logout
```typescript
import { signOut } from 'aws-amplify/auth';
await signOut();
```

### Get Current User
```typescript
import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';
const { userId } = await getCurrentUser();
const attributes = await fetchUserAttributes();
```

### Get Tokens
```typescript
import { fetchAuthSession } from 'aws-amplify/auth';
const session = await fetchAuthSession();
const accessToken = session.tokens?.accessToken?.toString();
const idToken = session.tokens?.idToken?.toString();
```

### Check Authentication
```typescript
import { getCurrentUser } from 'aws-amplify/auth';
try {
  await getCurrentUser();
  // User is authenticated
} catch {
  // User is not authenticated
}
```

## Hub Events

### Listen to Auth Events
```typescript
import { Hub } from 'aws-amplify/utils';

Hub.listen('auth', ({ payload }) => {
  switch (payload.event) {
    case 'signedIn':
      console.log('User signed in');
      break;
    case 'signedOut':
      console.log('User signed out');
      break;
    case 'tokenRefresh':
      console.log('Token refreshed');
      break;
    case 'tokenRefresh_failure':
      console.log('Token refresh failed');
      break;
  }
});
```

## Debugging

### Check Auth State (Browser Console)
```javascript
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

// Check session
const session = await fetchAuthSession();
console.log('Session:', session);

// Check user
const user = await getCurrentUser();
console.log('User:', user);

// Check tokens
console.log('Access Token:', session.tokens?.accessToken?.toString());
console.log('ID Token:', session.tokens?.idToken?.toString());
```

### Clear Storage
```javascript
localStorage.clear();
location.reload();
```

### Monitor Hub Events
```javascript
import { Hub } from 'aws-amplify/utils';
Hub.listen('auth', (data) => console.log('Auth Event:', data));
```

## Configuration

### Environment Variables
```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_Q6BXG6CTj
NEXT_PUBLIC_COGNITO_CLIENT_ID=20fc4iknq837tjdk9gbtmvbfv9
NEXT_PUBLIC_API_GATEWAY_URL=https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod
```

### Amplify Config
```typescript
// lib/amplify-config.ts
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
    },
  },
};
```

## URLs

- **Local**: http://localhost:3000
- **Production**: https://d4srl7zbv9blh.cloudfront.net
- **API**: https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod

## AWS Resources

- **User Pool**: us-east-1_Q6BXG6CTj
- **App Client**: 20fc4iknq837tjdk9gbtmvbfv9
- **API Gateway**: f34orvshp5
- **S3 Bucket**: polizalab-crm-frontend
- **CloudFront**: E1WB95BQGR0YAT

## Troubleshooting

### Build fails
```bash
npm run build
# Check console for errors
```

### Auth not working
```javascript
// Clear storage
localStorage.clear();
location.reload();
```

### API returns 401
```bash
# Check authorizer
aws apigatewayv2 get-authorizer --api-id f34orvshp5 --authorizer-id 81fo73 --region us-east-1
```

### CORS errors
```bash
# Update CORS
aws apigatewayv2 update-api --api-id f34orvshp5 --cors-configuration AllowOrigins=http://localhost:3000,https://d4srl7zbv9blh.cloudfront.net --region us-east-1
```

## Testing

### Quick Test
1. Navigate to http://localhost:3000
2. Click "Crear cuenta"
3. Register with test@example.com / Test1234
4. Login
5. Edit profile
6. Logout

### Full Test Suite
See `TESTING-GUIDE.md` for 15 comprehensive test scenarios

## Documentation

- `MIGRATION-SUMMARY.md` - Complete overview
- `AMPLIFY-MIGRATION-COMPLETE.md` - Detailed migration info
- `TESTING-GUIDE.md` - Testing instructions
- `QUICK-REFERENCE.md` - This file

## Support

- Amplify Docs: https://docs.amplify.aws/react/
- AWS Console: https://console.aws.amazon.com/
- GitHub Issues: (your repo)

---

**Quick Start**: `npm run dev` → http://localhost:3000 → Test login flow
