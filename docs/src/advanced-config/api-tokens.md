# Personal API tokens

Personal API tokens (PATs) let integrations call NPM's existing resource APIs
without storing an account password or continually refreshing a login JWT.
They are managed in **API Tokens** in the user menu. This is a credential feature,
not a separate configuration export or directory API.

## Create and revoke

Sign in normally, open API Tokens, enter a name, choose scopes and an expiry,
and confirm your password. If the account has two-factor authentication enabled,
also provide a current verification code or an unused backup code.

The complete token is displayed **once**. Store it in your integration's server-side
secret store. The database stores a SHA-256 digest of a 256-bit random secret,
not the usable token. The default expiry is 30 days; the allowed range is 1–365 days.
Tokens cannot be extended or upgraded. To rotate, create a replacement, update the
integration, then revoke the old token.

The list shows names, scopes, expiry, last usage and revocation status, never the
secret or its digest. You can only manage your own tokens. Revocation is permanent
and is checked on each new request; a request already executing can finish.
Changing/resetting the account password invalidates existing PATs. Disabling an
account through NPM permanently revokes its PATs, so re-enabling it does not restore
them. A durable account version also invalidates tokens whose creation overlaps
the disable, including a disable/re-enable during password verification. Deleted
or disabled accounts cannot authenticate.

## Call existing APIs

Keep the token out of browser bundles, URL parameters, source control and logs.
Use HTTPS for the management API. For example, a server-side directory can read the
normal proxy-host configuration:

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $NPM_API_TOKEN" \
  "https://npm-admin.example.com/api/nginx/proxy-hosts"
```

The normal resource routes and base response fields are reused. Login JWTs retain
their existing behavior. There is no special `/directory` endpoint in this feature.

## Permissions

Choose `resource:read` or `resource:write` for any of:

- `proxy_hosts`
- `redirection_hosts`
- `dead_hosts`
- `streams`
- `access_lists`
- `certificates`

A write scope includes read access to that resource. A PAT must pass **both** its
scope check and the owner's current NPM permission check. It never grants more than
the owner currently has. Its own/all visibility is also capped at the visibility
when it was created: later promotion does not widen a token issued for own hosts.
Permission reductions apply to subsequent requests.

Supported operations on the existing `/api/nginx/...` routes:

- All six resources: GET list/detail, POST create, DELETE detail
- Proxy, redirection, dead hosts, streams and access lists: PUT detail
- Proxy, redirection, dead hosts and streams: POST enable/disable
- Certificates: POST upload/renew (there is no general certificate PUT endpoint)

Only registered operations accept PATs; new routes are denied until explicitly
reviewed. PATs cannot call login/refresh, impersonate users, change passwords or
permissions, manage 2FA, create other tokens, or manage accounts/settings. There
is no JWT exchange or PAT refresh flow. Certificate private-key downloads, logs,
audit logs, provider discovery and validation/test helper endpoints are not enabled
for PATs in this version. Invalid/expired/revoked tokens return 401; a valid token
without the required capability returns 403.

### Related resources and side effects

Attaching or modifying a host with an existing certificate/access list requires
read access to that related resource and visibility of the referenced object.
Inline `certificate_id: "new"` requires certificate write access. These checks also
apply to existing references on a host being reconfigured. Deleting a host does
not require read access to its unchanged references.

Updating/deleting an access list can regenerate hosts that use it, including
location-level references. Certificate operations can affect hosts that use the
certificate or match its domains. The PAT must have write access and visibility
for **every affected host** before any of these mutations begin. Otherwise the
whole operation is refused. Related references on affected hosts must also be
readable and safe to render. A narrow token is not a way to change another user's
hosts through a shared certificate or access list.

### Raw configuration and safety limits

Read scopes expose configuration, including internal upstream addresses, ports,
locations and custom configuration strings. Such strings may contain secrets that
a person placed there. Do not treat this data as public or publish it wholesale.

PAT requests do not support `expand` in this version. Non-empty expansions,
including nested expansions, return 403. Automatically expanded relations in write
responses are omitted, and structured password, DNS credential, private-key and
2FA fields are removed. This does not change the internal data used to render Nginx
configuration. It also does not change expansions for normal login JWTs.

PATs cannot submit non-empty `advanced_config`, including location-level custom
configuration. Updating, enabling or disabling an existing host with custom
configuration is refused rather than silently clearing it. Reading or deleting such
a host remains possible with the corresponding permission. ACL/certificate changes
that would regenerate a custom-config host are also refused. Use the normal NPM UI
for those operations. Unsafe directive delimiters/variables in interpolated
upstream, domain or location fields are rejected; regex/custom location syntax and
Unix-socket upstream syntax are not supported through PATs.

Write scopes are still trusted network-routing authority: they can expose services,
change traffic routing and access controls, renew/revoke certificates, and reload
Nginx. They are **not a multi-tenant sandbox**. Grant them only to trusted integrations.
Instance-wide custom Nginx files still apply, just as they do in the UI.

## Credential-management API

These endpoints require a normal user login JWT, never a PAT:

- GET `/api/api-tokens/options`: currently available scopes, visibility,
  `requires_2fa`, `default_expiry_days` and `max_expiry_days`
- GET `/api/api-tokens`: your token metadata, including effective `status`
  (`active`, `expired` or `revoked`). Password/account invalidation is reported as
  `revoked`, even when no explicit `revoked_on` timestamp exists.
- POST `/api/api-tokens`: `{name, scopes, expires_in_days, password, code?}`;
  returns metadata plus `token` once, with status 201
- DELETE `/api/api-tokens/{id}`: permanently revoke your token; repeated revocation
  returns `{ "revoked": true }`

Scopes and expiry are checked on creation. A wrong step-up password/code returns
403 so the UI can retry without losing the login session. Each authenticated user
may run one creation verification at a time. Five failed password/2FA checks within
15 minutes block further checks until that window ends; successful verification
resets the failure count. Limited requests return 429 with `Retry-After` seconds.
This bounded, process-local protection stores no credentials. Restarting the process
resets it, and separate instances do not share counters; use a shared gateway limiter
when those deployment properties require stronger protection. It does not limit login
or replace network access controls. The API schema documents request and response fields. Token operations and resource mutations are audited
by user/token and resource ID. Resource audit metadata records the recognized
fields involved, safe boolean/numeric settings and collection counts. Free text,
raw configuration, credentials and nested payloads are not copied into PAT audit
metadata.

PAT and token-management errors omit client debug objects. PAT resource errors
return a bounded message for the HTTP status instead of provider output or command
stderr, even when a legacy handler considers that output public. Server diagnostics use
an `X-Request-ID` correlation ID, method, resource family and known error
categories/codes; raw messages, stacks, request bodies and credentials are omitted.
Ordinary JWT resource requests retain their existing diagnostic behavior.

## Development and compatibility

The normal migration runner adds the `api_token` table and account/token version
columns initialized to zero. UTC ISO timestamps are stored as strings across
SQLite, MySQL and PostgreSQL. Account disabling increments its version atomically
in the same transaction that revokes existing tokens; creation binds the version
read before step-up verification. This does not require a database lock during
password verification. JWTs and resource data retain their existing behavior.
No token is generated by migration. Rolling back both PAT migrations removes
token records and invalidates PATs.

Authorization is composed in `Access`: a PAT must satisfy both its scoped,
owner-bound credential policy and the user's current permissions. The pure token
policy defines allowed operations, lifecycle status and response disclosure.
The model registry is shared by object checks and mutation-impact authorization;
the latter runs before legacy handlers can regenerate dependent hosts. HTTP
middleware only coordinates that policy, response filtering and usage auditing.
Token-list status and authentication use the same lifecycle rules, so an unusable
credential cannot be presented as active after a password change.

From `backend`, with the existing dependencies installed. The isolated integration
suite also requires Linux, Bubblewrap and OpenSSL; it does not use an existing NPM
installation:

```sh
node --test test/*.test.js
npm run lint
npm run validate-schema
```

The test suite must use disposable databases and filesystem fixtures. Nginx/ACME
side effects must be stubbed or isolated; tests must never create a real certificate
or usable production credential. API integration and cross-database migration
results should be reported separately from pure policy tests.

The separate `scripts/ci/pat-docker-smoke.py` checks a built image through real
Nginx and HTTP. It requires a disposable Docker harness: an app container named
`npm-pat-test`, fresh data/certificate volumes, management and proxy ports bound
to loopback at 18081/18080, and a Docker-network service `upstream:80` returning
`pat-docker-smoke-upstream\n`. The caller must remove all test containers, volumes
and networks even on failure. Do not point it at an existing installation.
