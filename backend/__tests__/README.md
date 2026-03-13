# Backend Unit Tests

Tests use **Jest** with ESM support. Run from `backend/`:

```bash
NODE_OPTIONS="--experimental-vm-modules" npx jest --testPathPattern="__tests__/ldap"
```

| File | Module under test | Coverage |
|------|-------------------|----------|
| `ldap/ldap-client.test.js` | `lib/ldap-client.js` | Connection, bind, search, pool, TLS, error mapping |
| `ldap/ldap-internal.test.js` | `internal/ldap.js` | testConnection, searchUser, authenticateUser, normalizeUser |
| `ldap/ldap-sync.test.js` | `internal/ldap-sync.js` | JIT provisioning, group sync, account disable, syncAllUsers |
| `ldap/ldap-env.test.js` | `lib/ldap-env.js` | Env var overrides, boolean parsing, rowToLdapClientConfig |
| `ldap/objectguid.test.js` | `internal/ldap.js` | objectGUID parsing, LDAP filter encoding, UTF-8 regression |
| `validator/api-validator.test.js` | `lib/validator/api.js` | Validation error formatting |
