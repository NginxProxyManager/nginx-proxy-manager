import Link from "next/link";
import db from "@/src/lib/db";
import { requireUser } from "@/src/lib/auth/session";

type StatCard = {
  label: string;
  icon: string;
  count: number;
  href: string;
};

function loadStats(): StatCard[] {
  const metrics = [
    {
      label: "Proxy Hosts",
      table: "proxy_hosts",
      href: "/proxy-hosts",
      icon: "⇄"
    },
    {
      label: "Redirects",
      table: "redirect_hosts",
      href: "/redirects",
      icon: "↪"
    },
    {
      label: "Dead Hosts",
      table: "dead_hosts",
      href: "/dead-hosts",
      icon: "☠"
    },
    {
      label: "Streams",
      table: "stream_hosts",
      href: "/streams",
      icon: "≋"
    },
    {
      label: "Certificates",
      table: "certificates",
      href: "/certificates",
      icon: "🔐"
    },
    {
      label: "Access Lists",
      table: "access_lists",
      href: "/access-lists",
      icon: "🔒"
    }
  ] as const;

  return metrics.map((metric) => {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${metric.table}`).get() as { count: number };
    return {
      label: metric.label,
      icon: metric.icon,
      count: Number(row.count),
      href: metric.href
    };
  });
}

export default function OverviewPage() {
  const { user } = requireUser();
  const stats = loadStats();

  const recentEvents = db
    .prepare(
      `SELECT action, entity_type, summary, created_at
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT 8`
    )
    .all() as { action: string; entity_type: string; summary: string | null; created_at: string }[];

  return (
    <div className="overview">
      <header>
        <h1>Welcome back, {user.name ?? user.email}</h1>
        <p>Manage your Caddy reverse proxies, TLS certificates, and services with confidence.</p>
      </header>
      <section className="stats">
        {stats.map((stat) => (
          <Link className="card" href={stat.href} key={stat.label}>
            <span className="icon">{stat.icon}</span>
            <span className="value">{stat.count}</span>
            <span className="label">{stat.label}</span>
          </Link>
        ))}
      </section>
      <section className="events">
        <h2>Recent Activity</h2>
        {recentEvents.length === 0 ? (
          <p className="empty">No activity recorded yet.</p>
        ) : (
          <ul>
            {recentEvents.map((event, index) => (
              <li key={index}>
                <span className="summary">{event.summary ?? `${event.action} on ${event.entity_type}`}</span>
                <span className="time">{new Date(event.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <style jsx>{`
        .overview {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
        }
        header h1 {
          margin: 0;
          font-size: 2rem;
        }
        header p {
          margin: 0.75rem 0 0;
          color: rgba(255, 255, 255, 0.65);
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1.5rem;
        }
        .card {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 1.5rem;
          border-radius: 16px;
          background: rgba(16, 26, 45, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .card:hover {
          transform: translateY(-4px);
          border-color: rgba(0, 198, 255, 0.45);
        }
        .icon {
          font-size: 1.35rem;
          opacity: 0.65;
        }
        .value {
          font-size: 2.1rem;
          font-weight: 600;
        }
        .label {
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.95rem;
        }
        .events h2 {
          margin: 0 0 1rem;
        }
        .events ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .events li {
          display: flex;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          background: rgba(16, 26, 45, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .summary {
          font-weight: 500;
        }
        .time {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
        }
        .empty {
          color: rgba(255, 255, 255, 0.55);
        }
      `}</style>
    </div>
  );
}
