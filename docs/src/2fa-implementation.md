# Two-Factor Authentication Implementation

> **Note:** This document should be deleted after PR approval. It serves as a reference for reviewers to understand the scope of the contribution.

---

**Acknowledgments**

Thanks to all contributors and authors from the Inte.Team for the great work on Nginx Proxy Manager. It saves us time and effort, and we're happy to contribute back to the project.

---

## Overview

Add TOTP-based two-factor authentication to the login flow. Users can enable 2FA from their profile settings, scan a QR code with any authenticator app (Google Authenticator, Authy, etc.), and will be required to enter a 6-digit code on login.

## Current Authentication Flow

```
POST /tokens {identity, secret}
  -> Validate user exists and is not disabled
  -> Verify password against auth.secret
  -> Return JWT token
```

## Proposed 2FA Flow

```
POST /tokens {identity, secret}
  -> Validate user exists and is not disabled
  -> Verify password against auth.secret
  -> If 2FA enabled:
       Return {requires_2fa: true, challenge_token: <short-lived JWT>}
  -> Else:
       Return {token: <JWT>, expires: <timestamp>}

POST /tokens/2fa {challenge_token, code}
  -> Validate challenge_token
  -> Verify TOTP code against user's secret
  -> Return {token: <JWT>, expires: <timestamp>}
```

## Database Changes

Extend the existing `auth.meta` JSON column to store 2FA data:

```json
{
  "totp_secret": "<encrypted-secret>",
  "totp_enabled": true,
  "totp_enabled_at": "<timestamp>",
  "backup_codes": ["<hashed-code-1>", "<hashed-code-2>", ...]
}
```

No new tables required. The `auth.meta` column is already designed for this purpose.

## Backend Changes

### New Files

1. `backend/internal/2fa.js` - Core 2FA logic
   - `generateSecret()` - Generate TOTP secret
   - `generateQRCodeURL(user, secret)` - Generate otpauth URL
   - `verifyCode(secret, code)` - Verify TOTP code
   - `generateBackupCodes()` - Generate 8 backup codes
   - `verifyBackupCode(user, code)` - Verify and consume backup code

2. `backend/routes/2fa.js` - 2FA management endpoints
   - `GET /users/:id/2fa` - Get 2FA status
   - `POST /users/:id/2fa/setup` - Start 2FA setup, return QR code
   - `PUT /users/:id/2fa/enable` - Verify code and enable 2FA
   - `DELETE /users/:id/2fa` - Disable 2FA (requires code)
   - `GET /users/:id/2fa/backup-codes` - View remaining backup codes count
   - `POST /users/:id/2fa/backup-codes` - Regenerate backup codes

### Modified Files

1. `backend/internal/token.js`
   - Update `getTokenFromEmail()` to check for 2FA
   - Add `verifyTwoFactorChallenge()` function
   - Add `createChallengeToken()` for short-lived 2FA tokens

2. `backend/routes/tokens.js`
   - Add `POST /tokens/2fa` endpoint

3. `backend/index.js`
   - Register new 2FA routes

### Dependencies

Add to `package.json`:
```json
"otplib": "^12.0.1"
```

## Frontend Changes

### New Files

1. `frontend/src/pages/Login2FA/index.tsx` - 2FA code entry page
2. `frontend/src/modals/TwoFactorSetupModal.tsx` - Setup wizard modal
3. `frontend/src/api/backend/twoFactor.ts` - 2FA API functions
4. `frontend/src/api/backend/verify2FA.ts` - Token verification

### Modified Files

1. `frontend/src/api/backend/responseTypes.ts`
   - Add `TwoFactorChallengeResponse` type
   - Add `TwoFactorStatusResponse` type

2. `frontend/src/context/AuthContext.tsx`
   - Add `twoFactorRequired` state
   - Add `challengeToken` state
   - Update `login()` to handle 2FA response
   - Add `verify2FA()` function

3. `frontend/src/pages/Login/index.tsx`
   - Handle 2FA challenge response
   - Redirect to 2FA entry when required

4. `frontend/src/pages/Settings/` (or user profile)
   - Add 2FA enable/disable section

### Dependencies

Add to `package.json`:
```json
"qrcode.react": "^3.1.0"
```

## API Endpoints Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /tokens | No | Login (returns challenge if 2FA) |
| POST | /tokens/2fa | Challenge | Complete 2FA login |
| GET | /users/:id/2fa | JWT | Get 2FA status |
| POST | /users/:id/2fa/setup | JWT | Start setup, get QR code |
| PUT | /users/:id/2fa/enable | JWT | Verify and enable |
| DELETE | /users/:id/2fa | JWT | Disable (requires code) |
| GET | /users/:id/2fa/backup-codes | JWT | Get backup codes count |
| POST | /users/:id/2fa/backup-codes | JWT | Regenerate codes |

## Security Considerations

1. Challenge tokens expire in 5 minutes
2. TOTP secrets encrypted at rest
3. Backup codes hashed with bcrypt
4. Rate limit on 2FA attempts (5 attempts, 15 min lockout)
5. Backup codes single-use only
6. 2FA disable requires valid TOTP code

## Implementation Order

1. Backend: Add `otplib` dependency
2. Backend: Create `internal/2fa.js` module
3. Backend: Update `internal/token.js` for challenge flow
4. Backend: Add `POST /tokens/2fa` route
5. Backend: Create `routes/2fa.js` for management
6. Frontend: Add `qrcode.react` dependency
7. Frontend: Update API types and functions
8. Frontend: Update AuthContext for 2FA state
9. Frontend: Create Login2FA page
10. Frontend: Update Login to handle 2FA
11. Frontend: Add 2FA settings UI

## Testing

1. Enable 2FA for user
2. Login with password only - should get challenge
3. Submit correct TOTP - should get token
4. Submit wrong TOTP - should fail
5. Use backup code - should work once
6. Disable 2FA - should require valid code
7. Login after disable - should work without 2FA
