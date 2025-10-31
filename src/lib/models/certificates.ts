import db, { nowIso } from "../db";
import { logAuditEvent } from "../audit";
import { applyCaddyConfig } from "../caddy";

export type CertificateType = "managed" | "imported";

export type Certificate = {
  id: number;
  name: string;
  type: CertificateType;
  domain_names: string[];
  auto_renew: boolean;
  provider_options: Record<string, unknown> | null;
  certificate_pem: string | null;
  private_key_pem: string | null;
  created_at: string;
  updated_at: string;
};

export type CertificateInput = {
  name: string;
  type: CertificateType;
  domain_names: string[];
  auto_renew?: boolean;
  provider_options?: Record<string, unknown> | null;
  certificate_pem?: string | null;
  private_key_pem?: string | null;
};

function parseCertificate(row: any): Certificate {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    domain_names: JSON.parse(row.domain_names),
    auto_renew: Boolean(row.auto_renew),
    provider_options: row.provider_options ? JSON.parse(row.provider_options) : null,
    certificate_pem: row.certificate_pem,
    private_key_pem: row.private_key_pem,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listCertificates(): Certificate[] {
  const rows = db
    .prepare(
      `SELECT id, name, type, domain_names, auto_renew, provider_options, certificate_pem, private_key_pem,
              created_at, updated_at
       FROM certificates ORDER BY created_at DESC`
    )
    .all();
  return rows.map(parseCertificate);
}

export function getCertificate(id: number): Certificate | null {
  const row = db
    .prepare(
      `SELECT id, name, type, domain_names, auto_renew, provider_options, certificate_pem, private_key_pem,
              created_at, updated_at
       FROM certificates WHERE id = ?`
    )
    .get(id);
  return row ? parseCertificate(row) : null;
}

function validateCertificateInput(input: CertificateInput) {
  if (!input.domain_names || input.domain_names.length === 0) {
    throw new Error("At least one domain is required for a certificate");
  }
  if (input.type === "imported") {
    if (!input.certificate_pem || !input.private_key_pem) {
      throw new Error("Imported certificates require certificate and key PEM data");
    }
  }
}

export async function createCertificate(input: CertificateInput, actorUserId: number) {
  validateCertificateInput(input);
  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO certificates (name, type, domain_names, auto_renew, provider_options, certificate_pem, private_key_pem,
       created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name.trim(),
      input.type,
      JSON.stringify(Array.from(new Set(input.domain_names.map((domain) => domain.trim().toLowerCase())))),
      (input.auto_renew ?? true) ? 1 : 0,
      input.provider_options ? JSON.stringify(input.provider_options) : null,
      input.certificate_pem ?? null,
      input.private_key_pem ?? null,
      now,
      now,
      actorUserId
    );
  const id = Number(result.lastInsertRowid);
  logAuditEvent({
    userId: actorUserId,
    action: "create",
    entityType: "certificate",
    entityId: id,
    summary: `Created certificate ${input.name}`
  });
  await applyCaddyConfig();
  return getCertificate(id)!;
}

export async function updateCertificate(id: number, input: Partial<CertificateInput>, actorUserId: number) {
  const existing = getCertificate(id);
  if (!existing) {
    throw new Error("Certificate not found");
  }

  const merged: CertificateInput = {
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    domain_names: input.domain_names ?? existing.domain_names,
    auto_renew: input.auto_renew ?? existing.auto_renew,
    provider_options: input.provider_options ?? existing.provider_options,
    certificate_pem: input.certificate_pem ?? existing.certificate_pem,
    private_key_pem: input.private_key_pem ?? existing.private_key_pem
  };

  validateCertificateInput(merged);

  const now = nowIso();
  db.prepare(
    `UPDATE certificates
     SET name = ?, type = ?, domain_names = ?, auto_renew = ?, provider_options = ?, certificate_pem = ?, private_key_pem = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    merged.name.trim(),
    merged.type,
    JSON.stringify(Array.from(new Set(merged.domain_names))),
    merged.auto_renew ? 1 : 0,
    merged.provider_options ? JSON.stringify(merged.provider_options) : null,
    merged.certificate_pem ?? null,
    merged.private_key_pem ?? null,
    now,
    id
  );

  logAuditEvent({
    userId: actorUserId,
    action: "update",
    entityType: "certificate",
    entityId: id,
    summary: `Updated certificate ${merged.name}`
  });
  await applyCaddyConfig();
  return getCertificate(id)!;
}

export async function deleteCertificate(id: number, actorUserId: number) {
  const existing = getCertificate(id);
  if (!existing) {
    throw new Error("Certificate not found");
  }

  db.prepare("DELETE FROM certificates WHERE id = ?").run(id);
  logAuditEvent({
    userId: actorUserId,
    action: "delete",
    entityType: "certificate",
    entityId: id,
    summary: `Deleted certificate ${existing.name}`
  });
  await applyCaddyConfig();
}
