import { NextResponse } from "next/server";
import { LINE_OA } from "@/components/seo/site";

// `/line` is referenced from every "ทักไลน์" CTA across landing pages, but
// Pacred has no member-portal "line" page — so redirect straight to the LINE
// OA add-friend deep link. Single source of truth: components/seo/site.ts.
// 302 (temporary) keeps SEO authority on the canonical landing pages.
export function GET() {
  return NextResponse.redirect(LINE_OA.shortUrl, { status: 302 });
}
