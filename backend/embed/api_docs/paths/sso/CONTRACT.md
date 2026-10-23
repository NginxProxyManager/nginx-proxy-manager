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

SAML explicit import and save (Task 9):

- `POST /api/sso/saml/metadata-preview` requires the same setup/current-session/
  settings.manage guard as other administration routes. Input is exactly
  `{config: <complete typed SAML config>}`. This is the only remote metadata-fetch
  operation. Uploaded XML is validated here too. It does not write a connection,
  create a login attempt/user/session, or change trusted keys.
- Result is `{entity_id, sso_url, certificate_fingerprints, sign_requests,
  sp_certificate?, import_token}`. Fingerprints are lowercase SHA-256 hex for
  every trusted IdP signing certificate (including overlap keys). `sp_certificate`
  is public PEM and exists when requests must be signed. Display these fields for
  review before Save; compare them with the previous reviewed material. No raw
  server-managed snapshot or private key is exposed. The administrator's original
  `idp_metadata_xml` input remains a public config field.
- Add optional top-level `saml_import_token` to connection POST/PUT, never inside
  `config`. The opaque authenticated-encrypted token is bound to the complete
  canonical typed configuration and expires after 10 minutes. Editing config
  after preview requires another preview. Token/key material must not be logged,
  persisted in browser local storage, or sent to provider endpoints.
- A new SAML connection requires a successful preview token and `secret_action:
  clear`. Existing SAML connections use `secret_action: keep`; omit the token
  to retain the encrypted snapshot/key byte-for-byte. Changing the metadata URL,
  uploaded XML or sign_requests requires another explicit preview. Name-only
  saves, login, metadata rendering, and Test never fetch metadata remotely.
- A token-bearing update is an explicit trust refresh even when config is
  unchanged. Save increments the connection revision, replaces encrypted trust,
  revokes that connection's sessions/descendants and invalidates pending attempts
  and handoffs in the same policy-fenced transaction. A stale revision fails
  before preparation. No private-key uploads are accepted.
- Preview generates an RSA-3072 signing key when `sign_requests` is true or IdP
  metadata requires signed requests; the public certificate is shown before Save.
  The encrypted token temporarily carries the generated key; Save seals it with
  the frozen validated XML into a JSON bundle using AAD `connection:<id>`. Preview
  tokens have separate purpose AAD `saml-metadata-import:v1`. An explicit later
  preview generates a new SP certificate when signing is enabled; arrange IdP
  certificate overlap before saving that rotation.
- HTTP JSON bodies remain capped at 1 MiB. Imported metadata is capped at 128 KiB
  and opaque tokens at 512 KiB so config plus token can fit bounded admin requests;
  unusually escape-heavy input can still hit the 1 MiB request limit. Callback
  form bodies and decoded XML are each capped at 1 MiB before XML parsing.
- Supported profile: one unencrypted assertion, SP-initiated HTTP-Redirect
  AuthnRequest and HTTP-POST ACS. No Artifact, IdP-initiated login, encrypted
  assertions, or SLO. Modern SHA-256/384/512 XML signatures only; Redirect requests
  use RSA-SHA256. Email requires exactly one configured attribute value or explicit
  email-format NameID. The library verifies signatures against the saved metadata;
  local checks enforce two-minute maximum skew, a matching signed request binding,
  recipient/audience/issuer and unambiguous consumed identity.

Startup/UI handoff:

```go
adapter := sso.NewSAMLAdapter(client, secrets).(*sso.SAMLAdapter)
handler.RegisterSSOSAML(adapter.PreviewMetadata, adapter.PrepareConnection)
handler.RegisterSSOProbe(ssoconfig.SAML, adapter.Probe)
// Include adapter in Service's protocol map.
// Methods:
PreviewMetadata(context.Context, string) (ssoconfig.SAMLMetadataPreview, error)
PrepareConnection(context.Context, *ssoconfig.Connection, ssoconfig.Connection, string) ([]byte, error)
Metadata(context.Context, ssoconfig.Connection, string) ([]byte, error)
```

The browser handlers expose `POST /sso/{id}/acs` and
`GET /sso/{id}/metadata`; the final Metadata argument MUST be the validated
policy.PublicURL loaded from policy, never request Host. `Start` and `Complete`
use `Transaction.PublicURL`. Public SP metadata advertises only POST ACS and
signing certificates, with no encryption/Artifact/SLO endpoints.

`Service.Complete` preserves only the fixed sentinel `sso.ErrSAMLUnsupported`
for recognized unsupported SAML profiles. Handler 11 should map it to stable code
`sso_saml_unsupported_profile` and localized copy: "Use SP-initiated Redirect/POST
with an unencrypted assertion." It remains a denial and consumes the attempt.
Missing/invalid browser/state bindings and every other adapter failure remain
`sso_login_denied`; never serialize the library's InvalidResponseError fields.
`POST /connections/{id}/test` validates only the saved SAML snapshot, so it cannot
replace trust or return an import token. Refresh/import is the separate explicit
preview ? review ? Save flow above.

Retention and revocation during recovery: name-only edits and disabling an existing
SAML connection with `secret_action: keep` preserve opaque ciphertext without
opening the installation key or validating snapshot freshness. They remain
available after metadata expires or the key is lost/corrupted; disabling still
revokes sessions and pending attempts atomically. Public metadata source/signing
policy must remain unchanged without a reviewed token. Re-enabling requires a
working key and valid, unexpired saved trust. Login always validates saved trust;
a successful rename never authorizes expired or undecryptable metadata.
