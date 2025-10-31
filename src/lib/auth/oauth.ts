import { redirect } from "next/navigation";
import crypto from "node:crypto";
import db, { nowIso } from "../db";
import { config } from "../config";
import { getOAuthSettings, OAuthSettings } from "../settings";
import { createUser, findUserByProviderSubject, getUserCount, updateUserProfile, User } from "../models/user";

const OAUTH_STATE_TTL_MS = 1000 * 60 * 10; // 10 minutes

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
};

export function requireOAuthSettings(): OAuthSettings {
  const settings = getOAuthSettings();
  if (!settings) {
    redirect("/setup/oauth");
  }
  return settings;
}

function createCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function codeChallengeFromVerifier(verifier: string): string {
  const hashed = crypto.createHash("sha256").update(verifier).digest();
  return Buffer.from(hashed)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function storeOAuthState(state: string, codeVerifier: string, redirectTo?: string) {
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO oauth_states (state, code_verifier, redirect_to, created_at, expires_at)
     VALUES (?, ?, ?, ? ,?)`
  ).run(state, codeVerifier, redirectTo ?? null, nowIso(), expiresAt);
}

function consumeOAuthState(state: string): { codeVerifier: string; redirectTo: string | null } | null {
  const row = db
    .prepare(
      `SELECT id, code_verifier, redirect_to, expires_at
       FROM oauth_states WHERE state = ?`
    )
    .get(state) as { id: number; code_verifier: string; redirect_to: string | null; expires_at: string } | undefined;
  if (!row) {
    return null;
  }

  db.prepare("DELETE FROM oauth_states WHERE id = ?").run(row.id);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }

  return { codeVerifier: row.code_verifier, redirectTo: row.redirect_to };
}

export function buildAuthorizationUrl(redirectTo?: string): string {
  const settings = requireOAuthSettings();
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = createCodeVerifier();
  const challenge = codeChallengeFromVerifier(verifier);
  storeOAuthState(state, verifier, redirectTo);

  const redirectUri = `${config.baseUrl}/api/auth/callback`;
  const url = new URL(settings.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", settings.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

async function exchangeCode(settings: OAuthSettings, code: string, codeVerifier: string): Promise<TokenResponse> {
  const redirectUri = `${config.baseUrl}/api/auth/callback`;

  const response = await fetch(settings.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code_verifier: codeVerifier
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed: ${response.status} ${text}`);
  }

  return (await response.json()) as TokenResponse;
}

async function fetchUserInfo(settings: OAuthSettings, tokenResponse: TokenResponse): Promise<Record<string, unknown>> {
  if (!settings.userInfoUrl) {
    throw new Error("OAuth userInfoUrl is not configured");
  }

  const response = await fetch(settings.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${tokenResponse.access_token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth userinfo fetch failed: ${response.status} ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function extractUserFromClaims(settings: OAuthSettings, claims: Record<string, unknown>): {
  email: string;
  name: string | null;
  avatar_url: string | null;
  subject: string;
} {
  const subject = String(claims.sub ?? claims.id ?? claims.user_id ?? "");
  if (!subject) {
    throw new Error("OAuth userinfo response missing subject claim");
  }
  const emailClaim = settings.emailClaim ?? "email";
  const nameClaim = settings.nameClaim ?? "name";
  const avatarClaim = settings.avatarClaim ?? "picture";

  const rawEmail = claims[emailClaim];
  if (!rawEmail || typeof rawEmail !== "string") {
    throw new Error(`OAuth userinfo response missing ${emailClaim}`);
  }

  const name = typeof claims[nameClaim] === "string" ? (claims[nameClaim] as string) : null;
  const avatar = typeof claims[avatarClaim] === "string" ? (claims[avatarClaim] as string) : null;

  return {
    email: rawEmail,
    name,
    avatar_url: avatar,
    subject
  };
}

export async function finalizeOAuthLogin(code: string, state: string): Promise<{ user: User; redirectTo: string | null }> {
  const container = consumeOAuthState(state);
  if (!container) {
    throw new Error("Invalid or expired OAuth state");
  }

  const settings = requireOAuthSettings();
  const tokenResponse = await exchangeCode(settings, code, container.codeVerifier);
  const claims = await fetchUserInfo(settings, tokenResponse);
  const profile = extractUserFromClaims(settings, claims);

  let user = findUserByProviderSubject(settings.authorizationUrl, profile.subject);
  if (!user) {
    const totalUsers = getUserCount();
    const role = totalUsers === 0 ? "admin" : "user";
    user = createUser({
      email: profile.email,
      name: profile.name,
      avatar_url: profile.avatar_url,
      provider: settings.authorizationUrl,
      subject: profile.subject,
      role
    });
  } else {
    user = updateUserProfile(user.id, {
      email: profile.email,
      name: profile.name,
      avatar_url: profile.avatar_url
    })!;
  }

  return { user, redirectTo: container.redirectTo };
}
