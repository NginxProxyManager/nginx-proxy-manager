"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/src/lib/auth/session";
import {
  addAccessListEntry,
  createAccessList,
  deleteAccessList,
  removeAccessListEntry,
  updateAccessList
} from "@/src/lib/models/access-lists";

export async function createAccessListAction(formData: FormData) {
  const { user } = requireUser();
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
    user.id
  );
  revalidatePath("/access-lists");
}

export async function updateAccessListAction(id: number, formData: FormData) {
  const { user } = requireUser();
  await updateAccessList(
    id,
    {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      description: formData.get("description") ? String(formData.get("description")) : undefined
    },
    user.id
  );
  revalidatePath("/access-lists");
}

export async function deleteAccessListAction(id: number) {
  const { user } = requireUser();
  await deleteAccessList(id, user.id);
  revalidatePath("/access-lists");
}

export async function addAccessEntryAction(id: number, formData: FormData) {
  const { user } = requireUser();
  await addAccessListEntry(
    id,
    {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? "")
    },
    user.id
  );
  revalidatePath("/access-lists");
}

export async function deleteAccessEntryAction(accessListId: number, entryId: number) {
  const { user } = requireUser();
  await removeAccessListEntry(accessListId, entryId, user.id);
  revalidatePath("/access-lists");
}
