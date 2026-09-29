import { NextResponse } from "next/server";
import { baseUrl, isValidToken, linkStatus, shareUrl } from "@/lib/links";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { token: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!isValidToken(params.token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { action?: string; expiresAt?: string | null; label?: string; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const store = getStore();
  const now = new Date().toISOString();
  let patch: Record<string, unknown> = {};
  switch (body.action) {
    case "revoke":
      patch = { revoked: true, revokedAt: now };
      break;
    case "restore":
      patch = { revoked: false, revokedAt: null };
      break;
    case "edit": {
      if (typeof body.label === "string") patch.label = body.label.trim().slice(0, 120);
      if (typeof body.note === "string") patch.note = body.note.trim().slice(0, 500) || undefined;
      if (body.expiresAt === null) patch.expiresAt = null;
      else if (typeof body.expiresAt === "string") {
        const d = new Date(body.expiresAt);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
        patch.expiresAt = d.toISOString();
      }
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const link = await store.update(params.token, patch);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const base = baseUrl(req);
  return NextResponse.json({ link: { ...link, status: linkStatus(link), url: shareUrl(base, link.token), urlAr: shareUrl(base, link.token, "ar") } });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!isValidToken(params.token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await getStore().remove(params.token);
  return NextResponse.json({ ok: true });
}
