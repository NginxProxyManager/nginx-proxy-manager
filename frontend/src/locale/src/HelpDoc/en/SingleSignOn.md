
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
        If then the same user requests access through an OAuth app that is inside an organization,
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
    </p>
    <details style="margin: 1rem;">
        <summary>Configuring Authentik</summary>
        <p style="margin: 0.5rem 0 1rem 0;">Create a new <em>OAuth2/OpenID Provider</em> in Authentik with <em>Client Type</em> set to <em>Confidential</em>.
        Make sure the <em>Authorization Code</em> is selected from <em>Grant Types</em>. The other grant types
        are not required for this Single Sign On functionality, the best is to turn them off. Creat a new Application too,
        and make sure the new provider is assigned to it.</p>
        <p>In Nginx Proxy Manager, create a new OpenID type SSO Client, and set the <code>Client ID</code>, <code>Client Secret</code> 
        and <code>Configuration Issuer URL</code> field to their respective values form the Authentik provider you just created. 
        The <code>Redirect URL</code> field will be auto-generated, and once the SSO Client is saved, you should copy
        the final URL back to the <em>Redirect URIs/Origins</em> section of the Authentik provider.</p>
        <p>To use group membership based access filtering, make sure each Authenik user is member of the desired groups.
        Authentik will automatically send the groups claim with the logged in user's group memberships.</p>
    </details>
    <details style="margin: 1rem;">
        <summary>Configuring Keycloak</summary>
        <p style="margin: 0.5rem 0 1rem 0;">In the desired realm, go to Clients and select <em>Create Client</em>. Set <em>Client Type</em>
        to <em>OpenID Connect</em>, type a <em>Client ID</em>. On the next page, ensure <em>Client authentication</em> 
        is turned on, and that <em>Standard flow</em> is selected. The other flow types are not required. 
        Ensure <em>Require PKCE</em> is turned on, set <em>PKCE Method</em> to <em>S256</em>.
        On the next page, copy the URL of your Nginx Proxy Manager installation to the <em>Root URL</em> and <em>Home URL</em> 
        fields then save the new client.</p>
        <p>In Nginx Proxy Manager, create a new OpenID type SSO Client, and set the <code>Client ID</code> field
        to the Client ID you selected in Keycloak, go the Credentials tab of the new client in Keycloak, and copy the Client Secret
        to the <code>Client Secret</code> field, and use the Realm URL for the <code>OpenID Configuration Issuer URL</code>, e.g.
        <code>https://your-keycloak.com/realms/your-realm</code>.
        The <code>Redirect URL</code> field will be auto-generated, and once the SSO Client is saved, you should copy
        the final URL back to the <em>Valid redirect URIs</em> section in the Keycloak client configuration.</p>
        <p>To use group membership based access filtering with Keycloak, you have a choice of using 
        Keycloak Groups, Realm Roles or Client Roles for the claims groups but you must decide on one of the three.</p>
        <p>To use Keycloak Groups, first make sure that you have groups and users assigned to said groups
        in the desired realm (<em>Groups</em> and <em>Users</em> in the left navigation menu, respectively).
        Keycloak doesn't use these groups by default in the claims, so first go to <em>Client scopes</em> in the same realm,
        and select <em>Create client scope</em>. Name it <em>Groups</em>, set Type to <em>Default</em> and Protocol
        to <em>OpenID Connect</em>, and save. Go the to Mappers tab, select <em>Configure a new mapper</em>, and select
        the <em>Group Membership</em> mapping from the list. Name it something, and ensure the <em>Token Claim Name</em> is <em>groups</em>.
        If you don't need to use nested groups, turn <em>Full group path</em> off, so you can use the exact group names in Nginx Proxy Manager.
        When <em>Full group path</em> is on, groups will be represented with slashes, (e.g. <code>/My Group/My Inner Group</code>).
        In this case, a single, not nested group is also represented with leading slash, so <code>My Group</code> becomes <code>/My Group</code>.
        Make sure <em>Add to ID token</em> is turned on then save.</p>
        <p>To configure Keycloak to send the Realm Roles as the groups claim, first make sure you have created Realm roles, and assigned users.
        Then, go to <em>Client scopes</em> and select the predefined <em>roles</em> scope. Swtich to the Mappers tab, and select
        the predefined <em>realm roles</em> mapper. Set the <em>Token Claim Name</em> to <em>groups</em>. 
        Ensure <em>Add to ID token</em> is turned on then save. Now, you can use the name of Realm roles for access filtering in the SSO Client settings.
        If you have previously used Keycloak Groups, ensure <em>Add to ID token</em> is turned off in the groups mapper before configuring the roles mapper.
        </p>
        <p>To configure Keycloak to send the Client Roles as the groups claim, you can follow the above for Realm Roles, but update
        the <em>client roles</em> mapper instead of the <em>realm roles</em> one. Ensure only one mapper uses <em>groups</em> for <em>Token Claim Name</em>
        and has <em>Add to ID token</em> turned on at the same time.</p>
    </details>
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
        When <code>Require verified email</code> is turned on then the <code>email_verified=true</code> flag
        is required in the claims to proceed with provisioning or login to internal account. 
        For provisioned users, this is not checked for subsequent logins once
        successfully provisioned, while it's checked before every login for internal user account access.
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
    </p>
</details>

<details style="margin: 0.5rem 0;">
  <summary><h4 style="display: inline-block;">Email address uniqueness</h4></summary>
  <p>To enforce email address uniqueness, provisioning will fail with an error if any user account
  (internal or provisioned) currently uses the email address claimed by the IdP. 
  However, the following is possible:
  </p><p>
  An internal user account can be logged into via SSO with multiple SSO Clients
  when each client allows <code>User access</code>.
  </p><p>
  When a provisioned user also has a password login (as described above), they can
  use <code>User access</code> to login to their account with a different SSO Client
  while also retaining access to the account via the provisioning SSO Client.
  </p>
</details>

<details style="margin: 0.5rem 0;">
  <summary><h4 style="display: inline-block;">Identity Provider user binding</h4></summary>
  <p>
  Although email address uniqueness is enforced for provisioning, this is more of 
  a security / consistency measure than a technical necessity, since provisioned users
  are bound by "Issuer" and "Subject" as claimed by the IdP, and subsequent logins following
  successful provisnioning do not require a matching email address as long as the IdP
  claims the same Issuer and Subject identifier values for a user as their account was 
  provisioined with.
  </p><p>
  This means that a user's email address can be changed on either side (NPM or the IdP)
  for a provisioined account, and the accass will be retained via the respective IdP regardless.
  </p><p>
  For this reason, the email address uniqueness check may be removed or subjected to 
  <code>Require unique email</code> flag in a new version.    
  </p>
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
    are only sent over the network once when the client is created (or when the secret is updated with a new value),
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
