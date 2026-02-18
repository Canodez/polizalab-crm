# Production-Grade Architecture: Next.js Static Site on AWS

## Executive Summary

**Current Problem:** CloudFront is serving stale cached content because of improper routing configuration and aggressive caching strategy.

**Root Cause:** Next.js generates BOTH `register.html` AND `register/index.html`, but CloudFront's error response configuration (`403/404 → index.html`) is masking routing issues.

**Solution:** Fix Next.js routing, update CloudFront configuration, and implement proper cache strategy.

---

## 1. STATIC ROUTING FIX (CRITICAL)

### Current State (BROKEN)
Next.js is generating:
```
out/
├── index.html          ← Root page
├── register.html       ← Flat file (PROBLEM)
├── login.html          ← Flat file (PROBLEM)
├── profile.html        ← Flat file (PROBLEM)
└── register/           ← Directory with metadata
    └── __next.register/
```

**Problem:** Next.js generates BOTH `register.html` and `register/` directory. CloudFront doesn't know which to serve.

### Correct Architecture (DIRECTORY-BASED)

Update `next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  reactCompiler: true,
  trailingSlash: true,  // ← ADD THIS
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

**Why `trailingSlash: true`?**
- Forces Next.js to generate `register/index.html` instead of `register.html`
- Makes S3/CloudFront routing deterministic
- Enables proper deep linking without CloudFront Functions
- Standard pattern for static hosting

### Expected Build Output

After adding `trailingSlash: true`:

```
out/
├── index.html
├── register/
│   └── index.html      ← Clean routing
├── login/
│   └── index.html      ← Clean routing
├── profile/
│   └── index.html      ← Clean routing
└── _next/
    └── static/
        └── chunks/     ← Versioned assets
```

### URL Behavior

| User Types | S3 Object Served | Works? |
|------------|------------------|--------|
| `/register` | `register/index.html` | ✅ Yes (S3 auto-appends `/`) |
| `/register/` | `register/index.html` | ✅ Yes (direct match) |
| `/login` | `login/index.html` | ✅ Yes |
| `/profile` | `profile/index.html` | ✅ Yes |

---

## 2. S3 BUCKET STRUCTURE

### Correct Object Layout

```
s3://polizalab-crm-frontend/
├── index.html                    ← Root page
├── 404.html                      ← Custom 404 page
├── register/
│   └── index.html
├── login/
│   └── index.html
├── profile/
│   └── index.html
├── _next/
│   └── static/
│       ├── chunks/
│       │   ├── 04516c4bbe1214d7.js
│       │   ├── 1627bf2f54f2038d.js
│       │   └── ...
│       ├── css/
│       │   └── 0fac9a6b89f18942.css
│       └── media/
│           └── favicon.0b3bf435.ico
└── favicon.ico
```

### Anti-Patterns to Avoid

❌ **DON'T:** Have both `register.html` AND `register/index.html`
❌ **DON'T:** Rely on CloudFront error responses for routing
❌ **DON'T:** Use CloudFront Functions for URL rewriting (unnecessary complexity)

✅ **DO:** Use directory-based routing (`trailingSlash: true`)
✅ **DO:** Let S3 handle index.html resolution
✅ **DO:** Keep routing simple and predictable

---

## 3. CLOUDFRONT CONFIGURATION

### Current Configuration (PROBLEMATIC)

```json
{
  "CustomErrorResponses": {
    "Items": [
      {
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",  ← WRONG
        "ResponseCode": "200"
      },
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",  ← WRONG
        "ResponseCode": "200"
      }
    ]
  }
}
```

**Problem:** This makes CloudFront serve `index.html` for ALL 404s, including `/register`, `/login`, etc. This is an SPA pattern, but we're NOT building an SPA.

### Correct Configuration

```json
{
  "DefaultRootObject": "index.html",
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-polizalab-crm-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "OriginRequestPolicyId": "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [
      {
        "PathPattern": "/_next/static/*",
        "TargetOriginId": "S3-polizalab-crm-frontend",
        "ViewerProtocolPolicy": "redirect-to-https",
        "Compress": true,
        "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
        "MinTTL": 31536000,
        "DefaultTTL": 31536000,
        "MaxTTL": 31536000
      }
    ]
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/404.html",
        "ResponseCode": "404",
        "ErrorCachingMinTTL": 10
      }
    ]
  }
}
```

### Cache Strategy

| Resource Type | Cache-Control Header | CloudFront TTL | Reasoning |
|---------------|---------------------|----------------|-----------|
| HTML pages (`*.html`) | `public, max-age=0, must-revalidate` | 0 seconds | Always check origin for updates |
| Versioned assets (`/_next/static/*`) | `public, max-age=31536000, immutable` | 1 year | Content-hashed, never changes |
| Images, fonts | `public, max-age=31536000, immutable` | 1 year | Rarely change |

### When to Use SPA Fallback

**Use `403/404 → index.html` ONLY if:**
- You're building a true SPA with client-side routing (React Router, Vue Router)
- All routes are handled by JavaScript in the browser
- You have a single `index.html` that bootstraps the entire app

**DON'T use it if:**
- You're using Next.js App Router with static export (like this project)
- Each route has its own HTML file
- You want proper SEO and deep linking

---

## 4. AUTH FLOW (AMPLIFY + COGNITO)

### Architecture Overview

```
┌─────────────┐
│   Browser   │
│  (Next.js)  │
└──────┬──────┘
       │
       │ 1. signUp/signIn
       ▼
┌─────────────────┐
│  Amplify Auth   │
│   (Frontend)    │
└──────┬──────────┘
       │
       │ 2. SRP Auth Flow
       ▼
┌─────────────────┐
│ Cognito User    │
│     Pool        │
└──────┬──────────┘
       │
       │ 3. Post-Confirmation Trigger
       ▼
┌─────────────────┐
│  Lambda         │
│  (Create        │
│   Profile)      │
└──────┬──────────┘
       │
       │ 4. PutItem
       ▼
┌─────────────────┐
│   DynamoDB      │
│  (Users table)  │
└─────────────────┘
```

### Best Practice: Authorization Code + PKCE

**Current Setup:** ✅ Correct - Using Amplify Auth with SRP (Secure Remote Password)

```typescript
// lib/amplify-config.ts
export default {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      loginWith: {
        email: true,
      },
    },
  },
};
```

**Why SRP is correct:**
- No secrets in frontend code
- Password never sent over network
- Cryptographic proof of password knowledge
- Built into Cognito, no custom implementation needed

### AuthProvider Location

**Current Setup:** ✅ Correct

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>  ← Wraps entire app
      </body>
    </html>
  );
}
```

**Why this is correct:**
- AuthProvider at root layout ensures auth state is available everywhere
- Single source of truth for authentication
- Survives navigation between pages
- Handles token refresh automatically

### Protected Routes (No SSR)

**Current Implementation:** ✅ Correct

```tsx
// app/profile/page.tsx
'use client';

export default function ProfilePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return null;

  return <div>Profile Content</div>;
}
```

**Why this works:**
- Client-side check (required for static export)
- Redirects unauthenticated users to login
- Shows loading state during auth check
- No flash of protected content

### API Calls with Access Tokens

**Current Implementation:** ✅ Correct

```typescript
// lib/api-client.ts
import { fetchAuthSession } from 'aws-amplify/auth';

export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  return response;
}
```

**Why this is correct:**
- Gets fresh token from Amplify (handles refresh automatically)
- Attaches token to Authorization header
- API Gateway validates JWT
- Lambda receives decoded user info in `event.requestContext.authorizer`

---

## 5. USER PROFILE CREATION

### Dual Approach (Best Practice)

**Primary:** Post-Confirmation Trigger (✅ Already Implemented)

```python
# lambda/post-confirmation-trigger/index.py
def lambda_handler(event, context):
    user_id = event['request']['userAttributes']['sub']
    email = event['request']['userAttributes']['email']
    
    table.put_item(Item={
        'userId': user_id,
        'email': email,
        'nombre': None,
        'apellido': None,
        'profileImage': None,
        'createdAt': datetime.utcnow().isoformat() + 'Z',
        'updatedAt': datetime.utcnow().isoformat() + 'Z'
    })
    
    return event  # Must return event for Cognito
```

**Safety Net:** Idempotent Upsert in Profile Lambda

```typescript
// lambda/profile-handler/index.ts
export async function handler(event: APIGatewayProxyEvent) {
  const userId = event.requestContext.authorizer?.claims.sub;
  
  if (event.httpMethod === 'GET') {
    try {
      const result = await dynamodb.get({
        TableName: 'Users',
        Key: { userId }
      }).promise();
      
      if (!result.Item) {
        // Profile doesn't exist - create it (safety net)
        const email = event.requestContext.authorizer?.claims.email;
        
        await dynamodb.put({
          TableName: 'Users',
          Item: {
            userId,
            email,
            nombre: null,
            apellido: null,
            profileImage: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          ConditionExpression: 'attribute_not_exists(userId)'  // Idempotent
        }).promise();
        
        return {
          statusCode: 200,
          body: JSON.stringify({ userId, email, nombre: null, apellido: null })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify(result.Item)
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to get profile' })
      };
    }
  }
}
```

### Why Dual Approach?

1. **Post-Confirmation Trigger (Primary)**
   - Creates profile immediately after email confirmation
   - User never sees 404 on first login
   - Cleanest user experience

2. **Idempotent Upsert (Safety Net)**
   - Handles edge cases (trigger failure, manual user creation, etc.)
   - Prevents 404 errors if profile doesn't exist
   - Uses `ConditionExpression` to avoid race conditions
   - No harm if profile already exists

### DynamoDB Best Practices

```typescript
// Partition Key
PK: userId (Cognito sub)  // UUID, globally unique

// Attributes
{
  userId: string,      // Cognito sub (UUID)
  email: string,       // User email
  nombre: string?,     // First name (optional)
  apellido: string?,   // Last name (optional)
  profileImage: string?, // S3 URL (optional)
  createdAt: string,   // ISO 8601 timestamp
  updatedAt: string    // ISO 8601 timestamp
}

// Conditional Writes (Idempotency)
ConditionExpression: 'attribute_not_exists(userId)'

// Update Pattern
UpdateExpression: 'SET nombre = :nombre, apellido = :apellido, updatedAt = :now'
```

---

## 6. DEPLOYMENT WORKFLOW

### Step-by-Step Process

```bash
# 1. Update Next.js config
# Add trailingSlash: true to next.config.ts

# 2. Build
npm run build

# 3. Verify output structure
ls -la out/
# Should see: register/, login/, profile/ (directories, not .html files)

# 4. Deploy to S3 (versioned assets first)
aws s3 sync out/ s3://polizalab-crm-frontend/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "*.json"

# 5. Deploy HTML files (no cache)
aws s3 sync out/ s3://polizalab-crm-frontend/ \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --include "*.json"

# 6. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --paths "/*"

# 7. Wait for invalidation (check status)
aws cloudfront get-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --id <INVALIDATION_ID>
```

### Update CloudFront Configuration

```bash
# 1. Get current config
aws cloudfront get-distribution-config \
  --id E1WB95BQGR0YAT \
  > current-config.json

# 2. Edit config (remove 403/404 → index.html)
# Update CustomErrorResponses to only handle 404 → 404.html

# 3. Update distribution
aws cloudfront update-distribution \
  --id E1WB95BQGR0YAT \
  --if-match <ETAG> \
  --distribution-config file://updated-config.json
```

---

## 7. FINAL VALIDATION CHECKLIST

### Pre-Deployment Checks

- [ ] `next.config.ts` has `trailingSlash: true`
- [ ] Build generates `register/index.html` (not `register.html`)
- [ ] CloudFront config removed `403 → index.html`
- [ ] CloudFront config has proper cache behaviors
- [ ] Post-Confirmation Lambda is deployed and configured
- [ ] Profile Lambda has idempotent upsert logic

### Post-Deployment Verification

```bash
# 1. Test routing (should NOT return index.html)
curl -I https://crm.antesdefirmar.org/register
# Expected: 200 OK, Content-Type: text/html

# 2. Test 404 (should return 404.html)
curl -I https://crm.antesdefirmar.org/nonexistent
# Expected: 404 Not Found

# 3. Test cache headers (HTML)
curl -I https://crm.antesdefirmar.org/register
# Expected: cache-control: public, max-age=0, must-revalidate

# 4. Test cache headers (assets)
curl -I https://crm.antesdefirmar.org/_next/static/chunks/04516c4bbe1214d7.js
# Expected: cache-control: public, max-age=31536000, immutable

# 5. Test CORS
curl -H "Origin: https://crm.antesdefirmar.org" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  https://f34orvshp5.execute-api.us-east-1.amazonaws.com/profile
# Expected: access-control-allow-origin: https://crm.antesdefirmar.org
```

### User Flow Testing

1. **Registration Flow**
   ```
   ✅ Navigate to /register
   ✅ Fill form and submit
   ✅ Receive confirmation email
   ✅ Confirm email (Lambda creates profile)
   ✅ Login redirects to /profile
   ✅ Profile loads without 404
   ```

2. **Login Flow**
   ```
   ✅ Navigate to /login
   ✅ Enter credentials
   ✅ Redirect to /profile
   ✅ Profile data loads from DynamoDB
   ✅ Token attached to API calls
   ```

3. **Protected Route**
   ```
   ✅ Navigate to /profile (not logged in)
   ✅ Redirect to /login
   ✅ After login, redirect back to /profile
   ```

4. **Deep Linking**
   ```
   ✅ Share link: https://crm.antesdefirmar.org/register
   ✅ Link opens correct page (not index.html)
   ✅ No 404 errors
   ```

5. **Cache Behavior**
   ```
   ✅ Update code and deploy
   ✅ Invalidate CloudFront
   ✅ New version loads immediately (no stale HTML)
   ✅ Assets load from cache (fast)
   ```

---

## 8. TROUBLESHOOTING

### Issue: CloudFront serves index.html for /register

**Cause:** `CustomErrorResponses` has `404 → index.html`

**Fix:**
```json
{
  "CustomErrorResponses": {
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/404.html",
        "ResponseCode": "404"
      }
    ]
  }
}
```

### Issue: Stale HTML after deployment

**Cause:** CloudFront cache not invalidated or HTML has long TTL

**Fix:**
```bash
# 1. Check cache headers
curl -I https://crm.antesdefirmar.org/register

# 2. Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --paths "/*"

# 3. Wait 5-10 minutes for propagation
```

### Issue: User profile 404 on first login

**Cause:** Post-Confirmation Lambda not triggered or failed

**Fix:**
```bash
# 1. Check Lambda logs
aws logs tail /aws/lambda/cognito-post-confirmation-trigger --follow

# 2. Verify trigger is configured
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_Q6BXG6CTj \
  --query 'UserPool.LambdaConfig'

# 3. Test Lambda manually
aws lambda invoke \
  --function-name cognito-post-confirmation-trigger \
  --payload file://test-event.json \
  response.json
```

### Issue: CORS errors from API Gateway

**Cause:** API Gateway CORS not configured for production domain

**Fix:**
```bash
aws apigatewayv2 update-api --api-id f34orvshp5 \
  --cors-configuration \
    AllowOrigins="http://localhost:3000,https://d4srl7zbv9blh.cloudfront.net,https://crm.antesdefirmar.org",\
    AllowMethods="GET,POST,PUT,DELETE,OPTIONS",\
    AllowHeaders="content-type,authorization",\
    AllowCredentials=true
```

---

## 9. MENTAL MODEL

### Simple Rules

1. **Routing:** Directory-based (`trailingSlash: true`)
2. **Caching:** HTML = no cache, Assets = forever
3. **Auth:** Amplify handles everything, just call the functions
4. **Profile:** Lambda creates it, API upserts if missing
5. **Deployment:** Build → S3 → Invalidate → Wait

### What NOT to Do

❌ Don't use `403/404 → index.html` for multi-page static sites
❌ Don't cache HTML files in CloudFront
❌ Don't rely on CloudFront Functions for routing
❌ Don't skip cache invalidation after deployment
❌ Don't assume Post-Confirmation Lambda always works (add safety net)

### What TO Do

✅ Use `trailingSlash: true` for clean routing
✅ Set `cache-control: max-age=0` for HTML
✅ Set `cache-control: immutable` for versioned assets
✅ Invalidate CloudFront after every deployment
✅ Add idempotent upsert in profile API as safety net

---

## 10. NEXT STEPS

### Immediate Actions (Critical)

1. **Update `next.config.ts`**
   ```typescript
   trailingSlash: true,  // Add this line
   ```

2. **Rebuild and redeploy**
   ```bash
   npm run build
   # Deploy to S3
   # Invalidate CloudFront
   ```

3. **Update CloudFront config**
   - Remove `403 → index.html`
   - Keep only `404 → 404.html`

4. **Test in production**
   - Navigate to `/register`
   - Verify correct page loads
   - Check cache headers

### Future Improvements

1. **Add CloudFront Cache Policy**
   - Create custom cache policy for HTML (no cache)
   - Create custom cache policy for assets (1 year)

2. **Add CloudFront Origin Request Policy**
   - Forward query strings for API calls
   - Forward headers for CORS

3. **Add Monitoring**
   - CloudWatch alarms for Lambda errors
   - CloudWatch alarms for API Gateway 5xx errors
   - CloudWatch dashboard for user signups

4. **Add CI/CD**
   - GitHub Actions for automated deployment
   - Run tests before deployment
   - Automatic cache invalidation

---

## Summary

**The core issue:** CloudFront is configured like an SPA but you're building a multi-page static site.

**The fix:** 
1. Add `trailingSlash: true` to Next.js config
2. Remove `403/404 → index.html` from CloudFront
3. Set proper cache headers (HTML = no cache, assets = forever)
4. Add idempotent upsert in profile API

**Result:** Clean, predictable routing with proper caching and zero 404s.
