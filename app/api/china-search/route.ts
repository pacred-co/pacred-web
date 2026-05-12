import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchKeyword,
  convertProductUrl,
  convertProductUrlDetail,
} from "@/lib/china-search";

/**
 * GET /api/china-search?mode=keyword&q=<text>&platform=1688&page=1
 * GET /api/china-search?mode=url&q=<paste-url>
 *
 * Auth required. Proxies the 3rd-party APIs (RCGroup / Tamit) so we
 * can add a request log + future rate limiting / caching layer without
 * touching the UI.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ available: false, reason: "not_authorized" }, { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  const mode = sp.get("mode") ?? "keyword";
  const q    = sp.get("q") ?? "";

  if (!q.trim()) {
    return NextResponse.json({ available: false, reason: "missing_query" }, { status: 400 });
  }

  if (mode === "url") {
    const result = await convertProductUrl(q);
    return NextResponse.json(result);
  }
  if (mode === "url-detail") {
    const result = await convertProductUrlDetail(q);
    return NextResponse.json(result);
  }

  const platform = (sp.get("platform") ?? "1688") as "1688" | "taobao" | "tmall";
  const page  = Math.max(1, Number(sp.get("page") ?? "1") | 0);
  const order = (sp.get("order") ?? "default") as "default" | "price_asc" | "price_desc";
  const result = await searchKeyword(q, page, order, platform);
  return NextResponse.json(result);
}
