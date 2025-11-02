import prisma, { nowIso } from "./db";

export function logAuditEvent(params: {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  summary?: string | null;
  data?: unknown;
}) {
  prisma.auditEvent.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      summary: params.summary ?? null,
      data: params.data ? JSON.stringify(params.data) : null,
      createdAt: new Date(nowIso())
    }
  }).catch((error: unknown) => {
    // Log error but don't throw to avoid breaking the main flow
    console.error("Failed to log audit event:", error);
  });
}
