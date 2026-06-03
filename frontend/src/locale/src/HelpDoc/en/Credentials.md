## DNS Credentials

Stored credentials live on the **`/data` volume** under `/data/credentials/`, encrypted at rest. Use them when issuing DNS certificates so API tokens are not pasted into every certificate.

### Adding a credential

1. Open **Credentials** in the sidebar.
2. Choose **Add Credential**, pick the DNS provider, and paste the certbot INI content (same format as the legacy credentials file).
3. When creating or editing a DNS certificate, choose **Stored in NPM vault** and select the credential.

### Migrating legacy certificates

Certificates that still store `dns_provider_credentials` inline can be moved into the vault with **Migrate legacy DNS credentials**. Run a dry-run preview first, then apply the migration.

### External stores

Admins can configure **Settings → External Credential Stores** (Vault, AWS, Azure, Infisical, HTTP) with OIDC. Certificates can reference secrets by path instead of the internal vault.

### Automation

API keys and webhooks are under **Settings**. See the [Automation API](https://nginxproxymanager.com/advanced/automation-api/) documentation for Bearer auth, async jobs, and signed webhooks.
