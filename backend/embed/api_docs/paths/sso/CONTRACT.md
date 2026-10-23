# SSO administration contract

All routes are under `/api/sso`, require a current non-pending session with
`settings.manage` or `full-admin`, and use the existing `{ "result": ... }` /
`{ "error": { "code", "message" } }` envelopes. JSON names are snake_case.
`409` with `sso_revision_conflict` means the form must be reloaded. Invalid
configuration returns `400` with `sso_invalid_configuration`; an unavailable
installation key returns `503` with `sso_key_restore_required`. Restore
`keys/sso.key` from the same backup as the database; the API never regenerates
it while ciphertext exists.

`GET /policy` returns `{mode, public_url, revision}`. `PUT /policy` accepts
exactly those fields. `mode` is `parallel` or `sso_only`. `public_url` is an
absolute canonical HTTPS origin without slash, path, query or fragment.
Callbacks and SP endpoints derive from this setting, never request Host.
`sso_only` requires at least one enabled, structurally valid connection.

`GET /connections` returns an array. `GET /connections/{id}` returns one item.
Both have `{id, protocol, name, enabled, revision, config, has_secret}` and
never include ciphertext or plaintext. Invalid legacy `config_json` is shown
as `{}`. `POST /connections` accepts `{protocol, name, enabled, config,
secret_action, secret_value?}`. `PUT /connections/{id}` adds mandatory
`revision`. `DELETE /connections/{id}` accepts `{revision}`. The `id` is an
opaque random base64url identifier. `secret_action` is `keep`, `replace` or
`clear`; `replace` requires nonempty `secret_value`; the other actions forbid
it. Create requires `replace` or `clear`. The encrypted bundle uses AAD
`connection:<id>`. The write-only `secret_value` is the OAuth client secret
for OIDC/OAuth2. SAML signing keys are server-generated in Task 9 and must
never be placed in `config` or passed as `secret_value`. A secret is retained
byte-for-byte for `keep`. For OIDC/OAuth2 the complete encrypted bundle is
UTF-8 JSON `{"client_secret":"..."}` sealed with AAD `connection:<id>`.
`has_secret` is the sole read indicator.

Protocol adapters receive the configured `public_url` as transient
`Transaction.PublicURL`, loaded and validated by the service inside its fenced
policy read. OIDC uses `public_url + /sso/{connection_id}/callback` as its
redirect URI; the request Host does not select the callback origin. The OIDC
adapter's read-only `Probe(context, connection)` performs bounded discovery and
can be registered through `handler.RegisterSSOProbe` at startup. A probe does
not create a transaction, user, or session.

`config` is strict and protocol-specific; unknown and cross-protocol fields
are rejected. HTTPS provider endpoints may use private addresses. The
following fields are the complete public input contract for adapters and UI:

| Protocol | Required fields | Optional fields |
| --- | --- | --- |
| OIDC | `issuer_url` (HTTPS), `client_id`, `email_claim` | `name_claim`, `scopes` (unique strings), `use_userinfo` (boolean), `token_auth_method` (`client_secret_basic` or `client_secret_post`; omitted means basic) |
| OAuth2 | `authorization_url`, `token_url`, `userinfo_url` (HTTPS), `client_id`, `email_claim`, `token_auth_method` (`client_secret_basic` or `client_secret_post`) | `subject_claim` (only if provider supplies a stable subject), `name_claim`, `scopes` (unique strings). Adapter 8 always uses PKCE; there is no PKCE toggle. |
| SAML | exactly one of `idp_metadata_url` (HTTPS) or `idp_metadata_xml` (well-formed bounded EntityDescriptor XML); `sp_entity_id` (absolute URI); exactly one of `email_attribute` or `email_name_id: true` | `name_attribute`, `sign_requests` (boolean). Adapter 9 validates and freezes metadata, generates any signing key, and publishes SP metadata/certificate. The metadata snapshot is server-managed and is not accepted from this input. |

`GET /allowlist` returns `{revision, emails}`. `PUT /allowlist` replaces the
complete shared list with `{revision, emails}`. Only full email addresses
are accepted and stored lowercase. Empty `emails: []` denies all SSO logins.
The allowlist uses the **policy revision**, incremented atomically by either
policy or allowlist writes; therefore an edit to one conflicts with a stale
form for the other. Removal revokes matching SSO sessions and impersonation
descendants, leaving local sessions and account state intact. Every allowlist
write also discards pending login transactions and handoffs.

Identity-affecting connection edits (protocol, config, enabled state, secret)
and deletion revoke that connection's SSO sessions and descendants and discard
its pending transactions/handoffs in the policy-fenced transaction. A name-only
edit retains sessions and advances pending transaction/handoff connection
revisions atomically with the optimistic connection revision; Task 6 must
continue to check `connection_revision` against the current connection.
Changing `public_url` applies the same invalidation to
all SSO connections. `POST /connections/{id}/test` is read-only and never
creates a user, transaction or session. It reports `501` until the relevant
protocol adapter registers a bounded probe; probe failures return a generic
`502` without provider response content.
