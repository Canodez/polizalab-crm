# 🧪 Testing Guide - Amplify Auth Migration

## Quick Start

The development server is running at: **http://localhost:3000**

---

## Pre-Test Setup

### 1. Clear Browser Data
Before testing, clear your browser's localStorage:

**Chrome/Edge:**
1. Open DevTools (F12)
2. Go to Application tab
3. Click "Clear site data"
4. Refresh page

**Or use Console:**
```javascript
localStorage.clear();
location.reload();
```

### 2. Check Environment Variables
Verify `.env.local` has correct values:
```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_Q6BXG6CTj
NEXT_PUBLIC_COGNITO_CLIENT_ID=20fc4iknq837tjdk9gbtmvbfv9
NEXT_PUBLIC_API_GATEWAY_URL=https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod
```

---

## Test Scenarios

### ✅ Test 1: Home Page (Unauthenticated)

**Steps:**
1. Navigate to http://localhost:3000
2. Should see landing page with:
   - "PolizaLab" title
   - Feature cards (Gestión de Pólizas, Clientes, Reportes)
   - "Crear cuenta" button
   - "Iniciar sesión" button

**Expected Result:**
- ✅ Page loads without errors
- ✅ No authentication required
- ✅ Buttons link to /register and /login

---

### ✅ Test 2: User Registration

**Steps:**
1. Click "Crear cuenta" or navigate to http://localhost:3000/register
2. Enter test credentials:
   - Email: `test@example.com`
   - Password: `Test1234` (min 8 chars, uppercase, lowercase, numbers)
   - Confirm Password: `Test1234`
3. Click "Crear cuenta"

**Expected Result:**
- ✅ Registration succeeds
- ✅ Redirects to `/login` with success message
- ✅ Message: "¡Cuenta creada exitosamente! Ahora puedes iniciar sesión."

**Check in AWS Console:**
```bash
# List users in Cognito
aws cognito-idp list-users --user-pool-id us-east-1_Q6BXG6CTj --region us-east-1
```

**Note:** Cognito will send a verification code to the email. For testing, you may need to verify the user manually or use a real email.

---

### ✅ Test 3: Email Verification (If Required)

If your Cognito is configured to require email verification:

**Steps:**
1. Check email for verification code
2. Use AWS CLI to confirm user (for testing):
```bash
aws cognito-idp admin-confirm-sign-up --user-pool-id us-east-1_Q6BXG6CTj --username test@example.com --region us-east-1
```

---

### ✅ Test 4: User Login

**Steps:**
1. Navigate to http://localhost:3000/login
2. Enter credentials:
   - Email: `test@example.com`
   - Password: `Test1234`
3. Click "Iniciar sesión"

**Expected Result:**
- ✅ Login succeeds
- ✅ Redirects to home page (`/`)
- ✅ Home page redirects to `/profile` (because user is authenticated)

**Check DevTools:**
1. Open DevTools → Application → Local Storage
2. Should see Amplify tokens stored (encrypted)

**Check Console:**
- No errors
- Should see Amplify auth events in console (if logging enabled)

---

### ✅ Test 5: Profile Page (Authenticated)

**Steps:**
1. After login, should be on http://localhost:3000/profile
2. Should see:
   - User email (read-only)
   - Nombre field (editable)
   - Apellido field (editable)
   - Profile image placeholder
   - "Editar perfil" button

**Expected Result:**
- ✅ Profile loads successfully
- ✅ Email is displayed correctly
- ✅ No loading errors

---

### ✅ Test 6: Edit Profile

**Steps:**
1. On profile page, click "Editar perfil"
2. Enter:
   - Nombre: `Juan`
   - Apellido: `Pérez`
3. Click "Guardar"

**Expected Result:**
- ✅ Profile updates successfully
- ✅ Success message: "Perfil actualizado correctamente"
- ✅ Fields show updated values

**Check API Call:**
1. Open DevTools → Network tab
2. Look for PUT request to `/profile`
3. Check Request Headers:
   - Should have `Authorization: Bearer <token>`
4. Check Response:
   - Should be 200 OK

**Verify in DynamoDB:**
```bash
# Get user from DynamoDB
aws dynamodb get-item --table-name Users --key '{"userId":{"S":"<cognito-sub>"}}' --region us-east-1
```

---

### ✅ Test 7: Page Refresh (Session Persistence)

**Steps:**
1. While logged in on profile page
2. Press F5 or Ctrl+R to refresh
3. Wait for page to reload

**Expected Result:**
- ✅ User remains logged in
- ✅ Profile data loads correctly
- ✅ No redirect to login
- ✅ No "loading" flicker

**Check DevTools Console:**
- Should see Amplify loading session from storage
- No authentication errors

---

### ✅ Test 8: Protected Route (Unauthenticated)

**Steps:**
1. Clear browser storage (localStorage.clear())
2. Navigate directly to http://localhost:3000/profile

**Expected Result:**
- ✅ Redirects to `/login`
- ✅ Cannot access profile without authentication

---

### ✅ Test 9: Logout

**Steps:**
1. Log in and navigate to profile
2. Look for logout button (you may need to add one to the UI)
3. Or use console:
```javascript
// In browser console
import { signOut } from 'aws-amplify/auth';
await signOut();
```

**Expected Result:**
- ✅ User is logged out
- ✅ Tokens cleared from localStorage
- ✅ Redirected appropriately

**Check DevTools:**
- localStorage should be cleared of Amplify tokens

---

### ✅ Test 10: New Tab (Cross-Tab Sync)

**Steps:**
1. Log in on Tab 1
2. Open new Tab 2
3. Navigate to http://localhost:3000/profile on Tab 2

**Expected Result:**
- ✅ Tab 2 should be authenticated
- ✅ Profile loads without login

**Then:**
1. Logout on Tab 1
2. Check Tab 2

**Expected Result:**
- ✅ Tab 2 should detect logout (via Hub events)
- ✅ Tab 2 should redirect to login

---

### ✅ Test 11: Invalid Credentials

**Steps:**
1. Navigate to http://localhost:3000/login
2. Enter invalid credentials:
   - Email: `wrong@example.com`
   - Password: `WrongPass123`
3. Click "Iniciar sesión"

**Expected Result:**
- ✅ Login fails
- ✅ Error message: "Invalid email or password"
- ✅ No redirect
- ✅ User remains on login page

---

### ✅ Test 12: Token Auto-Refresh (Long Test)

**Note:** This test requires waiting ~55 minutes for token to approach expiry.

**Steps:**
1. Log in successfully
2. Keep browser tab open
3. Wait 55-60 minutes
4. Try to edit profile or make an API call

**Expected Result:**
- ✅ Token refreshes automatically
- ✅ No interruption to user
- ✅ API call succeeds
- ✅ No "session expired" error

**Check DevTools Console:**
- Should see Hub event: `tokenRefresh`

**Shortcut for Testing:**
You can modify token expiry in Cognito for faster testing:
```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id us-east-1_Q6BXG6CTj \
  --client-id 20fc4iknq837tjdk9gbtmvbfv9 \
  --access-token-validity 5 \
  --id-token-validity 5 \
  --token-validity-units AccessToken=minutes,IdToken=minutes \
  --region us-east-1
```

---

### ✅ Test 13: API Authorization Header

**Steps:**
1. Log in successfully
2. Open DevTools → Network tab
3. Navigate to profile page
4. Look for GET request to `/profile`

**Expected Result:**
- ✅ Request has `Authorization` header
- ✅ Header format: `Bearer <jwt-token>`
- ✅ Token is valid JWT (check at jwt.io)
- ✅ Response is 200 OK

**Verify Token:**
1. Copy token from Authorization header
2. Go to https://jwt.io
3. Paste token
4. Check payload:
   - Should have `sub` (user ID)
   - Should have `email`
   - Should have `exp` (expiration)
   - Should have `iss` (issuer: Cognito)

---

### ✅ Test 14: Network Offline

**Steps:**
1. Log in successfully
2. Open DevTools → Network tab
3. Set throttling to "Offline"
4. Try to edit profile

**Expected Result:**
- ✅ Shows cached user state
- ✅ API call fails gracefully
- ✅ Error message displayed
- ✅ No crash or blank page

---

### ✅ Test 15: Browser Back Button

**Steps:**
1. Log in → navigate to profile → logout
2. Click browser back button

**Expected Result:**
- ✅ Does not show cached profile
- ✅ Redirects to login
- ✅ User cannot access protected content

---

## Debugging Tools

### Check Amplify Auth State
```javascript
// In browser console
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

// Check if authenticated
const session = await fetchAuthSession();
console.log('Session:', session);

// Get current user
const user = await getCurrentUser();
console.log('User:', user);

// Get tokens
console.log('Access Token:', session.tokens?.accessToken?.toString());
console.log('ID Token:', session.tokens?.idToken?.toString());
```

### Check localStorage
```javascript
// View all Amplify data
Object.keys(localStorage).filter(key => key.includes('amplify')).forEach(key => {
  console.log(key, localStorage.getItem(key));
});
```

### Monitor Hub Events
```javascript
import { Hub } from 'aws-amplify/utils';

Hub.listen('auth', (data) => {
  console.log('Auth Event:', data.payload.event, data.payload);
});
```

---

## Common Issues & Solutions

### Issue: "Not authenticated" on page load
**Solution:**
- Clear localStorage and login again
- Check that Amplify.configure() is called before any auth operations
- Verify tokens are not expired

### Issue: API calls return 401 Unauthorized
**Solution:**
- Check API Gateway authorizer configuration
- Verify token is being sent in Authorization header
- Check token is not expired
- Verify Cognito User Pool ID matches

### Issue: CORS errors
**Solution:**
```bash
# Update API Gateway CORS
aws apigatewayv2 update-api --api-id f34orvshp5 \
  --cors-configuration AllowOrigins=http://localhost:3000,https://d4srl7zbv9blh.cloudfront.net \
  --region us-east-1
```

### Issue: Token refresh fails
**Solution:**
- Check refresh token validity in Cognito
- Verify refresh token is stored correctly
- Check Hub events for `tokenRefresh_failure`

---

## Success Criteria

All tests should pass with:
- ✅ No console errors
- ✅ Smooth user experience
- ✅ Proper redirects
- ✅ API calls authenticated
- ✅ Session persistence
- ✅ Automatic token refresh

---

## Next Steps After Testing

1. **If all tests pass:**
   - Deploy to production
   - Monitor CloudWatch logs
   - Test on production URL

2. **If tests fail:**
   - Check console errors
   - Review Amplify configuration
   - Verify Cognito settings
   - Check API Gateway authorizer

---

**Happy Testing! 🧪**
