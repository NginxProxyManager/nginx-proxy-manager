import { NextRequest, NextResponse } from "next/server";
import { finalizeOAuthLogin } from "@/src/lib/auth/oauth";
import { createSession } from "@/src/lib/auth/session";
import { config } from "@/src/lib/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=invalid_response", config.baseUrl));
  }

  try {
    const { user, redirectTo } = await finalizeOAuthLogin(code, state);
    createSession(user.id);
    const destination = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/";
    return NextResponse.redirect(new URL(destination, config.baseUrl));
  } catch (error) {
    console.error("OAuth callback failed", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", config.baseUrl));
  }
}
