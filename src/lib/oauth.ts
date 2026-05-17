import "server-only";
import crypto from "node:crypto";

/**
 * Hand-rolled OAuth2 helpers — keeps the bundle lean (no `googleapis`,
 * no `@azure/msal-node` dependency). Each provider supplies its own
 * authorize / token / refresh URLs and we use plain `fetch`.
 */

export interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  extraAuthorizeParams?: Record<string, string>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: number;
}

export function makeState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function buildAuthorizeUrl(cfg: OAuthProviderConfig, state: string): string {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  for (const [k, v] of Object.entries(cfg.extraAuthorizeParams ?? {})) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

export async function exchangeCode(
  cfg: OAuthProviderConfig,
  code: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

  // TEMP DEBUG — remove after OAuth works.
  console.log("[oauth/exchangeCode] tokenUrl:", cfg.tokenUrl);
  console.log("[oauth/exchangeCode] redirect_uri being sent:", JSON.stringify(cfg.redirectUri));
  console.log("[oauth/exchangeCode] client_id being sent:", JSON.stringify(cfg.clientId));
  console.log("[oauth/exchangeCode] body string:", body.toString());

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    console.log("[oauth/exchangeCode] Google response:", res.status, text);
    throw new Error(`OAuth token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessTokenExpiresAt: Date.now() + (json.expires_in - 30) * 1000,
  };
}

export async function refreshAccessToken(
  cfg: OAuthProviderConfig,
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth refresh failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    accessTokenExpiresAt: Date.now() + (json.expires_in - 30) * 1000,
  };
}

export function googleConfig(): OAuthProviderConfig | null {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  const baseUrl = process.env.OMNIMAIL_BASE_URL ?? "http://localhost:3100";
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${baseUrl}/api/auth/google/callback`,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
  };
}

export function microsoftConfig(): OAuthProviderConfig | null {
  if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET) return null;
  const tenant = process.env.MS_TENANT_ID ?? "common";
  const baseUrl = process.env.OMNIMAIL_BASE_URL ?? "http://localhost:3100";
  return {
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    clientId: process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    redirectUri: `${baseUrl}/api/auth/microsoft/callback`,
    scope: [
      "openid",
      "offline_access",
      "email",
      "profile",
      "Mail.ReadWrite",
      "Mail.Send",
    ].join(" "),
  };
}
