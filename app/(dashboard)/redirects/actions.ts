"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth";
import { createRedirectHost, deleteRedirectHost, updateRedirectHost } from "@/src/lib/models/redirect-hosts";

function parseList(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") {
    return [];
  }
  return value
    .replace(/\n/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function createRedirectAction(formData: FormData) {
  const { user } = await requireUser();
  await createRedirectHost(
    {
      name: String(formData.get("name") ?? "Redirect"),
      domains: parseList(formData.get("domains")),
      destination: String(formData.get("destination") ?? ""),
      status_code: formData.get("status_code") ? Number(formData.get("status_code")) : 302,
      preserve_query: formData.get("preserve_query") === "on",
      enabled: formData.has("enabled") ? formData.get("enabled") === "on" : true
    },
    user.id
  );
  revalidatePath("/redirects");
}

export async function updateRedirectAction(id: number, formData: FormData) {
  const { user } = await requireUser();
  await updateRedirectHost(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      domains: formData.get("domains") ? parseList(formData.get("domains")) : undefined,
      destination: formData.get("destination") ? String(formData.get("destination")) : undefined,
      status_code: formData.get("status_code") ? Number(formData.get("status_code")) : undefined,
      preserve_query: formData.has("preserve_query_present") ? formData.get("preserve_query") === "on" : undefined,
      enabled: formData.has("enabled_present") ? formData.get("enabled") === "on" : undefined
    },
    user.id
  );
  revalidatePath("/redirects");
}

export async function deleteRedirectAction(id: number) {
  const { user } = await requireUser();
  await deleteRedirectHost(id, user.id);
  revalidatePath("/redirects");
}
