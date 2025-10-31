import { getCloudflareSettings, getGeneralSettings, getOAuthSettings } from "@/src/lib/settings";
import { updateCloudflareSettingsAction, updateGeneralSettingsAction, updateOAuthSettingsAction } from "./actions";

export default function SettingsPage() {
  const general = getGeneralSettings();
  const oauth = getOAuthSettings();
  const cloudflare = getCloudflareSettings();

  return (
    <div className="page">
      <header>
        <h1>Settings</h1>
        <p>Configure organization-wide defaults, authentication, and DNS automation.</p>
      </header>

      <section className="panel">
        <h2>General</h2>
        <form action={updateGeneralSettingsAction} className="form">
          <label>
            Primary domain
            <input name="primaryDomain" defaultValue={general?.primaryDomain ?? "caddyproxymanager.com"} required />
          </label>
          <label>
            ACME contact email
            <input type="email" name="acmeEmail" defaultValue={general?.acmeEmail ?? ""} placeholder="admin@example.com" />
          </label>
          <div className="actions">
            <button type="submit" className="primary">
              Save general settings
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>OAuth2 Authentication</h2>
        <p className="help">
          Provide the OAuth 2.0 endpoints and client credentials issued by your identity provider. Scopes should include profile and email
          data.
        </p>
        <form action={updateOAuthSettingsAction} className="form">
          <label>
            Authorization URL
            <input name="authorizationUrl" defaultValue={oauth?.authorizationUrl ?? ""} required />
          </label>
          <label>
            Token URL
            <input name="tokenUrl" defaultValue={oauth?.tokenUrl ?? ""} required />
          </label>
          <label>
            User info URL
            <input name="userInfoUrl" defaultValue={oauth?.userInfoUrl ?? ""} required />
          </label>
          <label>
            Client ID
            <input name="clientId" defaultValue={oauth?.clientId ?? ""} required />
          </label>
          <label>
            Client secret
            <input name="clientSecret" defaultValue={oauth?.clientSecret ?? ""} required />
          </label>
          <label>
            Scopes
            <input name="scopes" defaultValue={oauth?.scopes ?? "openid email profile"} />
          </label>
          <div className="stack">
            <label>
              Email claim
              <input name="emailClaim" defaultValue={oauth?.emailClaim ?? "email"} />
            </label>
            <label>
              Name claim
              <input name="nameClaim" defaultValue={oauth?.nameClaim ?? "name"} />
            </label>
            <label>
              Avatar claim
              <input name="avatarClaim" defaultValue={oauth?.avatarClaim ?? "picture"} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="primary">
              Save OAuth settings
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Cloudflare DNS</h2>
        <p className="help">
          Configure a Cloudflare API token with <code>Zone.DNS Edit</code> permissions to enable DNS-01 challenges for wildcard certificates.
        </p>
        <form action={updateCloudflareSettingsAction} className="form">
          <label>
            API token
            <input name="apiToken" defaultValue={cloudflare?.apiToken ?? ""} placeholder="CF_API_TOKEN" />
          </label>
          <label>
            Zone ID
            <input name="zoneId" defaultValue={cloudflare?.zoneId ?? ""} />
          </label>
          <label>
            Account ID
            <input name="accountId" defaultValue={cloudflare?.accountId ?? ""} />
          </label>
          <div className="actions">
            <button type="submit" className="primary">
              Save Cloudflare settings
            </button>
          </div>
        </form>
      </section>

      <style jsx>{`
        .page {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
        }
        header p {
          color: rgba(255, 255, 255, 0.6);
        }
        .panel {
          background: rgba(16, 24, 38, 0.95);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        input {
          padding: 0.65rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(8, 12, 20, 0.9);
          color: #fff;
        }
        .stack {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
        }
        .primary {
          padding: 0.6rem 1.4rem;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          color: #fff;
          cursor: pointer;
        }
        .help {
          margin: 0;
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.9rem;
        }
        code {
          background: rgba(255, 255, 255, 0.1);
          padding: 0.1rem 0.35rem;
          border-radius: 6px;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
