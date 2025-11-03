"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/src/lib/auth";
import { createRedirectHost, deleteRedirectHost, updateRedirectHost } from "@/src/lib/models/redirect-hosts";
import { actionSuccess, actionError, type ActionState } from "@/src/lib/actions";

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

export async function createRedirectAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    await createRedirectHost(
      {
        name: String(formData.get("name") ?? "Redirect"),
        domains: parseList(formData.get("domains")),
        destination: String(formData.get("destination") ?? ""),
        status_code: formData.get("status_code") ? Number(formData.get("status_code")) : 302,
        preserve_query: formData.get("preserve_query") === "on",
        enabled: formData.has("enabled") ? formData.get("enabled") === "on" : true
      },
      userId
    );
    revalidatePath("/redirects");
    return actionSuccess("Redirect created successfully");
  } catch (error) {
    return actionError(error, "Failed to create redirect");
  }
}

export async function updateRedirectAction(id: number, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
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
      userId
    );
    revalidatePath("/redirects");
    return actionSuccess("Redirect updated successfully");
  } catch (error) {
    return actionError(error, "Failed to update redirect");
  }
}

export async function deleteRedirectAction(id: number, _prevState: ActionState): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    await deleteRedirectHost(id, userId);
    revalidatePath("/redirects");
    return actionSuccess("Redirect deleted successfully");
  } catch (error) {
    return actionError(error, "Failed to delete redirect");
  }
}
