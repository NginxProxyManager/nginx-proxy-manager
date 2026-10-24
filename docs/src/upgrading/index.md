---
outline: deep
---

# Upgrading

```bash
docker compose pull
docker compose up -d
```

This project will automatically update any databases or other requirements so you don't have to follow
any crazy instructions. These steps above will pull the latest updates and recreate the docker
containers.

See the [list of releases](https://github.com/NginxProxyManager/nginx-proxy-manager/releases) for any upgrade steps specific to each release.

## Upgrading to the administrator SSO release

Deploy the frontend and backend from the same release together. Before upgrading an installation that used the legacy OAuth login, create and verify a local full-administrator credential and keep local login enabled. Old OAuth entry points return `410` after the upgrade and old JWTs without a server-side session ID cannot be refreshed.

The upgrade normalizes user emails (trimmed and lower-cased) and requires them to be unique among active users. If two active users normalize to the same email, or an email is invalid, the migration stops before changing anything and logs `SSO upgrade: conflicting user IDs ...` or `SSO upgrade: user ID ... has an invalid email`. Fix or remove those users on the previous release or in a restored backup, then upgrade again. Accounts are never merged automatically.

Back up both the database and `<DataFolder>/keys/sso.key`. All NPM instances that share a database must use the same restored key. After the upgrade, use **Settings > Single sign-on > Import legacy OAuth** to create a disabled draft, review it, add exact trusted emails, test it and only then enable it. Import never enables SSO or populates the shared allowlist automatically.

See [Administrator single sign-on](../setup/sso.md) for callback URLs, trust rules, session revocation and restore procedures.
