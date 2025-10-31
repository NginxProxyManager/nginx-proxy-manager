import { ReactNode } from "react";
import { requireUser } from "@/src/lib/auth/session";
import { NavLinks } from "./nav-links";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = requireUser();

  return (
    <div className="layout">
      <aside>
        <div className="brand">
          <h2>Caddy Proxy Manager</h2>
          <span className="user">{user.name ?? user.email}</span>
        </div>
        <NavLinks />
        <form action="/api/auth/logout" method="POST" className="logout">
          <button type="submit">Sign out</button>
        </form>
      </aside>
      <main>{children}</main>
      <style jsx>{`
        .layout {
          display: grid;
          grid-template-columns: 260px 1fr;
          min-height: 100vh;
        }
        aside {
          padding: 2rem 1.75rem;
          background: linear-gradient(180deg, #101523 0%, #080b14 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .brand h2 {
          margin: 0;
          font-size: 1.1rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .user {
          display: block;
          margin-top: 0.5rem;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.85rem;
        }
        .logout button {
          width: 100%;
          padding: 0.75rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.75);
          border: none;
          cursor: pointer;
        }
        main {
          padding: 2.5rem 3rem;
          background: radial-gradient(circle at top left, rgba(0, 114, 255, 0.15), transparent 55%);
        }
      `}</style>
    </div>
  );
}
