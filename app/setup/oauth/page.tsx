import { redirect } from "next/navigation";
import { getOAuthSettings } from "@/src/lib/settings";
import { getUserCount } from "@/src/lib/models/user";
import { initialOAuthSetupAction } from "./actions";

export default function OAuthSetupPage() {
  if (getUserCount() > 0 && getOAuthSettings()) {
    redirect("/login");
  }

  return (
    <div className="page">
      <div className="panel">
        <h1>Configure OAuth2</h1>
        <p>
          Provide the OAuth configuration for your identity provider to finish setting up Caddy Proxy Manager. The first user who signs in
          becomes the administrator.
        </p>
        <form action={initialOAuthSetupAction} className="form">
          <label>
            Authorization URL
            <input name="authorizationUrl" placeholder="https://id.example.com/oauth2/authorize" required />
          </label>
          <label>
            Token URL
            <input name="tokenUrl" placeholder="https://id.example.com/oauth2/token" required />
          </label>
          <label>
            User info URL
            <input name="userInfoUrl" placeholder="https://id.example.com/oauth2/userinfo" required />
          </label>
          <label>
            Client ID
            <input name="clientId" placeholder="client-id" required />
          </label>
          <label>
            Client secret
            <input name="clientSecret" placeholder="client-secret" required />
          </label>
          <label>
            Scopes
            <input name="scopes" defaultValue="openid email profile" />
          </label>
          <div className="stack">
            <label>
              Email claim
              <input name="emailClaim" defaultValue="email" />
            </label>
            <label>
              Name claim
              <input name="nameClaim" defaultValue="name" />
            </label>
            <label>
              Avatar claim
              <input name="avatarClaim" defaultValue="picture" />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="primary">
              Save OAuth configuration
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at top, rgba(0, 114, 255, 0.2), rgba(3, 8, 18, 0.95));
        }
        .panel {
          width: min(640px, 90vw);
          background: rgba(8, 12, 20, 0.95);
          padding: 2.5rem;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        h1 {
          margin: 0;
        }
        p {
          margin: 0;
          color: rgba(255, 255, 255, 0.7);
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
          background: rgba(3, 8, 18, 0.92);
          color: #fff;
        }
        .stack {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
        }
        .primary {
          padding: 0.75rem 1.6rem;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          color: #fff;
          cursor: pointer;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
