## Settings

Admin-only configuration for automation and default behavior.

### Default site

Set the default site shown when no proxy host matches the request.

### External credential stores

Connect HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Infisical (Universal Auth), or HTTP endpoints.

See [Automation API](/documentation?path=/advanced/automation-api) in the full documentation for API keys, webhooks, and external `credential_ref` paths (e.g. `/DNS/cloudflare-api-token` for Infisical).

### API keys and webhooks

Create long-lived API keys for automation and configure outbound webhooks with HMAC signatures. Details are in the [Automation API](/documentation?path=/advanced/automation-api) guide.
