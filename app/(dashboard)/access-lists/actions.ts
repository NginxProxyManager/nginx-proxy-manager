"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/src/lib/auth";
import {
  addAccessListEntry,
  createAccessList,
  deleteAccessList,
  removeAccessListEntry,
  updateAccessList
} from "@/src/lib/models/access-lists";

export async function createAccessListAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = Number(session.user.id);
  const rawUsers = String(formData.get("users") ?? "");
  const accounts = rawUsers
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [username, password] = line.split(":");
      return { username: username.trim(), password: (password ?? "").trim() };
    })
    .filter((item) => item.username && item.password);

  await createAccessList(
    {
      name: String(formData.get("name") ?? "Access list"),
      description: formData.get("description") ? String(formData.get("description")) : null,
      users: accounts
    },
    userId
  );
  revalidatePath("/access-lists");
}

export async function updateAccessListAction(id: number, formData: FormData) {
  const session = await requireAdmin();
  const userId = Number(session.user.id);
  await updateAccessList(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      description: formData.get("description") ? String(formData.get("description")) : undefined
    },
    userId
  );
  revalidatePath("/access-lists");
}

export async function deleteAccessListAction(id: number) {
  const session = await requireAdmin();
  const userId = Number(session.user.id);
  await deleteAccessList(id, userId);
  revalidatePath("/access-lists");
}

export async function addAccessEntryAction(id: number, formData: FormData) {
  const session = await requireAdmin();
  const userId = Number(session.user.id);
  await addAccessListEntry(
    id,
    {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? "")
    },
    userId
  );
  revalidatePath("/access-lists");
}

export async function deleteAccessEntryAction(accessListId: number, entryId: number) {
  const session = await requireAdmin();
  const userId = Number(session.user.id);
  await removeAccessListEntry(accessListId, entryId, userId);
  revalidatePath("/access-lists");
}
