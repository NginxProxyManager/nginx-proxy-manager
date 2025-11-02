import prisma from "@/src/lib/db";
import { requireUser } from "@/src/lib/auth";
import OverviewClient from "./OverviewClient";

type StatCard = {
  label: string;
  icon: string;
  count: number;
  href: string;
};

async function loadStats(): Promise<StatCard[]> {
  const [proxyHostsCount, redirectHostsCount, deadHostsCount, certificatesCount, accessListsCount] =
    await Promise.all([
      prisma.proxyHost.count(),
      prisma.redirectHost.count(),
      prisma.deadHost.count(),
      prisma.certificate.count(),
      prisma.accessList.count()
    ]);

  return [
    { label: "Proxy Hosts", icon: "⇄", count: proxyHostsCount, href: "/proxy-hosts" },
    { label: "Redirects", icon: "↪", count: redirectHostsCount, href: "/redirects" },
    { label: "Dead Hosts", icon: "☠", count: deadHostsCount, href: "/dead-hosts" },
    { label: "Certificates", icon: "🔐", count: certificatesCount, href: "/certificates" },
    { label: "Access Lists", icon: "🔒", count: accessListsCount, href: "/access-lists" }
  ];
}

export default async function OverviewPage() {
  const session = await requireUser();
  const stats = await loadStats();
  const recentEvents = await prisma.auditEvent.findMany({
    select: {
      action: true,
      entityType: true,
      summary: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" },
    take: 8
  });

  return (
    <OverviewClient
      userName={session.user.name ?? session.user.email ?? "Admin"}
      stats={stats}
      recentEvents={recentEvents.map((event: { action: string; entityType: string; summary: string | null; createdAt: Date }) => ({
        summary: event.summary ?? `${event.action} on ${event.entityType}`,
        created_at: event.createdAt.toISOString()
      }))}
    />
  );
}
