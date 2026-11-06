
## Single Sign On Help

<div style="margin: 1rem 0;"></div>

### Identity Provider confguration

<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">Auth0</h4></summary>
    You can configure NginX Proxy Manager to log in with Auth0. 
    Create a First-party Regular Webb Application (or use the Default App), 
    and copy the <code>Client ID</code>, <code>Client Secret</code> and <code>Domain</code> 
    into their respective fields in a new Auth0 type SSO Client form, save the form
    then copy the final Redirect URL back to the <code>Allowed Callback URLs</code> 
    in the app settings in Auth0.
</details>

<details style="margin: 0.5rem 0;">
  <summary><h4 style="display: inline-block;">GitHub</h4></summary>
    <p>
    To allow users to log in with their GitHub account, create an OAuth App in GitHub,
    and copy the <code>Client ID</code> and <code>Client Secret</code> to the new SSO Client form. 
    Save, and copy back the final redirect URL to the GitHub App settings under the <code>Redirect URIs</code> section.
    </p><p>
    Since in this case <big><strong>GitHub is the IdP with all its users, it's imperative to restrict access<strong></big>.
    </p><p>
    GitHub doesn't use groups, so the user's GitHub organizations are considered group memberships.
    </p><p>
    Therefore, it is crucial that a GitHub type client is either restricted to internal users (<code>User access</code>),
    or, if you want to allow provisioning, the OAuth App must be created within a GitHub Organization,
    and the organization name must be specified for <code>Require group membership</code>. Of course, you can
    also require group membership for internal user access too.
    </p><p>
    Why does the OAuth App need to be in an organization?
    <details>
        <p>
        For some reason, GitHub works with OAuth apps in this entirely unintuitive way. 
        When a user requests access through an OAuth app that is NOT inside an organization then 
        the user's GitHub organization memberships comes down as an empty list even if they have some,
        so this way group membership based filtering or role assignment is not possible.
        </p><p>
        If then a the same user requests access through an OAuth app that is inside an organization,
        and the user is member of that organization then the memberships list contains this organization.
        So, this way you can control who can login to Nginx Proxy Manager via GitHub by organization
        membership.
        </p>
        <p>
        The organization name to use as group name is case sensitive, and it should be used exactly
        as it appears in the URL. For example <code>My Org</code> becomes <code>My-Org</code> 
        and <code>F@st & Furious</code> becomes <code>F-st---Furious</code>.</p>
    </details>
    </p><p>
    When a new user account is provisioned for a GitHub user, their primary email address is used
    to check for existing users, and to create the account.
    </p>
</details>

<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">OpenID</h4></summary>
    <p>
    The <code>OpenID</code> as a generic type allows you to configure SSO with an IdP that supports OpenID Connect
    such as the open source Authentik and Keycloak that can be self-hosted, or with some <a href="https://en.wikipedia.org/wiki/List_of_OAuth_providers">online providers</a>.
    </p><p>
    To configure an SSO Client, create a Confidential OpenID client application
    at the IdP, then create a new OpenID type SSO Client with the <code>Client ID</code>, <code>Client Secret</code> 
    and <code>Configuration Issuer URL</code> copied over from the IdP. 
    The <code>Redirect URL</code> field will be auto-generated, and once the SSO Client is saved, you should copy
    the final URL back to the IdP's allowed redirect URLs or allowed callback URLs section.
    </p>
</details>

<hr style="margin: 0.5rem 0 1rem 0;" />

### Client configuration

<small>These settings apply to all SSO Client types.</small>

<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">User provisioning</h4></summary>
    <p>
    When <code>Provision new users</code> is enabled and <code>Require group membership</code> is disabled
    then _new_ users are automatically provisioned in the "user" role only if an internal user
    with matching email address doesn't already exist even if that existing user is disabled.
    </p>
    <p>
    When <code>Require group membership</code> is enabled and a group name is specified but no group-to-role mapping exists
    then the user's groups claim must include the specified group to allow automatic provisioning.
    </p>
    <p>
    When <code>Require group membership</code> is enabled and a group name is not specified then group-to-role mapping(s) must exist.
    In this case, the user's groups claim must include (one of) the specified mapped group(s), and they will be provisioned
    in the role mapped to the matching group. If a user matches multiple groups, the higher role (i.e. "admin") takes precedence.
    </p>
    <p>
    When <code>Require group membership</code> is enabled and both a group name is specified and group-to-role mapping(s) exist
    then the user's groups claim must include the specified group and (one of) the specified mapped groups 
    to allow provisioning.
    </p>
</details>


<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">User access</h4></summary>
    <p>
    When a (not auto-provisioned) internal user acount exists with an email address claimed by the IdP
    then the user can login to that account if <code>Existing users</code> is enabled, unless <code>Only if admin</code>
    is also enabled in which case only Administrators are allowed to login to their internal account via the respective IdP.
    </p>
    <p>
    if <code>Require group membership</code> is enabled then login is only allowed if the user's groups claim 
    includes the specified group.
    </p>
</details>


<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">Settings</h4></summary>
    <p>
        When `Require verified email` is turnbed on, 
    </p>
</details>

<hr style="margin: 0.5rem 0 1rem 0;" />

### Security considerations

<details style="margin: 0.5rem 0;">
  <summary><h4 style="display: inline-block;">Access for internal and provisioned users</h4></summary>
    <p>
    For the purposes of this document, and in the context of Single Sign On an <em>Internal user</em>
    is a user account that was NOT created by automatic user provisioning. Provisioned accounts
    are distinguished in the following significant ways.
    </p>
    An automatically provisioned user account initially doesn't have a password login, so they cannot login
    using the password login mechanism nor can they update their password, but it is possible
    for an Administrator to set a password for provisioined users. 
    Following this, the given user has two separate login paths.
    <p>
    </p>
    <p>
    Once a user account has been provisioned, they can continue to access their account via the respective IdP
    regardless of the settings related to internal users (<code>User access</code> tab), and regardless
    of the <code>Provision new users</code> setting until their account is disabled or deleted,
    or the SSO Client associated with the provision is disabled or deleted.
    </p>
    <p>
    Internal users cannot continue to access their account via an IdP when <code>User access</code> is disabled, 
    but their password login remains unaffected at all times regardless of Single Sign On.
    <p>
</details>


<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">2fa</h4></summary>
    <p>
    TOTP verification (2fa) is always ignored / skipped when logging in via SSO because it's assumed that
    the user's preferred security policy is applied at the IdP, i.e. they authenticate themselves
    with the IdP via multi-factor, security key, WebAuthn, etc. 
    </p>
    <p>
    It is possible, as described above, for an automatically provisioned user to also have a password login
    and along with that they can configure 2fa. In this case, the 2fa is required when they use password login, 
    and ignored when they use SSO.
    </p>
    <p>
    This also applies to existing internal users, so if they are allowed to login to their account 
    (<code>Existing users</code> enabled) then TOTP is skipped even if configured wehen they use SSO to login.
    </p>
</details>

<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">Data protection</h4></summary>
    <p>
    Sensitive information stored in the database such as the Client Secret 
    are only sent over the network once when the client is created (or when updated with a new value),
    and encrypted with an industry standard encryption algorithm (RSA-SHA256) using the application
    secret key.
    </p>
    <p>
    The application secret key is automatically generated by Nginx Proxy Manager for every installation.
    </p>
</details>


<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">Audit trail</h4></summary>
    <p>
    Manipulation of SSO Clients and user provisioning events are recorded in the Audit log.
    New user accounts are provisioned and recorded in the audit log on behalf
    of the Administrator who owns the SSO Client.
    </p>
</details>


<details style="margin: 0.5rem 0;">
    <summary><h4 style="display: inline-block;">SSO Client administration</h4></summary>
    <p>
    Only Administrators are allowed to view, create, modify or delete SSO Clients.
    </p>
</details>
