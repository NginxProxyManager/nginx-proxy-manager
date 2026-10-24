# Admin SSO implementation handoff

Implementation and independent whole-branch review are complete on `feat/admin-sso`.
Reviewed implementation head: `a90c6208`. No merge, push or deployment was performed.

## Verification

- PostgreSQL, MySQL and SQLite: 21/21 HTTPS Cypress cases each on the frozen final backend/frontend before the frontend-only corrective commit.
- Final frontend correction: PostgreSQL 22/22, including SSO self-profile editing through `PUT /users/me`. Backend was unchanged by that correction.
- All engines exercise OIDC, OAuth2, signed SAML with an actual cross-site POST, independent new attempts in two browser targets, and positive authorization before two-instance revocation tests.
- Backend full suite and affected race suites pass. Production-naming populated and duplicate-email upgrade tests pass, including actual PostgreSQL/MySQL connections.
- Backend Docker CI passes: 54.1% coverage against the 30% gate. Source vulnerability scan reports no reachable or imported-package vulnerabilities; one required-module-only advisory remains unreachable.
- Frontend: 42 focused tests pass; full suite has 99 passing tests and one pre-existing Estonian setup translation failure. Lint and production build pass.
- Independent final review and corrective re-review approved the implementation. Sanitized screenshots are in `docs/src/public/screenshots/sso-*.png`.

Exact commands and captured logs remain in the local ignored `.superpowers/sdd/2026-10-23-admin-sso/` workspace, especially `final-fix-report.md`, `task-15-fix1-report.md` and `acceptance-audit.md`.

## Known limitations

- Existing backend password 2FA remains unimplemented; SSO deliberately skips NPM 2FA.
- Live external LDAP-server/browser validation was not run. Preserved LDAP source/admission logic has backend test coverage, not a claimed live browser result.
- Expired/consumed authentication records are retained. Database size and startup ciphertext scans grow with traffic; bounded ancestry/replay-safe pruning remains future operational work.
- Existing responsive-table dropdown clipping at the last row remains a separate UI issue.
- Bootstrap one instance before scaling against a shared empty database. This matrix does not claim concurrent empty-database JWT-key initialization safety.

## Rulings made during implementation

These record controller decisions and their consequences, in chronological order.

1. Use an isolated sibling checkout and preserve original untracked files. Cost if mistaken: changes need explicit integration into the original checkout.
2. Record unrelated baseline failures rather than expanding feature scope; do not deploy. Cost: known baseline issues remain release considerations.
3. Use ignored, project-local toolchains without global upgrades or dependency downgrades. Cost: reproduction requires the documented toolchain/container setup.
4. Run Go/SQLite verification on Linux because the baseline dependency does not compile on Windows. Cost: Windows-native backend compilation is not proven.
5. Treat unavailable Docker as missing evidence, never as a three-engine pass. Docker subsequently became available and all three engines were exercised.
6. Fix bootstrap administrator creation despite its omission from the early persistence task file list. Cost: bootstrap behavior changed beyond that task's initial file list, with regression coverage.
7. Retire legacy OAuth token issuance early with HTTP 410, then supply disabled-draft conversion and documentation. Cost: legacy deployments must prepare local administrator access and reauthenticate during coordinated upgrade.
8. Replace route-scoped `__Secure-` binding cookies with host-bound `__Host-` cookies at `Path=/`. Cost: cookies are sent to other same-host paths, in exchange for browser-enforced host binding.
9. Permit a bounded, debug-only full-admin SSE delivery barrier to prove queued-event revocation deterministically. Cost: test control code exists in debug builds; production routing and delivery authorization remain enforced.
10. Defer automatic TTL pruning. Cost: historical records and startup scans grow; later bounded maintenance is required.
11. Initially defer the ignored creation password control during code freeze. This ruling was superseded: the control is now hidden on creation and documentation correctly states post-bootstrap administrator defaults.
12. Correct load-bearing issues discovered during final review, including refresh during explicit authentication and self-profile dispatch. Cost: an additional narrowly reviewed correction was required after the first final fix wave.

See `docs/src/setup/sso.md` for setup, trust, backup/key restore and upgrade requirements.
