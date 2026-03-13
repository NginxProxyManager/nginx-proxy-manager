# PR #5345 Audit Report — Diff Reduction

**Date:** 2026-03-13  
**Branch:** `feature/ldap-auth` vs `origin/develop`  
**Starting stats:** 91 files changed, 12,717 insertions(+), 628 deletions(−)

---

## Executive Summary

The PR grew to 12.7K+ lines across 91 files because multiple agents worked independently, each adding their own test scaffolding, verbose JSDoc, and drive-by refactors. The core LDAP functionality is solid and well-tested — the problem is _volume_, not quality.

**Estimated safe reduction: ~2,100–2,500 lines** without removing any functionality.

### Biggest wins (by category)

| Category | Estimated savings | Approach |
|----------|------------------:|----------|
| Tighten JSDoc/comments in source files | ~400 lines | Condense multi-line blocks to 1–3 lines where obvious |
| Tighten JSDoc/comments in test files | ~300 lines | Same treatment for test file headers and describe blocks |
| Remove blank lines/whitespace | ~250 lines | Excessive blank line padding in all LDAP files |
| Remove mock-against-mock tests in ldap-sync.test.js | ~40 lines | normalizeUser tests that only test mock shapes |
| Squash migrations (3→1 for ldap_config) | ~80 lines | Merge page_size into initial ldap_config creation |
| Revert drive-by refactors (non-LDAP files) | ~250 lines | 4 models, regenerate-config, nginx.conf, s6 scripts, trust_forwarded_proto |
| Condense test README | ~25 lines | Trim to essential info |
| Reduce lockfile churn (if possible) | ~500 lines | Separate version bumps from LDAP additions |
| **Total estimated** | **~1,850–2,500** | |

---

## Per-File Analysis

### Legend
- **KEEP** — Essential, no changes needed
- **TRIM** — Keep file, reduce verbosity (comments, blank lines, etc.)
- **REVERT** — Revert to upstream (not LDAP-related)
- **MERGE** — Combine with another file
- **REMOVE** — Delete entirely

---

### Core LDAP Source Files (3,225 lines total)

| File | Lines | +/− | Action | Notes | Est. savings |
|------|------:|-----|--------|-------|-------------:|
| `backend/internal/ldap-sync.js` | 1,130 | +1130 | TRIM | 296 comment lines (~26%). Condense obvious JSDoc (deriveName, isInGroup, makeMockEmail). Keep complex explanations (isUniqueConstraintViolation cross-engine table, searchPaged race notes). | ~120 |
| `backend/internal/ldap.js` | 818 | +818 | TRIM | 298 comment lines (~36%). parseObjectGUID has an excellent 15-line endian explanation — keep. But many function JSDoc are 8-12 lines for 3-line functions. Condense. buildDefaultSyncFilter 20-line JSDoc can be halved. | ~130 |
| `backend/lib/ldap-client.js` | 871 | +871 | TRIM | 271 comment lines (~31%). Module header (22 lines) is good context — keep. Pool/semaphore JSDoc are thorough but could lose the "shape" documentation that repeats the code structure. Reaper/health-check JSDoc can condense. | ~110 |
| `backend/internal/ldap-settings.js` | 288 | +288 | TRIM | 51 comment lines. Moderate. rowToConfig/payloadToRow are self-documenting — their JSDoc just restates signatures. | ~20 |
| `backend/lib/ldap-env.js` | 118 | +118 | TRIM | 54 comment lines (~46%). The 43-line module-level comment lists all env vars — useful as reference BUT duplicates docs/ldap-authentication.md. Keep a 5-line summary, point to docs. | ~30 |

**Source file savings: ~410 lines**

---

### Test Files (5,182 lines total)

| File | Lines | +/− | Action | Notes | Est. savings |
|------|------:|-----|--------|-------|-------------:|
| `backend/__tests__/ldap/ldap-sync.test.js` | 1,758 | +1758 | TRIM | 210 comments, 318 blank lines (30% whitespace!). Lines 1470-1505: two normalizeUser tests that test mock-against-mock (don't test real behavior — objectguid.test.js covers this properly). Remove those 36 lines. Condense section headers and reduce inter-test blank padding. | ~180 |
| `backend/__tests__/ldap/ldap-client.test.js` | 1,369 | +1369 | TRIM | 131 comments, 249 blank lines. Good test coverage, no obvious redundancy. Reduce blank padding between tests. Condense file header (8→3 lines). | ~100 |
| `backend/__tests__/ldap/ldap-internal.test.js` | 782 | +782 | TRIM | 85 comments, 145 blank lines. normalizeUser tests (7 cases) overlap partially with objectguid.test.js but test different aspects (attribute mapping vs GUID parsing). KEEP but trim whitespace. | ~60 |
| `backend/__tests__/ldap/ldap-sync.test.js` → normalizeUser | 36 | — | REMOVE (partial) | Lines 1470-1505: Tests call `mockInternalLdap.normalizeUser()` on a mock and assert mock return values. This tests nothing real — just that `mockReturnValueOnce` works. objectguid.test.js tests the real `normalizeUser`. | ~36 |
| `backend/__tests__/ldap/objectguid.test.js` | 468 | +468 | TRIM | 92 comments, 64 blank lines. Excellent regression test suite — the UTF-8 collapse tests are critical. Trim whitespace only. | ~30 |
| `backend/__tests__/ldap/ldap-env.test.js` | 413 | +413 | TRIM | 31 comments, 55 blank lines. Very clean test file. Minor trim. | ~20 |
| `backend/__tests__/validator/api-validator.test.js` | 392 | +392 | KEEP | Clean, well-structured. Minimal trim opportunity. | ~10 |
| `backend/__tests__/README.md` | 53 | +53 | TRIM | "Adding Jest" section repeats what's in package.json. Condense to essentials. | ~20 |

**Test file savings: ~456 lines**

---

### Mock Files (297 lines total)

| File | Lines | Action | Notes | Est. savings |
|------|------:|--------|-------|-------------:|
| `backend/__mocks__/lodash.js` | 74 | KEEP | ESM compatibility shim. Comprehensive but needed. | 0 |
| `backend/__mocks__/objection.js` | 56 | KEEP | Needed for model mocking. | 0 |
| `backend/__mocks__/config.js` | 42 | KEEP | | 0 |
| `backend/__mocks__/signale.js` | 40 | KEEP | | 0 |
| `backend/__mocks__/moment.js` | 32 | KEEP | | 0 |
| `backend/__mocks__/bcrypt.js` | 17 | KEEP | | 0 |
| `backend/__mocks__/node-rsa.js` | 15 | KEEP | | 0 |
| `backend/__mocks__/tarn.js` | 14 | KEEP | | 0 |
| `backend/__mocks__/db.js` | 7 | KEEP | | 0 |

**Mock savings: 0 lines** (all necessary for Jest ESM testing)

---

### Migration Files (454 lines total, 6 LDAP + 1 pre-existing)

| File | Lines | Action | Notes | Est. savings |
|------|------:|--------|-------|-------------:|
| `20260222200000_ldap_config.js` | 53 | **MERGE** | Can absorb page_size column from 20260224200000 | — |
| `20260222200001_user_ldap_fields.js` | 57 | KEEP | Separate table (user + auth) changes | 0 |
| `20260224200000_ldap_config_page_size.js` | 49 | **MERGE → DELETE** | Single column addition — squash into 20260222200000 | ~49 |
| `20260225090000_user_email_unique.js` | 86 | KEEP | Complex cross-engine logic (MySQL generated column, partial index). Must stay separate. | 0 |
| `20260301100000_ldap_guid.js` | 88 | KEEP | Cross-engine partial unique index. Must stay separate. | 0 |
| `20260305100000_cleanup_zombie_ldap_users.js` | 79 | KEEP | Data cleanup migration — distinct from schema changes. MUST stay. | 0 |
| `20260131163528_trust_forwarded_proto.js` | 42 | **REVERT** | Only change is `function` → `=>` syntax. Drive-by style change. | ~4 |

**Migration savings: ~53 lines** (squash page_size, revert trust_forwarded_proto style change)

---

### Drive-by Refactors (NON-LDAP — candidates for revert)

These files were changed but contain NO LDAP functionality. They are drive-by refactors/fixes that inflate the diff and will distract the reviewer.

| File | +/− lines | Action | Notes | Est. savings |
|------|----------:|--------|-------|-------------:|
| `backend/models/dead_host.js` | +13/−1 | **REVERT** | Added defaultAllowGraph/defaultExpand/defaultOrder + castJsonIfNeed import. Not used by LDAP code. | ~14 |
| `backend/models/proxy_host.js` | +13/−1 | **REVERT** | Same as above. | ~14 |
| `backend/models/redirection_host.js` | +13/−1 | **REVERT** | Same as above. | ~14 |
| `backend/models/stream.js` | +13/−1 | **REVERT** | Same as above. | ~14 |
| `backend/internal/dead-host.js` | +2/−2 | **REVERT** | Uses `deadHostModel.defaultAllowGraph` instead of hardcoded string. Depends on model changes above. | ~4 |
| `backend/internal/proxy-host.js` | +6/−6 | **REVERT** | Same pattern + `create_certificate` → `createCertificate` rename + whitespace. | ~12 |
| `backend/internal/redirection-host.js` | +2/−3 | **REVERT** | Same pattern. | ~5 |
| `backend/internal/stream.js` | +2/−3 | **REVERT** | Same pattern. | ~5 |
| `backend/scripts/regenerate-config` | +36/−64 | **REVERT** | Major rewrite (model getters, --dry-run, --help). Unrelated to LDAP. | ~100 |
| `docker/rootfs/etc/nginx/nginx.conf` | +5/−5 | **REVERT** | Bracket-glob includes (`[.]conf`). Nice fix but unrelated. | ~10 |
| `docker/rootfs/etc/s6-overlay/s6-rc.d/prepare/40-dynamic.sh` | +6/−4 | **REVERT** | DISABLE_RESOLVER env var, shell quoting fixes. Unrelated. | ~10 |
| `docker/rootfs/etc/s6-overlay/s6-rc.d/prepare/50-ipv6.sh` | +1/−1 | **REVERT** | Shell quoting fix. Unrelated. | ~2 |
| `backend/migrations/20260131163528_trust_forwarded_proto.js` | +2/−2 | **REVERT** | function→arrow syntax change. | ~4 |
| `backend/biome.json` | +1/−1 | KEEP or REVERT | Minor version change. Reviewer may question. | ~2 |
| `frontend/biome.json` | +1/−1 | KEEP or REVERT | Same. | ~2 |
| `frontend/index.html` | +1/−1 | KEEP or REVERT | Unknown change. | ~2 |

**Drive-by revert savings: ~214 lines removed from diff** (and 14 fewer files changed)

---

### Lockfiles & Package Files

| File | +/− lines | Action | Notes |
|------|----------:|--------|-------|
| `frontend/yarn.lock` | +239/−230 | KEEP | Needed for frontend dependency changes |
| `docs/yarn.lock` | +157/−103 | REVIEW | Any docs dependency changes? If none, REVERT. |
| `backend/yarn.lock` | +77/−77 | KEEP | ldapjs, jest, @jest/globals added |
| `test/yarn.lock` | +30/−24 | REVIEW | Check if test dep changes are needed. |
| `backend/package.json` | +8/−4 | KEEP | ldapjs, jest dependencies, test script |
| `frontend/package.json` | +6/−6 | KEEP | Version bumps for frontend |
| `test/package.json` | +5/−5 | REVIEW | Same |

**Lockfile note:** If docs/yarn.lock and test/yarn.lock changes are purely version bumps (not adding LDAP-related deps), consider reverting them to reduce diff by ~240 lines.

---

### Frontend Files (all KEEP)

| File | Lines | Notes |
|------|------:|-------|
| `frontend/src/pages/Settings/LdapSettings.tsx` | 739 | Core LDAP settings UI. Well-structured. |
| `frontend/src/api/backend/getLdapSettings.ts` | 53 | API client |
| `frontend/src/api/backend/testLdapAuth.ts` | 42 | API client |
| `frontend/src/api/backend/syncLdapUsers.ts` | 28 | API client |
| `frontend/src/api/backend/updateLdapSettings.ts` | 27 | API client |
| `frontend/src/api/backend/testLdapConnection.ts` | 26 | API client |
| `frontend/src/pages/Users/Table.tsx` | +41 | LDAP badge in user table |
| `frontend/src/pages/Settings/Layout.tsx` | +17/−3 | LDAP nav link |
| `frontend/src/pages/Login/index.tsx` | +10/−9 | Login flow changes |
| `frontend/src/modules/Validations.tsx` | +29/−1 | LDAP field validations |
| `frontend/src/locale/src/en.json` | +6 | i18n strings |
| `frontend/src/api/backend/models.ts` | +2 | Type additions |

**Frontend savings: 0 lines** (all necessary)

---

### Docker & Infra Files (mostly KEEP)

| File | Lines | Action | Notes |
|------|------:|--------|-------|
| `docker/docker-compose.ldap-test.yml` | 115 | KEEP | Test LDAP server setup |
| `docker/Dockerfile.build` | 86 | KEEP | Self-contained build |
| `docker/Dockerfile` | +3 | KEEP | Minor |
| `docker/ldap-bootstrap/*.ldif` | 107 | KEEP | Test LDAP data |

---

### Documentation (KEEP)

| File | Lines | Action | Notes |
|------|------:|--------|-------|
| `docs/ldap-authentication.md` | 591 | KEEP | Comprehensive user docs. Well-written. |
| `docs/src/advanced-config/index.md` | +13/−1 | KEEP | Links to LDAP docs |
| `README.md` | +41 | KEEP | LDAP section in project README |

---

### Other Backend Files (all KEEP)

| File | Lines | Action | Notes |
|------|------:|--------|-------|
| `backend/internal/token.js` | +150/−57 | KEEP | Core LDAP auth flow integration |
| `backend/internal/user.js` | +26/−2 | KEEP | auth_source + soft-delete handling |
| `backend/internal/2fa.js` | +9/−1 | KEEP | LDAP 2FA guard |
| `backend/routes/settings-ldap.js` | 142 | KEEP | LDAP API routes |
| `backend/routes/main.js` | +3 | KEEP | Route registration |
| `backend/models/ldap_config.js` | 56 | KEEP | Objection model |
| `backend/models/user.js` | +4 | KEEP | auth_source field |
| `backend/lib/validator/api.js` | +139/−6 | KEEP | Validation improvements |
| `backend/schema/*.json` | 316 | KEEP | OpenAPI schemas |
| `backend/jest.config.js` | 54 | KEEP | Test config |
| `backend/jest.resolver.cjs` | 22 | KEEP | ESM resolver |
| `backend/logger.js` | +2/−1 | KEEP | LDAP logger |
| `backend/setup.js` | +1 | KEEP | Import |

---

### Config/Env Var Analysis

**Environment variables added** (all in ldap-env.js):
- `LDAP_ENABLED`, `LDAP_SERVER_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` — core config ✅
- `LDAP_SEARCH_BASE`, `LDAP_GROUP_DN`, `LDAP_USER_ATTR` — directory config ✅
- `LDAP_ADMIN_GROUP`, `LDAP_USER_GROUP` — access control ✅
- `LDAP_TLS_VERIFY`, `LDAP_STARTTLS` — security ✅
- `LDAP_MAX_CONNECTIONS`, `LDAP_ACQUIRE_TIMEOUT` — pool tuning ✅
- `LDAP_LOGIN_ATTRS` — multi-attribute login ✅
- `LDAP_SYNC_FILTER`, `LDAP_SYNC_GROUP` — sync scope control ✅
- `LDAP_MAX_LOGIN_CONNECTIONS`, `LDAP_LOGIN_ACQUIRE_TIMEOUT_MS` — login semaphore (in ldap.js) ✅

**Potential overlap:** `LDAP_MAX_CONNECTIONS` (pool) vs `LDAP_MAX_LOGIN_CONNECTIONS` (login semaphore) — these are intentionally separate pools. No overlap. ✅

**No unnecessary env vars found.** All serve distinct purposes.

---

## Implementation Plan (Safe Reductions)

### Phase 1: Revert drive-by refactors (~214 lines)
```bash
git checkout origin/develop -- \
  backend/models/dead_host.js \
  backend/models/proxy_host.js \
  backend/models/redirection_host.js \
  backend/models/stream.js \
  backend/internal/dead-host.js \
  backend/internal/proxy-host.js \
  backend/internal/redirection-host.js \
  backend/internal/stream.js \
  backend/scripts/regenerate-config \
  docker/rootfs/etc/nginx/nginx.conf \
  docker/rootfs/etc/s6-overlay/s6-rc.d/prepare/40-dynamic.sh \
  docker/rootfs/etc/s6-overlay/s6-rc.d/prepare/50-ipv6.sh \
  backend/migrations/20260131163528_trust_forwarded_proto.js
```

### Phase 2: Squash page_size migration (~49 lines)
- Add `table.integer("page_size").notNull().defaultTo(0)` to `20260222200000_ldap_config.js`
- Delete `20260224200000_ldap_config_page_size.js`

### Phase 3: Tighten JSDoc comments (~400 lines across source + tests)
- Condense multi-line JSDoc to 1-3 lines where function is self-documenting
- Remove JSDoc that just restates the function signature
- Keep complex explanations (endian swap, cross-engine SQL, race conditions)

### Phase 4: Reduce blank line padding (~250 lines across all files)
- Single blank line between test cases (not double)
- Remove trailing blank lines in describe blocks
- Normalize section separators to 1 blank line

### Phase 5: Remove mock-against-mock tests (~36 lines)
- Delete ldap-sync.test.js lines 1470-1505 (normalizeUser mock tests)

### Phase 6: Trim test README (~20 lines)
- Remove "Adding Jest" section, condense table

---

## Final Assessment

The PR's actual LDAP functionality is clean, well-architected, and thoroughly tested. The diff inflation comes from:

1. **Verbose documentation style** — every function got full JSDoc even when self-documenting (~30% of source files are comments)
2. **Drive-by refactors** — model getters, regenerate-config rewrite, nginx glob syntax, shell fixes (14 unrelated files)
3. **Lockfile churn** — version bumps that came along with dependency additions (~900 lines)
4. **Generous whitespace** — double blank lines between test cases, section separators

None of these compromise functionality. The reductions proposed here are purely cosmetic/organizational.

**After implementation, expected diff: ~10,000-10,500 lines across ~77 files** (down from 12,717 across 91).
