# Backend Unit Tests

Tests live under `backend/__tests__/` and are written for **Jest** with ESM module support.

## Running the LDAP tests

The backend uses `"type": "module"` (ESM), so Jest must be run with the experimental VM modules flag:

```bash
# From the repo root or backend directory
cd backend

# Install dev dependencies first (if not done already):
# yarn add --dev jest @jest/globals

# Run all LDAP unit tests
NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern="__tests__/ldap"

# Run a specific test file
NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern=ldap-client
NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern=ldap-internal
NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern=ldap-sync
NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern=ldap-env
```

## Test structure

| File | Module under test | Key coverage |
|------|-------------------|--------------|
| `ldap/ldap-client.test.js` | `lib/ldap-client.js` | Connection, bind, search, pool, TLS, STARTTLS, timeouts, error mapping |
| `ldap/ldap-internal.test.js` | `internal/ldap.js` | testConnection, searchUser, authenticateUser, getUserGroups, normalizeUser, validateConfig |
| `ldap/ldap-sync.test.js` | `internal/ldap-sync.js` | JIT provisioning, user update, group-based roles, account disable, syncAllUsers |
| `ldap/ldap-env.test.js` | `lib/ldap-env.js` | Env var overrides, boolean parsing, precedence, rowToLdapClientConfig |

## Adding Jest to the project

Add to `backend/package.json` devDependencies:

```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "@jest/globals": "^29.0.0"
  },
  "scripts": {
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest"
  },
  "jest": {
    "testEnvironment": "node",
    "transform": {}
  }
}
```
