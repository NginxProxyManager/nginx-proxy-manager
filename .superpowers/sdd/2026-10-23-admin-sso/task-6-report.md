# Task 6 report

Status: implemented and verified; ready for independent review. No deployment. Task 6 plan checkboxes remain open for the parent review.

## Implementation and contracts

- Exact shared Begin(ctx, connectionID, browserToken, returnPath), Complete(ctx, connectionID, browserToken, request) and Exchange(ctx, code, browserToken) signatures. Constructor NewService(db, secrets, adapters, options ...Option); WithClock and WithEntropy inject transient timing and entropy. Adapter map is copied. Production uses crypto/rand; entropy reads are serialized for injected readers.
- New authpolicy.WithDB(ctx, db, fn) delegates the existing persistent fence implementation. Every service fence uses the injected database, not database.GetDB(). A regression clears the global database and completes the whole flow successfully. Session.Create receives the same fenced transaction; no nested Authorize/fence.
- Requires config.IsSetup, preserving the existing bootstrap gate. Login-mode settings do not affect SSO admission. Protocol adapters remain responsible for validating the configured provider; no public routes were added here.
- Begin persists 32-byte opaque attempt/state values and SHA-256 browser/state hashes, with a 5-minute expiry. Browser token must be canonical 32-byte base64url; NewBrowserToken() generates it. Nonce and PKCE verifier are independently generated 32-byte opaque values. RequestID is an underscore followed by another 32-byte opaque value, suitable for SAML XML ID syntax. Protocol material JSON uses nonce, pkce_verifier and request_id and is sealed with EXACT AAD transaction:<attemptID>. Raw state is only delivered to Adapter.Start; callbacks receive StateHash, not persisted plaintext state.
- Adapter Complete runs outside the fence, after the transaction's consumed marker commits. Admission then reloads that consumed row under the fence. Sensitive policy changes deleting it cannot be undone by stale in-memory data; name-only changes updating its revision continue to work. Revision comparisons never treat zero as an omission. Both phases check expiry and current enabled connection/revision.
- Admission normalizes and checks the complete allowlisted email before user.GetOrCreateSSO. Missing email_verified is accepted. Existing identity, name and capabilities remain unchanged; new users have no credentials/capabilities. Disabled, deleted and system users are denied. Concurrent first callbacks produce one account.
- Complete returns only a fresh opaque handoff code, never JWT credentials. Handoffs persist code/browser hashes, connection/revision, account/email and a 60-second deadline. Exchange consumes and revalidates under one fence; a correctly bound handoff denied by current policy remains consumed. Session creation uses source=sso and a 24-hour expiry; session.Create additionally validates authoritative wall time. Tests inject a near-current clock for transient expiry without weakening the session store's current-time check.
- Identity now includes ReplayIDs []ReplayID, each with ID and ExpiresAt. Adapter 9 MUST populate these from all relevant validated signed assertion/response identifiers and their validated signed expiry bounds, never browser input. SAML without replay IDs fails closed. Service persists SHA-256(connectionID + NUL + ID) atomically with admission until signed expiry + 2 minutes. Duplicate replay IDs deny the callback; expired matching records can be replaced. Raw assertions/IDs/tokens are not logged or persisted in replay records.
- Connection secrets remain the Task 5 JSON bundle {"client_secret":"..."} sealed with AAD connection:<id>. Adapters receive the authoritative Connection including ciphertext, and must use the injected installation secret store to unseal it with that exact AAD. The shared service does not rewrite or expose that bundle.

## Task 11 handler integration

1. Call NewBrowserToken(), then Begin(). StartResult.AttemptID is the opaque cookie selector; RedirectURL is the adapter's provider authorization URL. Set AttemptCookie(attemptID, browserToken, protocol) before redirecting.
2. Bound the request body before parsing a SAML POST. CallbackState(request) accepts exactly one canonical state or RelayState and rejects duplicates/conflicts. AttemptID(ctx, connectionID, state) performs a state-hash lookup and returns only the attempt's cookie selector; it is NOT authorization. Read the named attempt cookie and pass its value to Complete.
3. Successful Complete returns a code. Set HandoffCookie(code, browserToken), delete the attempt cookie with DeleteCookie(AttemptCookie(...)), and redirect to the fixed local /login handoff landing page carrying only the code. On completion failures, delete the resolved attempt cookie too.
4. Exchange reads the cookie named by HandoffCookie(code, "").Name, passes its value and code to Exchange, then deletes that exact cookie. Only successful Exchange can be used to mint the final application JWT through the existing session machinery. DeleteCookie preserves name, scope, Secure, HttpOnly and SameSite attributes.

Attempt cookies: __Secure-npm-sso-attempt-<attemptID>, host-only, Secure/HttpOnly, Path=/sso, 300 seconds, SameSite=Lax for OIDC/OAuth2 and None for SAML. Handoff cookies: __Secure-npm-sso-handoff-<SHA256(code)>, same browserToken value, host-only, Secure/HttpOnly, Path=/api/auth/sso/exchange, 60 seconds, SameSite=Lax. Distinct per-attempt/code names support independent tabs; no IP binding or broad root-path cookie.

ValidateReturnPath rejects external/scheme-relative URLs, backslashes, controls, repeatedly encoded network paths, traversal segments, malformed escapes and oversized paths. Begin validates and stores the path, but Complete's code-only contract does not return it. Initial Tasks 11/14 must use fixed /login then the application shell's default destination. Do not forward a fresh browser-supplied return_path or promise destination preservation without a separately authenticated mechanism.

## Verification

TDD RED: admission and transaction/handoff regression suite failed against explicit contract skeletons (expected sso_login_denied on Begin). Then GREEN against the implementation. Additional RED/GREEN: SAML adapter omitting signed replay IDs was accepted before its new guard; zero stored revisions bypassed revalidation before replacing the zero sentinel with an optional expected-revision pointer.

Checks completed with Go 1.27.1 and TZ=Australia/Brisbane:

- go test ./internal/sso PASS.
- go test -race ./internal/sso ./internal/authpolicy PASS, including the final revision fix.
- go test ./... PASS, including the final revision fix; full output retained at WSL /tmp/npm-task6-final-full.log.
- Docker go test -count=1 -race ./internal/sso PASS separately against PostgreSQL 17 and MySQL 8.4 using the SAME service test suite. PostgreSQL 5.818s; MySQL 21.501s. After the final revision fix, TestZeroRevisionCannotBypassRevalidation reran and PASS on both external engines.
- git diff --check PASS (normal Windows LF/CRLF advisory only).

Tests include unlisted/disabled/system admission, existing identity preservation, zero-capability creation, no email_verified prerequisite, exact expiry boundaries, browser/connection/revision bindings, callback replay while provider validation is blocked, simultaneous tabs, concurrent first callbacks and exchanges, encrypted-at-rest material/AAD, sensitive policy removal/re-add and disable/re-enable barriers, cosmetic pending-row revisions, consumed denied exchanges, cookie scopes, strict state parsing, local-only return paths, entropy failure and replay hashing/retention.

External fixture reruns opt in with SSO_SERVICE_TEST_ENGINE and SSO_SERVICE_TEST_DSN. PostgreSQL creates unique npm_sso_task6_<timestamp> schemas and drops them after each test. MySQL refuses any database except npm_sso_task6_tests and removes only its test tables afterward. The now-empty dedicated MySQL fixture database remains for review. All fixture access used the existing npm-sso-test network/containers; no application database or other resources changed.

No outstanding implementation blocker. Real protocol validation remains Tasks 7-9; HTTP body bounds, browser cookie orchestration and JWT delivery remain Task 11. No migrations, dependencies, global tools or application configuration were changed.
