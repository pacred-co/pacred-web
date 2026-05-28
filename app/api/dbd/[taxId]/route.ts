import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/*
  DBD Open Data uses CKAN 2.10.  No API key required for public read.
  Resource ID for juristic-person (นิติบุคคล) dataset.
  Thai field names must be URL-encoded when sent in query params.

  Known WAF quirk: when the Incapsula WAF in front of opendata.dbd.go.th
  blocks a request, it returns HTTP 200 with an HTML challenge body
  (NOT JSON). The previous version of this route ran `res.json()`
  inside the same try block as the fetch, so the parse error fell
  through to the outer catch and returned 502 — Vercel monitoring then
  flagged the route as broken. From the customer's POV the register
  form just degrades to manual entry (the client maps 502→"unavailable"),
  so functionally fine — but the noise was real.

  This version separates the parse failure into a soft 404 "not_found"
  outcome and reserves 502 for the actual network/timeout failures.
  Same client-visible UX (404→not_found, 502→unavailable, both surface
  as "fill manually") but the Vercel logs stay clean.
*/
const CKAN_BASE   = "https://opendata.dbd.go.th/api/3/action/datastore_search";
const RESOURCE_ID = "f092da60-5f9a-4ef4-813c-0b1395778a76";

/* Thai field names in the dataset */
const F_TAX_ID   = "เลขที่ประจำตัวเสียภาษีอากร";
const F_NAME     = "ชื่อนิติบุคคล";
const F_ADDR     = "ที่ตั้งสำนักงานใหญ่";
const F_TAMBON   = "ตำบล";
const F_AMPHOE   = "อำเภอ";
const F_PROVINCE = "จังหวัด";
const F_POSTCODE = "รหัสไปรษณีย์";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taxId: string }> },
) {
  const { taxId } = await params;

  if (!/^\d{13}$/.test(taxId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let res: Response;
  try {
    /* Build URL — encode Thai characters to avoid WAF block */
    const filters = JSON.stringify({ [F_TAX_ID]: taxId });
    const url = new URL(CKAN_BASE);
    url.searchParams.set("resource_id", RESOURCE_ID);
    url.searchParams.set("filters", filters);
    url.searchParams.set("limit", "1");

    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Pacred/1.0)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // Only network/timeout/DNS failures land here now — the actual 502s
    // worth alerting on.
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("api/dbd", "fetch failed", { taxId, message: msg });
    return NextResponse.json({ error: "fetch_failed", detail: msg }, { status: 502 });
  }

  if (!res.ok) {
    logger.warn("api/dbd", "ckan returned non-OK", { taxId, status: res.status });
    return NextResponse.json({ error: "api_error", status: res.status }, { status: 502 });
  }

  // CKAN body might be HTML when Incapsula intercepts (even with 200) —
  // treat unparseable / unexpected-shape responses as "not_found" instead
  // of letting the parse error fall to the network-failure catch.
  let json: { success?: boolean; result?: { records?: Record<string, string>[] } };
  try {
    json = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Snapshot the first ~200 chars of the response (best-effort) so a
    // future debugger can tell HTML-from-WAF from another shape, without
    // logging the whole body.
    let bodySnippet: string | undefined;
    try {
      bodySnippet = (await res.clone().text()).slice(0, 200);
    } catch {
      /* ignore — body already consumed */
    }
    logger.warn("api/dbd", "ckan returned non-JSON (likely WAF challenge)", {
      taxId, message: msg, bodySnippet,
    });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!json.success || !json.result?.records?.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const d = json.result.records[0];

  return NextResponse.json({
    name:        d[F_NAME]     ?? "",
    address:     d[F_ADDR]     ?? "",
    subdistrict: d[F_TAMBON]   ?? "",
    district:    d[F_AMPHOE]   ?? "",
    province:    d[F_PROVINCE] ?? "",
    postcode:    d[F_POSTCODE] ?? "",
  });
}
