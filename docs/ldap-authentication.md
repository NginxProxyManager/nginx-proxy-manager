# LDAP Authentication

Nginx Proxy Manager (NPM) supports LDAP / Active Directory authentication as a login method alongside the built-in local accounts. LDAP auth enables your organisation to manage NPM access centrally through your existing directory service.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Supported Directory Services](#supported-directory-services)
4. [Configuration via the UI](#configuration-via-the-ui)
5. [Configuration via Environment Variables](#configuration-via-environment-variables)
6. [Active Directory Setup](#active-directory-setup)
7. [OpenLDAP Setup](#openldap-setup)
8. [FreeIPA Setup](#freeipa-setup)
9. [Group-Based Access Control](#group-based-access-control)
10. [TLS and STARTTLS](#tls-and-starttls)
11. [Just-In-Time (JIT) User Provisioning](#just-in-time-jit-user-provisioning)
12. [Syncing Users Manually](#syncing-users-manually)
13. [Troubleshooting](#troubleshooting)
14. [Migration Guide](#migration-guide)
15. [Connection Pool Configuration](#connection-pool-configuration)
16. [Environment Variable Reference](#environment-variable-reference)

---

## Overview

When LDAP authentication is enabled:

- Users can log in with their **LDAP username and password**
- NPM tries **local authentication first**, falling back to LDAP if the local login fails
- Successful LDAP logins **automatically create or update** an NPM user account (JIT provisioning)
- Group membership controls whether a user gets **admin** or **regular user** access
- Users removed from the required LDAP group are **automatically disabled**

---

## How It Works

```
User submits login →
  1. Try local NPM password →  if OK, grant access
  2. Look up LDAP config →     if LDAP disabled, reject
  3. Search LDAP for user →    if not found, reject
  4. Bind (authenticate) →     if wrong password, reject
  5. Fetch group memberships →
     - Not in user_group? → reject
     - In admin_group? → admin access
     - Otherwise → regular access
  6. JIT provision / update NPM account →  grant access
```

The service account (bind DN / bind password) is used for **searching** the directory. User passwords are verified via a separate **bind operation** — NPM never stores LDAP passwords.

---

## Supported Directory Services

| Service | Notes |
|---------|-------|
| **Microsoft Active Directory** | Use `sAMAccountName` or `userPrincipalName` as user attribute; enable AD paging for large directories |
| **OpenLDAP** | Use `uid`; standard RFC 4519 schema |
| **FreeIPA / Red Hat IdM** | Use `uid`; Kerberos integration not supported (bind authentication only) |
| **389 Directory Server** | Use `uid` or `mail` |
| **Samba 4 AD DC** | Works like Active Directory |

---

## Configuration via the UI

> 📸 _Screenshot placeholder: Admin → Settings → LDAP Authentication_

1. Log in to NPM as an administrator
2. Navigate to **Admin → Settings → LDAP Authentication**
3. Toggle **Enable LDAP Authentication** to on
4. Fill in the fields (see [Field Reference](#field-reference) below)
5. Click **Test Connection** to verify the server is reachable
6. Optionally click **Test Authentication** to test a specific user's credentials
7. Click **Save**

### Field Reference

| Field | Description | Example |
|-------|-------------|---------|
| **Server URL** | Full LDAP URL including protocol and port | `ldap://dc.corp.com` or `ldaps://dc.corp.com:636` |
| **Bind DN** | Service account DN used for directory searches | `cn=npm-service,ou=ServiceAccounts,dc=corp,dc=com` |
| **Bind Password** | Password for the service account | |
| **Search Base** | Base DN for user searches | `dc=corp,dc=com` |
| **Group Search Base** | Base DN for group searches (defaults to Search Base) | `ou=Groups,dc=corp,dc=com` |
| **User Attribute** | Attribute matched against the login name | `sAMAccountName` (AD) or `uid` (LDAP) |
| **Admin Group** | DN or CN of the group that grants admin access | `cn=NPM-Admins,ou=Groups,dc=corp,dc=com` |
| **User Group** | DN or CN of the group that is required for any access | `cn=NPM-Users,ou=Groups,dc=corp,dc=com` |
| **Verify TLS Certificate** | Reject invalid TLS certs (recommended: on) | ✓ |
| **Use STARTTLS** | Upgrade ldap:// connection to TLS | ☐ |

---

## Configuration via Environment Variables

Environment variables override settings configured in the UI. This is the recommended approach for **Docker** and **Kubernetes** deployments, as it avoids storing credentials in the database.

```yaml
# docker-compose.yml excerpt
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    environment:
      LDAP_ENABLED: "true"
      LDAP_SERVER_URL: "ldap://ldap.corp.com:389"
      LDAP_BIND_DN: "cn=npm-service,ou=ServiceAccounts,dc=corp,dc=com"
      LDAP_BIND_PASSWORD: "super-secret"
      LDAP_SEARCH_BASE: "dc=corp,dc=com"
      LDAP_GROUP_DN: "ou=Groups,dc=corp,dc=com"
      LDAP_USER_ATTR: "uid"
      LDAP_ADMIN_GROUP: "cn=npm-admins,ou=Groups,dc=corp,dc=com"
      LDAP_USER_GROUP: "cn=npm-users,ou=Groups,dc=corp,dc=com"
      LDAP_TLS_VERIFY: "true"
      LDAP_STARTTLS: "false"
```

For a full example with an OpenLDAP sidecar, see [`docker/docker-compose.ldap-test.yml`](../docker/docker-compose.ldap-test.yml).

See [Environment Variable Reference](#environment-variable-reference) for all supported variables.

---

## Active Directory Setup

### 1. Create a service account

```powershell
# Create a dedicated read-only service account
New-ADUser -Name "npm-service" `
           -SamAccountName "npm-service" `
           -UserPrincipalName "npm-service@corp.example.com" `
           -AccountPassword (ConvertTo-SecureString "SvcPass123!" -AsPlainText -Force) `
           -PasswordNeverExpires $true `
           -Enabled $true `
           -Path "OU=ServiceAccounts,DC=corp,DC=example,DC=com"

# Grant read access to the user container
# (Read access is typically inherited from Authenticated Users)
```

### 2. Create access groups

```powershell
# Admin group (users here get NPM admin access)
New-ADGroup -Name "NPM-Admins" `
            -GroupScope Global `
            -Path "OU=Groups,DC=corp,DC=example,DC=com"

# User group (everyone who should be able to log in)
New-ADGroup -Name "NPM-Users" `
            -GroupScope Global `
            -Path "OU=Groups,DC=corp,DC=example,DC=com"

# Add members
Add-ADGroupMember "NPM-Users"  -Members "alice","bob"
Add-ADGroupMember "NPM-Admins" -Members "alice"
```

### 3. Configure NPM for Active Directory

| Field | AD Value |
|-------|----------|
| Server URL | `ldap://dc01.corp.example.com` or `ldaps://dc01.corp.example.com:636` |
| Bind DN | `cn=npm-service,ou=ServiceAccounts,dc=corp,dc=example,dc=com` |
| Search Base | `dc=corp,dc=example,dc=com` |
| User Attribute | `sAMAccountName` (or `userPrincipalName` for UPN logins like `alice@corp.example.com`) |
| Admin Group | `cn=NPM-Admins,ou=Groups,dc=corp,dc=example,dc=com` |
| User Group | `cn=NPM-Users,ou=Groups,dc=corp,dc=example,dc=com` |

### 4. Multi-domain forests

For environments with multiple domains, enable referral chasing. Set the following in the UI or contact your LDAP administrator to configure a Global Catalog search:

- Use the Global Catalog port: `ldap://dc01.corp.com:3268` (or `ldaps://...:3269`)
- Set Search Base to your forest root: `dc=corp,dc=com`

### Active Directory tips

- Use **LDAPS** (`ldaps://`) or **STARTTLS** in production — plain LDAP transmits passwords in the clear
- If users log in with `user@domain.com`, set User Attribute to `userPrincipalName`
- If users log in with just `username`, use `sAMAccountName`
- For large AD environments (>1000 users in search scope), the paged results feature is automatically applied

---

## OpenLDAP Setup

### 1. Create an organisational structure

```ldif
# structure.ldif
dn: ou=Users,dc=example,dc=com
objectClass: organizationalUnit
ou: Users

dn: ou=Groups,dc=example,dc=com
objectClass: organizationalUnit
ou: Groups
```

### 2. Create the service account

```ldif
# service-account.ldif
dn: cn=npm-service,ou=Users,dc=example,dc=com
objectClass: inetOrgPerson
cn: npm-service
sn: service
uid: npm-service
userPassword: {SSHA}your-hashed-password
```

Apply with:
```bash
ldapadd -x -H ldap://localhost -D "cn=admin,dc=example,dc=com" -W -f service-account.ldif
```

### 3. Create groups and users

```ldif
# groups.ldif
dn: cn=npm-admins,ou=Groups,dc=example,dc=com
objectClass: groupOfNames
cn: npm-admins
member: uid=alice,ou=Users,dc=example,dc=com

dn: cn=npm-users,ou=Groups,dc=example,dc=com
objectClass: groupOfNames
cn: npm-users
member: uid=alice,ou=Users,dc=example,dc=com
member: uid=bob,ou=Users,dc=example,dc=com
```

### 4. Configure NPM for OpenLDAP

| Field | OpenLDAP Value |
|-------|----------------|
| Server URL | `ldap://ldap.example.com:389` |
| Bind DN | `cn=npm-service,ou=Users,dc=example,dc=com` |
| Search Base | `dc=example,dc=com` |
| Group DN | `ou=Groups,dc=example,dc=com` |
| User Attribute | `uid` |
| Admin Group | `cn=npm-admins,ou=Groups,dc=example,dc=com` |
| User Group | `cn=npm-users,ou=Groups,dc=example,dc=com` |

---

## FreeIPA Setup

### 1. Create a service account and groups

```bash
# Log in as admin
kinit admin

# Create service account
ipa user-add npm-service --first=NPM --last=Service \
    --email=npm-service@example.com \
    --password

# Create groups
ipa group-add npm-admins --desc="NPM Administrators"
ipa group-add npm-users  --desc="NPM Users"

# Add members
ipa group-add-member npm-admins --users=alice
ipa group-add-member npm-users  --users=alice --users=bob
```

### 2. Configure NPM for FreeIPA

FreeIPA uses a specific LDAP structure. Set:

| Field | FreeIPA Value |
|-------|---------------|
| Server URL | `ldap://ipa.example.com` or `ldaps://ipa.example.com:636` |
| Bind DN | `uid=npm-service,cn=users,cn=accounts,dc=example,dc=com` |
| Search Base | `cn=accounts,dc=example,dc=com` |
| Group DN | `cn=groups,cn=accounts,dc=example,dc=com` |
| User Attribute | `uid` |
| Admin Group | `cn=npm-admins,cn=groups,cn=accounts,dc=example,dc=com` |
| User Group | `cn=npm-users,cn=groups,cn=accounts,dc=example,dc=com` |

### FreeIPA tips

- FreeIPA uses `cn=accounts` as its container for users and groups — not the standard `ou=`
- Enable LDAPS and configure your FreeIPA CA certificate if verifying TLS
- FreeIPA supports Kerberos, but NPM uses simple LDAP bind authentication only

---

## Group-Based Access Control

NPM supports two group roles:

| Group | NPM Role | Description |
|-------|----------|-------------|
| **Admin Group** | Administrator | Full access to all NPM resources and settings |
| **User Group** | Regular User | Access to resources the user owns or has been granted |

### Multiple groups

You can specify multiple groups for either role by separating them with newlines in the UI:

```
cn=npm-admins,ou=Groups,dc=example,dc=com
cn=super-admins,ou=Groups,dc=example,dc=com
```

### Access control flow

1. User authenticates successfully via LDAP
2. NPM fetches group memberships
3. If **Admin Group** is configured and user is a member → **admin role**
4. If **User Group** is configured and user is **not** a member (and not an admin) → **access denied**
5. If neither group is configured → any authenticated LDAP user gets regular user access

### Dynamic role changes

Role changes in the LDAP directory are reflected in NPM:
- The next time the user logs in, their groups are re-fetched and permissions updated
- Use **Sync Now** (Admin → Settings → LDAP) to force-update all LDAP users immediately

---

## TLS and STARTTLS

### LDAPS (recommended)

Use `ldaps://` with port 636 for encrypted connections from the start:

```
Server URL: ldaps://dc.corp.com:636
```

If your LDAP server uses a private CA:
1. Add the CA certificate to the system trust store of the NPM container
2. Set **Verify TLS Certificate** to on

Or for testing only (not recommended for production):
- Set **Verify TLS Certificate** to off (`LDAP_TLS_VERIFY: "false"`)

### STARTTLS

Use STARTTLS to upgrade a plain `ldap://` connection to TLS:

```
Server URL: ldap://dc.corp.com:389
STARTTLS: enabled
```

> ⚠️ **Note:** STARTTLS cannot be combined with `ldaps://`. Use one or the other.

### Self-signed certificates

For lab environments with self-signed certs, either:
1. Mount the CA cert into the container and set `NODE_EXTRA_CA_CERTS` env var
2. Set `LDAP_TLS_VERIFY: "false"` (do not use in production)

---

## Just-In-Time (JIT) User Provisioning

When a user logs in via LDAP for the first time, NPM automatically creates their account:

- **Name / nickname** are taken from LDAP `displayName`, `cn`, `givenName`, or `sn`
- **Email** is taken from the LDAP `mail` attribute (required — users without email cannot be provisioned)
- **Avatar** is set from Gravatar based on email
- **Auth source** is marked as `ldap` — the user has no local password

On subsequent logins:
- Name and nickname are updated from LDAP (kept in sync)
- Group memberships are re-evaluated and NPM permissions updated accordingly
- If the user was previously disabled (removed from an allowed group), they are re-enabled

---

## Syncing Users Manually

> 📸 _Screenshot placeholder: Admin → Settings → LDAP → Sync Now button_

The **Sync Now** button triggers an immediate re-synchronisation of all LDAP-sourced NPM users:

1. Each LDAP user's current group memberships are fetched from the directory
2. NPM roles and permissions are updated accordingly
3. Users no longer in any allowed group are disabled
4. Results are shown in a summary dialog

This is useful after bulk group changes in the LDAP directory.

You can also trigger sync via the API:

```bash
curl -X POST http://npm-host:81/api/settings/ldap/sync \
     -H "Authorization: Bearer <your-token>"
```

---

## Troubleshooting

### Connection refused / timeout

**Symptoms:** "LDAP connection failed" or "timed out" on the test connection

**Check:**
- Is the LDAP server reachable from the NPM container? (`telnet ldap.example.com 389`)
- Is the port correct? (389 for LDAP, 636 for LDAPS, 3268 for AD Global Catalog)
- Is a firewall blocking the connection?
- For Docker: are NPM and the LDAP server on the same network / using the service name?

### Invalid credentials (bind DN)

**Symptoms:** "Invalid credentials — check bind DN and password" after a successful connect

**Check:**
- Is the Bind DN correct? Use `ldapsearch` to verify:
  ```bash
  ldapsearch -x -H ldap://ldap.example.com -D "cn=npm-service,dc=example,dc=com" -W -b "" -s base
  ```
- Does the service account's password contain special characters that need escaping in YAML/env?
- Has the service account expired or been locked?

### User not found

**Symptoms:** Correct password but "Invalid credentials" (NPM obscures the real error for security)

**Check:**
- Is the **Search Base** correct? Try searching manually:
  ```bash
  ldapsearch -x -H ldap://ldap.example.com \
             -D "cn=npm-service,dc=example,dc=com" -W \
             -b "dc=example,dc=com" "(uid=alice)"
  ```
- Is the **User Attribute** correct? (`uid` for OpenLDAP, `sAMAccountName` for AD)
- Does the user exist in the search base?

### User can connect but access is denied (group restriction)

**Symptoms:** User authenticates but gets "access denied" or is not provisioned

**Check:**
- Is the user in the configured **User Group**?
- Is the **Admin Group** or **User Group** DN exactly correct (case-sensitive in some directories)?
- Try the **Test Authentication** feature in the LDAP settings UI
- Check the NPM logs for `[ldap-sync]` messages

### TLS certificate errors

**Symptoms:** "DEPTH_ZERO_SELF_SIGNED_CERT" or "unable to verify the first certificate"

**Solutions:**
1. Mount your CA certificate into the container:
   ```yaml
   volumes:
     - ./my-ca.crt:/usr/local/share/ca-certificates/my-ca.crt:ro
   environment:
     NODE_EXTRA_CA_CERTS: /usr/local/share/ca-certificates/my-ca.crt
   ```
2. Or temporarily disable cert verification: `LDAP_TLS_VERIFY: "false"`

### STARTTLS fails

**Symptoms:** "STARTTLS failed" error

**Check:**
- Is the server listening on port 389 with STARTTLS support enabled?
- Are you using `ldap://` (not `ldaps://`) in the server URL?
- Does the server's TLS certificate pass verification? Try with `LDAP_TLS_VERIFY: "false"` first

### Users not getting the right role

**Symptoms:** Admin user appears as regular user (or vice versa)

**Check:**
- Is the group DN in **Admin Group** exactly correct? Copy from `ldapsearch` output
- Did you click **Sync Now** after changing group membership?
- Check that the user is actually a member of the group in the directory

### LDAP works in test but fails at login

**Symptoms:** "Test Connection" and "Test Authentication" succeed but login fails

**Check:**
- Is the fallback flow working? NPM tries local auth first — if a local account exists with the same username, it will try that first
- Check NPM backend logs for detailed LDAP error messages
- Ensure the LDAP server allows connections from the NPM process (not just the test client)

---

## Migration Guide

### Migrating local NPM users to LDAP

If you have existing local accounts and want to migrate them to LDAP:

1. **Enable LDAP** and configure it — do not configure `LDAP_USER_GROUP` yet
2. Ask users to **log in via their LDAP credentials** — NPM will match by email address and update the `auth_source` to `ldap`
3. Once all users have logged in via LDAP, you can configure the user group restriction

> ⚠️ **Note:** NPM matches by **email address**. If the LDAP email differs from the local account email, a new account will be created instead of updating the existing one.

### Handling duplicate accounts

If a user has both a local and an LDAP account (different emails):
1. The local account continues to work via local auth
2. The LDAP account is provisioned separately
3. To merge: update the local account's email to match LDAP, then the next LDAP login will update it

### Rolling back LDAP

To disable LDAP authentication:
1. Admin → Settings → LDAP → toggle off (or set `LDAP_ENABLED: "false"`)
2. Existing LDAP-sourced users will **not** be able to log in (they have no local password)
3. To restore access: set a local password for each user via the Users page

---


---

## Connection Pool Configuration

NPM maintains a per-server connection pool so that successive LDAP operations reuse authenticated connections instead of creating a new TCP session each time.  A **global semaphore** caps the number of simultaneously active connections, preventing socket exhaustion under concurrent load.

### How the Pool Works

```
borrowFromPool →
  1. Is there a healthy idle connection?  → reuse it (no new TCP handshake)
  2. Is activeCount < maxConnections?     → create a new connection (activeCount++)
  3. Pool exhausted (activeCount ≥ max)   → queue the request
     - If a connection is returned before acquireTimeout → fulfil queue entry
     - Otherwise → reject with "pool exhausted" error

returnToPool →
  - Queued callers waiting? → hand the connection directly (no activeCount change)
  - Pool has room?          → push to idle, start idle reaper if not running
  - Pool is full?           → destroy the connection (activeCount--)
```

The **idle reaper** runs every 60 seconds and destroys connections that have been idle for more than 5 minutes, preventing stale sockets from accumulating.

### Configuration Options

These options are passed as part of the LDAP config object and can be set via environment variables (see [Environment Variable Reference](#environment-variable-reference)):

| Option | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `maxConnections` | `LDAP_MAX_CONNECTIONS` | `10` | Hard cap on simultaneously active (borrowed) connections per LDAP server. Requests that exceed this cap are queued. |
| `acquireTimeout` | `LDAP_ACQUIRE_TIMEOUT` | `5000` | Maximum milliseconds a queued borrow request will wait for a free slot before rejecting with a "pool exhausted" error. |

### Tuning Guidelines

| Scenario | Recommendation |
|----------|---------------|
| **Small deployment** (< 50 concurrent users) | Defaults are fine (`maxConnections: 10`, `acquireTimeout: 5000`) |
| **High concurrency** (many simultaneous logins) | Increase `LDAP_MAX_CONNECTIONS` — but stay within your LDAP server's connection limit |
| **Slow LDAP server or high latency** | Increase `LDAP_ACQUIRE_TIMEOUT` to allow more time for a slot to become free |
| **Strict connection limits on LDAP server** | Decrease `LDAP_MAX_CONNECTIONS` to stay within the allowed connection count |
| **DoS hardening** | Lower `LDAP_MAX_CONNECTIONS` and `LDAP_ACQUIRE_TIMEOUT` to limit blast radius |

> ⚠️ **Note:** `LDAP_MAX_CONNECTIONS` controls active (borrowed) connections, not total sockets. A small number of idle connections (up to 5 per pool key by default) are kept warm in addition to the active limit.

## Environment Variable Reference

All LDAP environment variables are optional. When set, they take precedence over UI configuration.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LDAP_ENABLED` | boolean | `false` | Enable LDAP authentication |
| `LDAP_SERVER_URL` | string | — | LDAP server URL (`ldap://` or `ldaps://`) |
| `LDAP_BIND_DN` | string | — | Service account DN for directory searches |
| `LDAP_BIND_PASSWORD` | string | — | Service account password |
| `LDAP_SEARCH_BASE` | string | — | Base DN for user searches |
| `LDAP_GROUP_DN` | string | (Search Base) | Base DN for group searches |
| `LDAP_USER_ATTR` | string | `uid` | Attribute matched against the login username |
| `LDAP_ADMIN_GROUP` | string | — | Group DN/CN whose members get admin access |
| `LDAP_USER_GROUP` | string | — | Group DN/CN required for any login access |
| `LDAP_TLS_VERIFY` | boolean | `true` | Verify TLS certificates |
| `LDAP_STARTTLS` | boolean | `false` | Upgrade connection via STARTTLS |
| `LDAP_MAX_CONNECTIONS` | integer | `10` | Hard cap on simultaneous pool connections |
| `LDAP_ACQUIRE_TIMEOUT` | integer (ms) | `5000` | Wait time when pool is exhausted |

**Boolean accepted values:** `true`, `1`, `yes`, `on` (case-insensitive) for true; anything else for false.
