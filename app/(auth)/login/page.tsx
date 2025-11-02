import { redirect } from "next/navigation";
import { auth } from "@/src/lib/auth";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/");
  }

  return <LoginClient />;
}
