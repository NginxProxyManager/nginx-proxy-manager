# Vault & automation UI — translation review

Strings live in `scripts/locale-translate-vault.cjs` and are applied to `src/*.json` (26 keys × 21 locales).

## Review status

| Locale | Code | Review pass | Notes |
|--------|------|-------------|-------|
| Bulgarian | bg | AI-polished | Verify IT terms (Webhook, OIDC) |
| Czech | cs | AI-polished | «tajemství» → prefer «tajný údaj» if native prefers |
| German | de | Aligned with existing «Anmeldedaten», Sie-form |
| Spanish | es | Formal «usted» style like other NPM es strings |
| Estonian | et | AI-polished | |
| French | fr | Aligned with «identifiants» in cert DNS strings |
| Irish | ga | AI-polished | Low traffic; native review welcome |
| Hungarian | hu | AI-polished | |
| Indonesian | id | AI-polished | |
| Italian | it | AI-polished | |
| Japanese | ja | UI tone pass | |
| Korean | ko | UI tone pass | |
| Dutch | nl | Aligned with «inloggegevens» |
| Norwegian | no | AI-polished | |
| Polish | pl | AI-polished | |
| Portuguese | pt | European Portuguese tone | |
| Russian | ru | Grammar pass | |
| Slovak | sk | AI-polished | |
| Turkish | tr | AI-polished | |
| Vietnamese | vi | AI-polished | |
| Chinese | zh | Aligned with existing «凭据» |

**Legend:** «AI-polished» = second-pass wording; not a substitute for a native speaker sign-off.

## How to contribute a native fix

1. Edit the string in `scripts/locale-translate-vault.cjs` under the locale code (e.g. `de: { ... }`).
2. Run: `node scripts/locale-translate-vault.cjs`
3. Open the UI (Settings → API Keys, Credentials, Webhooks) in that language and sanity-check length/fit.
4. Commit only the locale JSON files + script if changed.

## Terminology guide (keep consistent)

| English | Keep in UI? | de | fr | nl | ja | zh |
|---------|-------------|----|----|----|----|-----|
| API key | often yes | API-Schlüssel | clé API | API-sleutel | APIキー | API 密钥 |
| Webhook | often yes | Webhook | Webhook | webhook | Webhook | Webhook |
| OIDC | yes | OIDC | OIDC | OIDC | OIDC | OIDC |
| Vault (product) | yes | Vault | Vault | Vault | Vault | Vault |
| /data | yes | /data | /data | /data | /data | /data |
| npmak_ | yes | npmak_ | npmak_ | npmak_ | npmak_ | npmak_ |

## Keys reference (English source)

See `src/en.json`: `api-key`, `api-keys`, `credentials.*`, `credential-providers.*`, `webhooks.*`.
