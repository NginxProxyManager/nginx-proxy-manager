"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth";
import { createProxyHost, deleteProxyHost, updateProxyHost } from "@/src/lib/models/proxy-hosts";

function parseCsv(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") {
    return [];
  }
  return value
    .replace(/\n/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

export async function createProxyHostAction(formData: FormData) {
  const { user } = await requireUser();
  await createProxyHost(
    {
      name: String(formData.get("name") ?? "Untitled"),
      domains: parseCsv(formData.get("domains")),
      upstreams: parseCsv(formData.get("upstreams")),
      certificate_id: formData.get("certificate_id") ? Number(formData.get("certificate_id")) : null,
      access_list_id: formData.get("access_list_id") ? Number(formData.get("access_list_id")) : null,
      ssl_forced: parseCheckbox(formData.get("ssl_forced")),
      hsts_enabled: parseCheckbox(formData.get("hsts_enabled")),
      hsts_subdomains: parseCheckbox(formData.get("hsts_subdomains")),
      allow_websocket: parseCheckbox(formData.get("allow_websocket")),
      preserve_host_header: parseCheckbox(formData.get("preserve_host_header")),
      enabled: parseCheckbox(formData.get("enabled"))
    },
    user.id
  );
  revalidatePath("/proxy-hosts");
}

export async function updateProxyHostAction(id: number, formData: FormData) {
  const { user } = await requireUser();
  const boolField = (key: string) => (formData.has(`${key}_present`) ? parseCheckbox(formData.get(key)) : undefined);
  await updateProxyHost(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      domains: formData.get("domains") ? parseCsv(formData.get("domains")) : undefined,
      upstreams: formData.get("upstreams") ? parseCsv(formData.get("upstreams")) : undefined,
      certificate_id: formData.get("certificate_id") ? Number(formData.get("certificate_id")) : undefined,
      access_list_id: formData.get("access_list_id") ? Number(formData.get("access_list_id")) : undefined,
      ssl_forced: boolField("ssl_forced"),
      hsts_enabled: boolField("hsts_enabled"),
      hsts_subdomains: boolField("hsts_subdomains"),
      allow_websocket: boolField("allow_websocket"),
      preserve_host_header: boolField("preserve_host_header"),
      enabled: boolField("enabled")
    },
    user.id
  );
  revalidatePath("/proxy-hosts");
}

export async function deleteProxyHostAction(id: number) {
  const { user } = await requireUser();
  await deleteProxyHost(id, user.id);
  revalidatePath("/proxy-hosts");
}
