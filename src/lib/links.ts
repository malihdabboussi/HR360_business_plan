import { randomBytes } from "node:crypto";
import type { ShareLink } from "./store";

export type LinkStatus = "active" | "revoked" | "expired";

export function linkStatus(link: ShareLink, now = new Date()): LinkStatus {
  if (link.revoked) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export function isViewable(link: ShareLink | null | undefined): link is ShareLink {
  return !!link && linkStatus(link) === "active";
}

/** 22-character URL-safe token with 128 bits of randomness. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export function isValidToken(token: string | undefined): token is string {
  return !!token && TOKEN_RE.test(token);
}

export function baseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export function shareUrl(base: string, token: string, lang: "en" | "ar" = "en"): string {
  return lang === "ar" ? `${base}/p/${token}/ar` : `${base}/p/${token}`;
}
