"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth";
import { createStreamHost, deleteStreamHost, updateStreamHost } from "@/src/lib/models/stream-hosts";

export async function createStreamAction(formData: FormData) {
  const { user } = await requireUser();
  await createStreamHost(
    {
      name: String(formData.get("name") ?? "Stream"),
      listen_port: Number(formData.get("listen_port")),
      protocol: String(formData.get("protocol") ?? "tcp"),
      upstream: String(formData.get("upstream") ?? ""),
      enabled: formData.has("enabled") ? formData.get("enabled") === "on" : true
    },
    user.id
  );
  revalidatePath("/streams");
}

export async function updateStreamAction(id: number, formData: FormData) {
  const { user } = await requireUser();
  await updateStreamHost(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      listen_port: formData.get("listen_port") ? Number(formData.get("listen_port")) : undefined,
      protocol: formData.get("protocol") ? String(formData.get("protocol")) : undefined,
      upstream: formData.get("upstream") ? String(formData.get("upstream")) : undefined,
      enabled: formData.has("enabled_present") ? formData.get("enabled") === "on" : undefined
    },
    user.id
  );
  revalidatePath("/streams");
}

export async function deleteStreamAction(id: number) {
  const { user } = await requireUser();
  await deleteStreamHost(id, user.id);
  revalidatePath("/streams");
}
