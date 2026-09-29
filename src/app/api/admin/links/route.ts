import { NextResponse } from "next/server";
import { baseUrl, linkStatus, newToken, shareUrl } from "@/lib/links";
import { getStore, type ShareLink } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function present(link: ShareLink, base: string) {
  return { ...link, status: linkStatus(link), url: shareUrl(base, link.token), urlAr: shareUrl(base, link.token, "ar") };
}

export async function GET(req: Request) {
  const links = await getStore().list();
  links.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const base = baseUrl(req);
  return NextResponse.json({ links: links.map((l) => present(l, base)) });
}

export async function POST(req: Request) {
  let body: { label?: string; note?: string; expiresAt?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const label = (body.label ?? "").trim().slice(0, 120);
  if (!label) return NextResponse.json({ error: "Label is required (who the link is for)" }, { status: 400 });
  let expiresAt: string | null = null;
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    expiresAt = d.toISOString();
  }
  const link: ShareLink = {
    token: newToken(),
    label,
    note: (body.note ?? "").trim().slice(0, 500) || undefined,
    createdAt: new Date().toISOString(),
    expiresAt,
    revoked: false,
    revokedAt: null,
    views: 0,
    lastViewedAt: null,
  };
  await getStore().put(link);
  return NextResponse.json({ link: present(link, baseUrl(req)) }, { status: 201 });
}
