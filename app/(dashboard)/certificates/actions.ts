"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth";
import { createCertificate, deleteCertificate, updateCertificate } from "@/src/lib/models/certificates";

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

export async function createCertificateAction(formData: FormData) {
  const session = await requireUser();
  const user = session.user;
  const userId = Number(user.id);
  const type = String(formData.get("type") ?? "managed") as "managed" | "imported";
  await createCertificate(
    {
      name: String(formData.get("name") ?? "Certificate"),
      type,
      domain_names: parseDomains(formData.get("domain_names")),
      auto_renew: type === "managed" ? formData.get("auto_renew") === "on" : false,
      certificate_pem: type === "imported" ? String(formData.get("certificate_pem") ?? "") : null,
      private_key_pem: type === "imported" ? String(formData.get("private_key_pem") ?? "") : null
    },
    userId
  );
  revalidatePath("/certificates");
}

export async function updateCertificateAction(id: number, formData: FormData) {
  const session = await requireUser();
  const user = session.user;
  const userId = Number(user.id);
  const type = formData.get("type") ? (String(formData.get("type")) as "managed" | "imported") : undefined;
  await updateCertificate(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      type,
      domain_names: formData.get("domain_names") ? parseDomains(formData.get("domain_names")) : undefined,
      auto_renew: formData.has("auto_renew_present") ? formData.get("auto_renew") === "on" : undefined,
      certificate_pem: formData.get("certificate_pem") ? String(formData.get("certificate_pem")) : undefined,
      private_key_pem: formData.get("private_key_pem") ? String(formData.get("private_key_pem")) : undefined
    },
    userId
  );
  revalidatePath("/certificates");
}

export async function deleteCertificateAction(id: number) {
  const session = await requireUser();
  const user = session.user;
  const userId = Number(user.id);
  await deleteCertificate(id, userId);
  revalidatePath("/certificates");
}
