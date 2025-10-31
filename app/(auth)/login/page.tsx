import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth/session";
import { buildAuthorizationUrl } from "@/src/lib/auth/oauth";
import { getOAuthSettings } from "@/src/lib/settings";

export default async function LoginPage() {
  const session = getSession();
  if (session) {
    redirect("/");
  }

  const oauthConfigured = Boolean(getOAuthSettings());

  async function startOAuth() {
    "use server";
    const target = buildAuthorizationUrl("/");
    redirect(target);
  }

  return (
    <div className="auth-wrapper">
      <h1>Caddy Proxy Manager</h1>
      <p>Sign in with your organization&apos;s OAuth2 provider to continue.</p>
      {oauthConfigured ? (
        <form action={startOAuth}>
          <button type="submit" className="primary">
            Sign in with OAuth2
          </button>
        </form>
      ) : (
        <div className="notice">
          <p>
            The system administrator needs to configure OAuth2 settings before logins are allowed. If this is a fresh installation, start
            with the{" "}
            <a href="/setup/oauth">
              OAuth setup wizard
            </a>
            .
          </p>
        </div>
      )}
      <style jsx>{`
        .auth-wrapper {
          max-width: 420px;
          margin: 20vh auto;
          padding: 3rem;
          background: rgba(10, 17, 28, 0.92);
          border-radius: 16px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
          text-align: center;
        }
        h1 {
          margin: 0 0 1rem;
        }
        p {
          margin: 0 0 1.5rem;
          color: rgba(255, 255, 255, 0.75);
        }
        .primary {
          padding: 0.75rem 1.5rem;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
        .primary:hover {
          opacity: 0.9;
        }
        .notice {
          margin-top: 1.5rem;
          padding: 1rem;
          border-radius: 12px;
          background: rgba(255, 193, 7, 0.12);
          color: #ffc107;
          font-weight: 500;
        }
        .notice a {
          color: #fff;
        }
      `}</style>
    </div>
  );
}
