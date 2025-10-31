import type { ReactNode } from "react";
import { requireUser } from "@/src/lib/auth/session";
import DashboardLayoutClient from "./DashboardLayoutClient";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  return <DashboardLayoutClient user={user}>{children}</DashboardLayoutClient>;
}
