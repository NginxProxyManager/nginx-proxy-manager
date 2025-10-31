"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth/session";
import { createDeadHost, deleteDeadHost, updateDeadHost } from "@/src/lib/models/dead-hosts";

function parseDomains(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") {
    return [];
  }
  return value
    .replace(/\n/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function createDeadHostAction(formData: FormData) {
  const { user } = requireUser();
  await createDeadHost(
    {
      name: String(formData.get("name") ?? "Dead host"),
      domains: parseDomains(formData.get("domains")),
      status_code: formData.get("status_code") ? Number(formData.get("status_code")) : 503,
      response_body: formData.get("response_body") ? String(formData.get("response_body")) : null,
      enabled: formData.has("enabled") ? formData.get("enabled") === "on" : true
    },
    user.id
  );
  revalidatePath("/dead-hosts");
}

export async function updateDeadHostAction(id: number, formData: FormData) {
  const { user } = requireUser();
  await updateDeadHost(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      domains: formData.get("domains") ? parseDomains(formData.get("domains")) : undefined,
      status_code: formData.get("status_code") ? Number(formData.get("status_code")) : undefined,
      response_body: formData.get("response_body") ? String(formData.get("response_body")) : undefined,
      enabled: formData.has("enabled_present") ? formData.get("enabled") === "on" : undefined
    },
    user.id
  );
  revalidatePath("/dead-hosts");
}

export async function deleteDeadHostAction(id: number) {
  const { user } = requireUser();
  await deleteDeadHost(id, user.id);
  revalidatePath("/dead-hosts");
}
