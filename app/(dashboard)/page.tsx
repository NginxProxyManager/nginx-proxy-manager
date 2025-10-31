import db from "@/src/lib/db";
import { requireUser } from "@/src/lib/auth/session";
import OverviewClient from "./OverviewClient";

type StatCard = {
  label: string;
  icon: string;
  count: number;
  href: string;
};

function loadStats(): StatCard[] {
  const metrics = [
    { label: "Proxy Hosts", table: "proxy_hosts", href: "/proxy-hosts", icon: "⇄" },
    { label: "Redirects", table: "redirect_hosts", href: "/redirects", icon: "↪" },
    { label: "Dead Hosts", table: "dead_hosts", href: "/dead-hosts", icon: "☠" },
    { label: "Streams", table: "stream_hosts", href: "/streams", icon: "≋" },
    { label: "Certificates", table: "certificates", href: "/certificates", icon: "🔐" },
    { label: "Access Lists", table: "access_lists", href: "/access-lists", icon: "🔒" }
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

export default async function OverviewPage() {
  const { user } = await requireUser();
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
    <OverviewClient
      userName={user.name ?? user.email}
      stats={stats}
      recentEvents={recentEvents.map((event) => ({
        summary: event.summary ?? `${event.action} on ${event.entity_type}`,
        created_at: event.created_at
      }))}
    />
  );
}
