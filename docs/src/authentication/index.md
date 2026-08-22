---
outline: deep
---

# Authentication Providers

Out of the box, people sign in to Nginx Proxy Manager with an email address and
password stored in its own database. You can additionally connect one or more
**authentication providers** so that they sign in with credentials you already
manage elsewhere.

Three kinds of provider are supported:

| Type | Protocol | How it looks on the login screen |
| ---- | -------- | -------------------------------- |
| **LDAP** | LDAP / LDAPS, optionally with StartTLS | The usual username and password form |
| **SAML** | SAML 2.0 | A "Continue with …" button |
| **OAuth** | OAuth 2.0 / OpenID Connect | A "Continue with …" button |

LDAP deliberately reuses the normal login form: directory users type their
username (or email) and password just like everyone else, and Nginx Proxy
Manager works out which directory to check.

Providers can be added in two ways, and both can be used at once:

- In the admin interface, under **Users → Authentication Providers**
- With environment variables, which is usually what you want for a container
  you deploy from a compose file

## Concepts

### Matching people to accounts

Every person still has a local user record here — that is what owns their proxy
hosts and permissions. When somebody signs in through a provider, they are
matched to that record in this order:

1. An account already linked to that identity at that provider (by LDAP DN,
   OIDC `sub`, or SAML `NameID`)
2. An existing account with the same email address, which then becomes linked
3. A brand new account — but only if the provider has **Create users on first
   sign in** switched on

If none of those apply the sign in is refused, and an administrator has to
create the user first. Leaving auto-creation off is the safer default: it means
having an account in your directory is not by itself enough to get into Nginx
Proxy Manager.

::: warning
Step 2 links accounts by email address, which means a provider that lets people
choose their own unverified email could be used to take over an existing
account. Only connect providers whose email addresses you trust, which is the
normal case for a company directory or a self-hosted identity provider.
:::

### Roles

By default, external providers only prove *who* someone is. Their role and
permissions stay under your control in the Users screen.

If you would rather drive administrator access from your directory, set an
**Administrator group** on the provider. On every sign in, anyone whose groups
contain that value is given the `admin` role, and anyone who no longer has it
loses the role again. Leave the field blank to manage roles here instead.

### Turning off password sign in

Once at least one provider is enabled you can switch off **Allow email and
password sign in**, which hides the password form entirely.

Be careful with this. Make sure you have signed in successfully through a
provider *before* turning it off. If you do lock yourself out, set
`AUTH_DISABLE_LOCAL=false` on the container and restart — the environment
variable overrides the stored setting.

### Two-factor authentication

If someone has 2FA enabled on their local account, they are still asked for
their code after signing in through a provider. Most identity providers can
enforce MFA themselves, in which case you probably do not want to enable it
here as well.

## LDAP

Nginx Proxy Manager binds to your directory with an optional read-only service
account, searches for the person who is signing in, and then re-binds as that
person's DN to check their password. The password is never read out of the
directory.

| Field | Notes |
| ----- | ----- |
| Server URL | `ldap://host:389` or `ldaps://host:636` |
| Base DN | Where to search from, e.g. `dc=example,dc=com` |
| Bind DN / password | A read-only service account. Leave blank to search anonymously. |
| User filter | `{{username}}` is replaced with whatever was typed into the login form |
| Email attribute | Required. Someone with no email address in the directory cannot sign in. |
| Group attribute | Read from the user entry, for directories with the `memberOf` overlay or Active Directory |
| Group filter | Used instead when the user entry carries no groups. `{{dn}}` and `{{username}}` are substituted. |

The user filter defaults to `(|(uid={{username}})(mail={{username}}))`, which
lets people sign in with either their username or their email address. Values
are escaped before substitution, so a filter cannot be broken out of.

### Group membership

Directories expose group membership in one of two ways, and both are supported:

- **On the user** — Active Directory, FreeIPA and OpenLDAP with the `memberof`
  overlay all set `memberOf` on the user entry. Leave the group attribute as
  `memberOf` and you are done.
- **On the group** — plain OpenLDAP stores members on the group instead. Set a
  group filter such as `(&(objectClass=groupOfNames)(member={{dn}}))` and the
  directory is searched the other way around.

### Example

```yaml
environment:
  AUTH_LDAP_ENABLED: "true"
  AUTH_LDAP_NAME: "Company Directory"
  AUTH_LDAP_URL: "ldaps://ldap.example.com:636"
  AUTH_LDAP_BIND_DN: "cn=readonly,dc=example,dc=com"
  AUTH_LDAP_BIND_PASSWORD: "secret"
  AUTH_LDAP_BASE_DN: "dc=example,dc=com"
  AUTH_LDAP_USER_FILTER: "(|(uid={{username}})(mail={{username}}))"
  AUTH_LDAP_ADMIN_GROUP: "cn=npm-admins,ou=groups,dc=example,dc=com"
  AUTH_LDAP_AUTO_CREATE_USER: "true"
```

## OAuth and OpenID Connect

For any provider that supports OpenID Connect discovery — Authentik, Keycloak,
Authelia, Google, Entra ID, Okta and friends — you only need the issuer URL,
a client ID and a client secret. Everything else is discovered.

The authorization code flow is used with PKCE, a single-use `state` and a
`nonce`. ID tokens are verified against the provider's JWKS, and the userinfo
endpoint is consulted as well, because providers differ in which claims they
put where.

Register this redirect URI with your OAuth application:

```
https://your-npm-host/api/auth/<provider-id>/callback
```

The exact URL is shown in the provider dialog once it has been saved.

### Example

```yaml
environment:
  AUTH_OAUTH_ENABLED: "true"
  AUTH_OAUTH_NAME: "Company SSO"
  AUTH_OAUTH_ISSUER_URL: "https://sso.example.com/application/o/npm/"
  AUTH_OAUTH_CLIENT_ID: "npm"
  AUTH_OAUTH_CLIENT_SECRET: "secret"
  AUTH_OAUTH_SCOPES: "openid email profile"
  AUTH_OAUTH_GROUP_CLAIM: "groups"
  AUTH_OAUTH_ADMIN_GROUP: "npm-admins"
  AUTH_OAUTH_AUTO_CREATE_USER: "true"
```

If your provider does not offer discovery, leave the issuer URL blank and set
`AUTH_OAUTH_AUTHORIZATION_URL`, `AUTH_OAUTH_TOKEN_URL`, `AUTH_OAUTH_USERINFO_URL`
and, if it issues ID tokens, `AUTH_OAUTH_JWKS_URL` instead.

## SAML

Give your identity provider the service provider metadata, which is published
unauthenticated at:

```
https://your-npm-host/api/auth/<provider-id>/metadata
```

Then configure the provider here with the IdP's sign-in URL and its signing
certificate. Assertions must be signed; responses may be signed as well if your
IdP does that.

Attribute names vary a lot between identity providers, so the common claim URIs
and short names are tried automatically. Set the attribute fields explicitly if
your IdP uses something unusual.

### Example

```yaml
environment:
  AUTH_SAML_ENABLED: "true"
  AUTH_SAML_NAME: "Company SSO"
  AUTH_SAML_ENTRY_POINT: "https://sso.example.com/idp/sso"
  AUTH_SAML_ISSUER: "nginx-proxy-manager"
  AUTH_SAML_IDP_CERT: "MIIDXTCCAkWgAwIBAgIJ..."
  AUTH_SAML_EMAIL_ATTRIBUTE: "email"
  AUTH_SAML_GROUP_ATTRIBUTE: "groups"
  AUTH_SAML_ADMIN_GROUP: "npm-admins"
  AUTH_SAML_AUTO_CREATE_USER: "true"
```

## Environment variables

Providers configured this way are recreated from the environment every time the
container starts, appear in the admin interface as read-only, and disappear
again when their variables are removed. At most one provider of each type can
be configured with environment variables; add more in the interface if you need
them.

Any secret can also be supplied as a docker secret by appending `__FILE` to the
variable name and pointing it at a file, for example
`AUTH_LDAP_BIND_PASSWORD__FILE=/run/secrets/ldap_password`.

### Common

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_DISABLE_LOCAL` | `false` | Turns off email and password sign in, and overrides the setting in the interface |
| `AUTH_PUBLIC_URL` | derived from the request | The externally reachable base URL, used to build redirect URIs. Set this if the automatic value is wrong. |

Each provider type accepts the same four options, with `<TYPE>` being `LDAP`,
`SAML` or `OAUTH`:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_<TYPE>_ENABLED` | `false` | Whether to configure this provider at all |
| `AUTH_<TYPE>_NAME` | the type | The display name shown on the login screen |
| `AUTH_<TYPE>_AUTO_CREATE_USER` | `false` | Create a local user on first sign in |
| `AUTH_<TYPE>_ADMIN_GROUP` | empty | Group or claim value that grants the admin role |
| `AUTH_<TYPE>_DEFAULT_ROLES` | empty | Comma separated roles given to newly created users |

### LDAP

| Variable | Default |
| -------- | ------- |
| `AUTH_LDAP_URL` | |
| `AUTH_LDAP_BIND_DN` | |
| `AUTH_LDAP_BIND_PASSWORD` | |
| `AUTH_LDAP_BASE_DN` | |
| `AUTH_LDAP_USER_FILTER` | `(\|(uid={{username}})(mail={{username}}))` |
| `AUTH_LDAP_EMAIL_ATTRIBUTE` | `mail` |
| `AUTH_LDAP_NAME_ATTRIBUTE` | `cn` |
| `AUTH_LDAP_NICKNAME_ATTRIBUTE` | `givenName` |
| `AUTH_LDAP_GROUP_ATTRIBUTE` | `memberOf` |
| `AUTH_LDAP_GROUP_BASE_DN` | the base DN |
| `AUTH_LDAP_GROUP_FILTER` | |
| `AUTH_LDAP_GROUP_NAME_ATTRIBUTE` | `dn` |
| `AUTH_LDAP_START_TLS` | `false` |
| `AUTH_LDAP_TLS_REJECT_UNAUTHORIZED` | `true` |
| `AUTH_LDAP_TIMEOUT` | `10000` |

### SAML

| Variable | Default |
| -------- | ------- |
| `AUTH_SAML_ENTRY_POINT` | |
| `AUTH_SAML_ISSUER` | `nginx-proxy-manager` |
| `AUTH_SAML_IDP_CERT` | |
| `AUTH_SAML_SP_PRIVATE_KEY` | |
| `AUTH_SAML_SIGNATURE_ALGORITHM` | `sha256` |
| `AUTH_SAML_WANT_ASSERTIONS_SIGNED` | `true` |
| `AUTH_SAML_WANT_AUTHN_RESPONSE_SIGNED` | `false` |
| `AUTH_SAML_EMAIL_ATTRIBUTE` | auto-detected |
| `AUTH_SAML_NAME_ATTRIBUTE` | auto-detected |
| `AUTH_SAML_NICKNAME_ATTRIBUTE` | auto-detected |
| `AUTH_SAML_GROUP_ATTRIBUTE` | auto-detected |

### OAuth

| Variable | Default |
| -------- | ------- |
| `AUTH_OAUTH_ISSUER_URL` | |
| `AUTH_OAUTH_AUTHORIZATION_URL` | discovered |
| `AUTH_OAUTH_TOKEN_URL` | discovered |
| `AUTH_OAUTH_USERINFO_URL` | discovered |
| `AUTH_OAUTH_JWKS_URL` | discovered |
| `AUTH_OAUTH_CLIENT_ID` | |
| `AUTH_OAUTH_CLIENT_SECRET` | |
| `AUTH_OAUTH_SCOPES` | `openid email profile` |
| `AUTH_OAUTH_EMAIL_CLAIM` | `email` |
| `AUTH_OAUTH_NAME_CLAIM` | `name` |
| `AUTH_OAUTH_NICKNAME_CLAIM` | `preferred_username` |
| `AUTH_OAUTH_GROUP_CLAIM` | `groups` |
| `AUTH_OAUTH_USE_BASIC_AUTH` | `false` |

## Troubleshooting

**"There is no account here for this user"** — the provider is not allowed to
create accounts. Either turn on auto-creation, or create the user in the Users
screen with the same email address the provider reports.

**LDAP sign in silently falls back to "Invalid email or password"** — a
directory that cannot be reached is logged and skipped, so the login looks like
a wrong password. Use the **Test** button on the provider, and check the
container log for a line from `Auth`.

**The redirect comes back to the wrong host** — set `AUTH_PUBLIC_URL` to the
URL your users actually visit.

**Someone is missing the admin role** — the group value has to match exactly
(case is ignored). For LDAP this is normally the group's full DN. Signing in
again picks up any change.
