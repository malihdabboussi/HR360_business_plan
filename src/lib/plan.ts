import { NextResponse } from "next/server";
import { PLAN_AR } from "@/content/plan-ar";
import { PLAN_EN } from "@/content/plan-en";
import { isValidToken, isViewable } from "./links";
import { getStore } from "./store";

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow",
};

export function unavailablePage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Link not available</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#00004f;color:#fff;font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;text-align:center;padding:24px}
.box{max-width:520px}h1{font-size:28px;margin:0 0 12px}p{color:#c9d6ff;font-size:17px;line-height:1.5;margin:0 0 8px}.ar{direction:rtl}
.stripe{display:flex;gap:6px;justify-content:center;margin-top:28px}.stripe i{width:60px;height:6px;border-radius:3px}</style></head>
<body><div class="box"><h1>This link is no longer available</h1><p>The HR360 business plan link you opened has been closed or has expired. Please contact HR360 for a new link.</p>
<p class="ar">هذا الرابط لم يعد متاحاً. يرجى التواصل مع HR360 للحصول على رابط جديد.</p>
<div class="stripe"><i style="background:#0077ff"></i><i style="background:#01c3ff"></i><i style="background:#ffa834"></i><i style="background:#ff7132"></i></div></div></body></html>`;
}

/** Serves the plan for a token, or the "not available" page. */
export async function servePlan(token: string | undefined, lang: "en" | "ar"): Promise<NextResponse> {
  if (!isValidToken(token)) {
    return new NextResponse(unavailablePage(), { status: 404, headers: HTML_HEADERS });
  }
  const store = getStore();
  const link = await store.get(token);
  if (!isViewable(link)) {
    return new NextResponse(unavailablePage(), { status: 410, headers: HTML_HEADERS });
  }
  store.recordView(token).catch((err) => console.error("[hr360] recordView failed", err));

  const source = lang === "ar" ? PLAN_AR : PLAN_EN;
  const html = source.replaceAll("{{AR_URL}}", `/p/${token}/ar`).replaceAll("{{EN_URL}}", `/p/${token}`);
  return new NextResponse(html, { status: 200, headers: HTML_HEADERS });
}
