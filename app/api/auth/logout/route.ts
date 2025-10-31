import { signOut } from "@/src/lib/auth";

export async function POST() {
  await signOut({ redirectTo: "/login" });
}
