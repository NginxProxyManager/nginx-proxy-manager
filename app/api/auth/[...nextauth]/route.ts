import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handlers } from "@/src/lib/auth";
import { isRateLimited, registerFailedAttempt, resetAttempts } from "@/src/lib/rate-limit";

export const { GET } = handlers;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const real = request.headers.get("x-real-ip");
  if (real) {
    return real.trim();
  }
  return "unknown";
}

function buildRateLimitKey(ip: string, username: string) {
  const normalizedUsername = username.trim().toLowerCase() || "unknown";
  return `login:${ip}:${normalizedUsername}`;
}

function buildBlockedResponse(retryAfterMs?: number) {
  const retryAfterSeconds = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60;
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return NextResponse.json(
    {
      error: `Too many login attempts. Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`
    },
    {
      status: 429,
      headers: {
        "Retry-After": retryAfterSeconds.toString()
      }
    }
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.clone().formData();
  const username = String(formData.get("username") ?? "");
  const ip = getClientIp(request);
  const rateLimitKey = buildRateLimitKey(ip, username);

  const limitation = isRateLimited(rateLimitKey);
  if (limitation.blocked) {
    return buildBlockedResponse(limitation.retryAfterMs);
  }

  const response = await handlers.POST(request);

  if (response.status >= 200 && response.status < 300) {
    resetAttempts(rateLimitKey);
    return response;
  }

  if (response.status === 401) {
    const result = registerFailedAttempt(rateLimitKey);
    if (result.blocked) {
      return buildBlockedResponse(result.retryAfterMs);
    }
  }

  return response;
}
