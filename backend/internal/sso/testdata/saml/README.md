# SAML signed fixtures and browser test handoff

`../../saml_test.go` generates fresh disposable RSA keys/certificates and signed
XML at runtime using crewjam/saml and patched goxmldsig. This avoids committed
private keys and stale hard-coded timestamps. The suite covers assertion and
outer signatures, unsigned/tampered identity, duplicate assertions, wrapping,
foreign-namespace identity, invalid inner signatures, issuer/audience/recipient/
destination/request mismatch, missing required fields, expiry/future skew, email
mapping, metadata import bounds/token expiry, certificate overlap and removal,
actual Redirect signature verification, and persisted signed assertion replay.
Certificates are never installation credentials. Run from backend:

```
go test ./internal/sso -run TestSAML
```

The standalone `test/ssofixtures` module supports:

```
go run . --protocol saml --listen 127.0.0.1:9443 \
  --issuer-url https://idp.test:9443 \
  --sp-entity-id urn:npm:e2e --acs-url https://npm.test/sso/CONNECTION_ID/acs \
  --cert-out /tmp/idp-tls.crt --key-out /tmp/idp-tls.key --case valid
```

`--sp-certificate /tmp/npm-sp-public.crt` makes the IdP require and verify actual
RSA-SHA256 Redirect signatures. This is a public certificate, not the SP private
key. Default issuer remains the selected loopback listener; `--issuer-url` adds a
process-scoped certificate SAN for the canonical test hostname while the listener
still must be loopback. Resolve the test domains only inside the test browser or
isolated container. Do not edit global trust or production DNS.

Cases: valid, outer, signature, issuer, audience, destination, recipient,
in_response_to, expired, unsigned, duplicate, wrapping, encrypted, unsolicited,
email_multiple, cert_overlap (both certificates advertised, second signs), and
cert_untrusted (second signs without being advertised). `/metadata` supplies the
explicit import source; `/sso` returns a signed HTML POST form to the configured
ACS. The fixture checks incoming request issuer, ACS, destination and POST binding.

## Required actual-browser acceptance test (Task 15)

Backend requests cannot prove SameSite delivery. Use distinct sites
`https://npm.test` and `https://idp.test:9443`, not different ports of localhost.
Launch Chromium with process-scoped hostname mapping and a test-only CA trust
store; NPM public_url must be `https://npm.test`. Capture only cookie attributes,
request origins and stable error codes, never assertions/tokens/private keys.

1. Bootstrap and log in locally. Preview/import IdP metadata, review issuer,
   endpoint, all fingerprints and the public SP certificate, then explicitly Save.
   Add allowed@example.com to the shared allowlist. If signed requests are enabled,
   configure the fixture with the reviewed SP public certificate before login.
2. Open two NPM login tabs in the same browser. Pause the IdP form auto-submit
   independently in each tab after Redirect. Confirm different request IDs and
   RelayStates and different host-only `__Host-` attempt cookies with Secure,
   HttpOnly, Path=/ and SameSite=None.
3. Submit tab B's real cross-site POST form first, then A's. On each ACS request
   verify the matching attempt cookie is delivered despite cross-site POST.
   Confirm both browser-bound handoffs exchange exactly once, neither tab's
   attempt cookie overwrites the other, and granted accounts have zero new
   capabilities. Repeat with two isolated browser contexts sharing the same NAT;
   one context must not complete the other's state/cookie/handoff.
4. Swap RelayStates, omit the attempt cookie, replay a POST, and reuse a handoff.
   All must fail; no surviving unauthorized session. Repeat each invalid signed
   fixture case and confirm sanitized errors, with supported-profile guidance for
   recognized encrypted/artifact/unsolicited messages.
5. Import cert_overlap: both current keys validate. Change the remote metadata
   without Save: login still uses frozen trust and Test does not fetch. Explicitly
   preview refreshed fingerprints and Save: old sessions/attempts revoke. Remove
   the old certificate in a subsequent explicit import and prove it no longer
   validates. For SP key rotation, install the newly previewed public certificate
   at the IdP before Save and verify the Redirect signature end-to-end.
6. Disable connection or remove allowed email while the IdP form is paused; the
   subsequent POST/handoff must not establish a surviving session. Preserve local
   password access throughout. Check no artifacts retain raw SAML bodies.

These browser steps are a test design, not an assertion that browser execution
has already happened. No browser server routes are introduced by Task 9.
