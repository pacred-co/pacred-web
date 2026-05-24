import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchKeyword,
  convertProductUrl,
  convertProductUrlDetail,
} from "@/lib/china-search";
import { saveSearchQuery } from "@/actions/search";

/**
 * GET /api/china-search?mode=keyword&q=<text>&platform=1688&page=1
 * GET /api/china-search?mode=url&q=<paste-url>
 *
 * Auth required. Proxies the 3rd-party APIs (RCGroup / Tamit) so we
 * can add a request log + future rate limiting / caching layer without
 * touching the UI.
 *
 * After a successful search, fire-and-forget a tb_search_history row
 * (G8 — D1 customer-backend gap #8). The legacy search.php L370-372
 * INSERT was deferred from the SC render — this is the chosen wire
 * point (Server Component pages cannot mutate; the API route can).
 * The write is best-effort: errors are swallowed inside
 * `saveSearchQuery` so search responses never block on logging.
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
    // G8 — log the URL paste search. Fire-and-forget: never await past
    // the response, never let a log failure surface as an HTTP error.
    void saveSearchQuery({
      query:       q,
      source:      "china-search.url",
      resultCount: result.available ? result.hits.length : 0,
    });
    return NextResponse.json(result);
  }
  if (mode === "url-detail") {
    const result = await convertProductUrlDetail(q);
    // G8 — url-detail returns a single product (or fallback demo);
    // resultCount stays null since "1" is not meaningful here.
    void saveSearchQuery({
      query:  q,
      source: "china-search.url-detail",
    });
    return NextResponse.json(result);
  }

  const platform = (sp.get("platform") ?? "1688") as "1688" | "taobao" | "tmall";
  const page  = Math.max(1, Number(sp.get("page") ?? "1") | 0);
  const order = (sp.get("order") ?? "default") as "default" | "price_asc" | "price_desc";
  const result = await searchKeyword(q, page, order, platform);
  // G8 — log the keyword search. Page > 1 still logs (a user paging
  // through results is still a search) — the timeline shows engagement.
  void saveSearchQuery({
    query:       q,
    source:      "china-search.keyword",
    resultCount: result.available ? result.hits.length : 0,
  });
  return NextResponse.json(result);
}
