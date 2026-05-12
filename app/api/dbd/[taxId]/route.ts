import { NextResponse } from "next/server";

export const runtime = "nodejs";

/*
  DBD Open Data uses CKAN 2.10.  No API key required for public read.
  Resource ID for juristic-person (นิติบุคคล) dataset.
  Thai field names must be URL-encoded when sent in query params.
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

  try {
    /* Build URL — encode Thai characters to avoid WAF block */
    const filters = JSON.stringify({ [F_TAX_ID]: taxId });
    const url = new URL(CKAN_BASE);
    url.searchParams.set("resource_id", RESOURCE_ID);
    url.searchParams.set("filters", filters);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Pacred/1.0)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "api_error", status: res.status }, { status: 502 });
    }

    const json = await res.json() as {
      success: boolean;
      result?: { records?: Record<string, string>[] };
    };

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

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "fetch_failed", detail: msg }, { status: 502 });
  }
}
