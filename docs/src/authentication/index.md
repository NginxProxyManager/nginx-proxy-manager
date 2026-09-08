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
2. An existing account with the same email address — but only if the provider
   has **Adopt existing accounts by email address** switched on
3. A brand new account — but only if the provider has **Create users on first
   sign in** switched on

If none of those apply the sign in is refused, and an administrator has to
create the user first. Both switches are off by default: having an account in
your directory is not by itself enough to get into Nginx Proxy Manager.

::: warning Adopting accounts by email address
Matching on an email address means trusting the provider to have proved the
address belongs to whoever just signed in. A company directory does. A public
OAuth provider that lets anyone type their own address does not, and turning
this on for one would let somebody claim any account here, administrators
included, by signing up with the matching address.

Leave it off unless you trust the provider that far. For OAuth it is not enough
on its own: the provider must also return `email_verified: true`, and a sign in
is refused if it does not.

When it is off and somebody signs in whose address already belongs to an
account here, the sign in is refused rather than silently creating a duplicate.
Link the two deliberately instead: have that person sign in once with the
address changed, or remove the stale local account first.
:::

### Roles

By default, external providers only prove *who* someone is. Their role and
permissions stay under your control in the Users screen.

If you would rather drive administrator access from your directory, set an
**Administrator group** on the provider. On every sign in, anyone whose groups
contain that value is given the `admin` role, and anyone who no longer has it
loses the role again. Leave the field blank to manage roles here instead.

Roles are only recalculated when the group membership could actually be read.
If the directory is reachable enough to check a password but the group lookup
itself fails, existing roles are left exactly as they are and a warning is
logged — an outage never silently demotes your administrators.

### Turning off password sign in

Once at least one provider is enabled you can switch off **Allow email and
password sign in**, which hides the password form entirely.

Two things have to be true before this is allowed: at least one provider is
enabled, and at least one administrator has actually signed in through one. A
provider that nobody has used yet is not a way in, so the setting is refused
until it is proven.

Three more guards apply afterwards:

- Removing the last provider turns password sign in back on, rather than
  leaving an instance nobody can reach.
- An administrator whose only credential is a password does not count as a
  fallback while password sign in is off, so the guards that protect "the last
  administrator" will not delete or disable the one who can still get in.
- If it is `AUTH_DISABLE_LOCAL` holding the door shut rather than the stored
  setting, that cannot be overridden from inside — set
  `AUTH_DISABLE_LOCAL=false` on the container and restart. The container log
  says so explicitly when it happens.

If your identity provider goes down while password sign in is off, nobody can
sign in until it comes back or you restart with `AUTH_DISABLE_LOCAL=false`.
That is the trade being made by turning the password form off at all.

### Two-factor authentication

If someone has 2FA enabled on their local account, they are still asked for
their code after signing in through a provider. Most identity providers can
enforce MFA themselves, in which case you probably do not want to enable it
here as well.

### Directory sync

Sync is off by default and configured per provider, so on a small or
memory-constrained box you can leave it off entirely and rely on sign-in time
provisioning alone. Nothing is scheduled and no timer runs when it is off, and
the directory is never mirrored locally: the only rows written are a user and a
link for the people who actually sign in. Group-to-role mapping is applied at
that moment either way, so **Administrator group** works exactly the same with
sync off.

Signing in provisions one account at a time. That is usually enough, but it
means an administrator cannot grant permissions to somebody who has never
logged in, and a group change only takes effect the next time they do.

Turning on **Sync this directory on a schedule** walks the whole directory
instead, creating the accounts it finds, refreshing their details and their
group-driven roles. LDAP only: SAML and OAuth have no way to enumerate users.

Enabling sync means accounts are created for everyone the filter matches,
whether or not they have ever signed in, so narrow it with a filter or a group
if that is not what you want.

**Disable accounts that leave the directory** is off by default. With it on, an
account whose entry has disappeared is disabled on the next run. Two guards
apply: an administrator is never disabled this way while nobody else could
still sign in, and a run that returns no entries at all disables nobody, so a
broken filter or an unreachable server cannot switch off an entire
organisation.

Use the **Sync** button on the providers list to run one immediately rather than
waiting for the schedule.

### Removing a provider

Accounts created by a provider hold no password of their own, so removing the
provider has to say what becomes of them. Doing nothing would leave people with
an account nobody can sign in to and no explanation of why.

Deleting a provider **in the interface** asks which you want:

- **Keep them as local accounts.** The link is dropped and the accounts stay,
  with their hosts, permissions and ownership intact. They hold no password yet,
  so set one for them from the Users screen and they can sign in again.
- **Delete them.** The accounts go too. The dialog says up front how many would
  actually be removed, because two kinds are always kept regardless: anyone who
  can still sign in another way, such as with a password or through a second
  provider, and any administrator whose removal would leave nobody able to sign
  in and administer the instance.

Removing a provider's **environment variables** converts its accounts to local
automatically. Nobody confirmed anything in that case, and a variable
disappearing from a compose file must not quietly take people's accounts with
it. The container log names the provider and says how many accounts were
converted.

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
| User filter | <code v-pre>{{username}}</code> is replaced with whatever was typed into the login form |
| Email attribute | Required. Someone with no email address in the directory cannot sign in. |
| Group attribute | Read from the user entry, for directories with the `memberOf` overlay or Active Directory |
| Group filter | Used instead when the user entry carries no groups. <code v-pre>{{dn}}</code> and <code v-pre>{{username}}</code> are substituted. |

The user filter defaults to <code v-pre>(|(uid={{username}})(mail={{username}}))</code>, which
lets people sign in with either their username or their email address. Values
are escaped before substitution, so a filter cannot be broken out of.

### Group membership

Directories expose group membership in one of two ways, and both are supported:

- **On the user** — Active Directory, FreeIPA and OpenLDAP with the `memberof`
  overlay all set `memberOf` on the user entry. Leave the group attribute as
  `memberOf` and you are done.
- **On the group** — plain OpenLDAP stores members on the group instead. Set a
  group filter such as <code v-pre>(&(objectClass=groupOfNames)(member={{dn}}))</code> and the
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

People are remembered by the assertion's `NameID`, unless your IdP issues a
transient one — a per-session pseudonym that would make everybody look like a
new person on every sign in. In that case the email address is used instead, or
whatever you name in **Identifier attribute** if you have something better, such
as an employee number.

Sign in has to start here: every assertion must name the request it answers, and
each request can only be answered once. That rules out IdP-initiated sign in
(starting from a tile in your IdP's portal) — send people to the Nginx Proxy
Manager login page instead — and it means a captured assertion cannot be
replayed, since a signature stays valid for whoever presents it.

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

## Protecting proxied sites

Providers are not only for signing in to the admin interface. An **access list**
can accept the same directory accounts, so the people who already exist in your
directory can reach a proxied site without anyone maintaining a second list of
usernames and passwords for it.

Open an access list, go to the **Providers** tab, and tick the directories it
should accept. Visitors are still prompted for a username and password exactly
as before; those credentials are checked against the directory instead of the
list's own entries.

Only LDAP can be used here. SAML and OAuth sign people in by redirecting a
browser to the identity provider, which cannot happen for an arbitrary proxied
request — an image or an API call has nowhere to redirect to.

### Restricting to a group

Leave **Restrict to groups** empty and any account the directory authenticates
is allowed through. Fill it in, one group per line, and a user must belong to at
least one of them:

```
cn=vpn-users,ou=groups,dc=example,dc=com
cn=contractors,ou=groups,dc=example,dc=com
```

Usernames typed into the **Authorizations** tab are unaffected by this and keep
working, which is a convenient way to leave one break-glass account that does
not depend on the directory being reachable.

### How it works, and what it costs

A directory will not hand over password hashes, so its users cannot be written
into the htpasswd file nginx normally uses. Instead nginx asks the backend, per
request, whether a set of credentials is acceptable.

To keep that affordable, a decision is cached for five minutes, so a page and
all of its images cost one directory lookup rather than dozens. A refused
attempt is cached for thirty seconds only, and every cached decision for a list
is discarded the moment that list is saved, so revoking somebody's access takes
effect immediately.

Two headers are passed to the proxied application on success, which saves it
from asking the directory itself:

| Header | Contents |
| ------ | -------- |
| `X-Auth-User` | the username that was supplied |
| `X-Auth-Email` | the email address on the directory entry |

If the directory is unreachable the request is refused. A protected site does
not fall open because a server is down.

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

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_LDAP_URL` | | `ldap://host:389` or `ldaps://host:636` |
| `AUTH_LDAP_BIND_DN` | | Read-only service account; blank searches anonymously |
| `AUTH_LDAP_BIND_PASSWORD` | | |
| `AUTH_LDAP_BASE_DN` | | Where to search from |
| `AUTH_LDAP_USER_FILTER` | <code v-pre>(&#124;(uid={{username}})(mail={{username}}))</code> | <code v-pre>{{username}}</code> is replaced with what was typed |
| `AUTH_LDAP_LOGIN_ATTRIBUTES` | | Comma separated attributes accepted at the login prompt, instead of writing a filter |
| `AUTH_LDAP_EMAIL_ATTRIBUTE` | `mail` | Required; an entry without one cannot sign in |
| `AUTH_LDAP_NAME_ATTRIBUTE` | `cn` | |
| `AUTH_LDAP_NICKNAME_ATTRIBUTE` | `givenName` | |
| `AUTH_LDAP_GROUP_ATTRIBUTE` | `memberOf` | Read from the user entry |
| `AUTH_LDAP_GROUP_BASE_DN` | the base DN | Where to search for groups |
| `AUTH_LDAP_GROUP_FILTER` | | Reverse lookup for directories without `memberOf`; <code v-pre>{{dn}}</code> and <code v-pre>{{username}}</code> are substituted |
| `AUTH_LDAP_GROUP_NAME_ATTRIBUTE` | `dn` | |
| `AUTH_LDAP_START_TLS` | `false` | Upgrade a plain connection with StartTLS |
| `AUTH_LDAP_TLS_REJECT_UNAUTHORIZED` | `true` | Verify the server certificate |
| `AUTH_LDAP_TIMEOUT` | `10000` | Milliseconds |
| `AUTH_LDAP_PAGE_SIZE` | `500` | Entries per page, for directories that cap search results |

Directory sync, described under [Directory sync](#directory-sync):

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_LDAP_SYNC_ENABLED` | `false` | Walk the directory on a schedule |
| `AUTH_LDAP_SYNC_INTERVAL` | `60` | Minutes between runs; five is the minimum |
| `AUTH_LDAP_SYNC_FILTER` | `(objectClass=person)` | Which entries to consider |
| `AUTH_LDAP_SYNC_GROUP` | | Only sync members of this group |
| `AUTH_LDAP_SYNC_DISABLE_MISSING` | `false` | Disable accounts whose entry has gone away |

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
