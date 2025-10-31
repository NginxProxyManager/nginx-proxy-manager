import { NextResponse } from "next/server";
import { destroySession } from "@/src/lib/auth/session";
import { config } from "@/src/lib/config";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/login", config.baseUrl));
}
