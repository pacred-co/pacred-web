import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { Boxes, Search, ExternalLink } from "lucide-react";

/**
 * Admin · China product-category / search-demand lookup (READ-ONLY).
 *
 * Goldmine activation (2026-06-09): `tb_api_china_hs` holds ~77k rows that
 * NOTHING in the app read. Each row is a real China product-search a member
 * ran on the legacy PCS site — either a keyword (type=1) or a pasted
 * 1688/taobao/tmall product link (type=2/3/4) — together with the resolved
 * China category name (`namecategory`). It is two things at once:
 *   1. a China product-category dictionary (search by category name), and
 *   2. real customer search-demand intelligence (what people looked for).
 *
 * This page surfaces it as a paginated, server-side search tool. Staff type
 * a keyword (TH/CN category fragment) or part of a 1688/taobao/tmall URL →
 * ILIKE over `namecategory` + `url` (trigram-indexed · migration 0157) →
 * windowed results. READ-ONLY — no mutations, no write actions.
 *
 * Real schema (migration 0081 — NOT an HS-code table despite the legacy
 * `tb_api_china_hs` name):
 *   id          bigint   PK
 *   whsid       bigint   warehouse id the search ran under
 *   url         text     keyword text OR 1688/taobao/tmall product URL
 *   type        integer  1=ค้นหาคำ · 2=วางลิงก์1688 · 3=วางลิงก์taobao · 4=วางลิงก์tmall
 *   status      integer  0=ทำงานปกติ · 1=ไม่ทำงาน
 *   namecategory varchar(200)  resolved China category name (searchable)
 *
 * RBAC: super · ops · sales_admin · sales (read-only reference — useful to
 * CS/sales when a customer asks "do you handle <category>" or to look up the
 * category a pasted China link resolved to). No mutation surface.
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = DEFAULT_PAGE_SIZE; // 50
const MIN_QUERY_LEN = 2;

type ChinaHsRow = {
  id: number;
  whsid: number;
  url: string;
  type: number;
  status: number;
  namecategory: string;
};

const TYPE_LABEL: Record<number, string> = {
  1: "ค้นหาคำ",
  2: "ลิงก์ 1688",
  3: "ลิงก์ Taobao",
  4: "ลิงก์ Tmall",
};

const TYPE_TINT: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  2: "bg-orange-100 text-orange-700",
  3: "bg-amber-100 text-amber-700",
  4: "bg-rose-100 text-rose-700",
};

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export default async function AdminChinaCategoryLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  await requireAdmin(["super", "ops", "sales_admin", "sales"]);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const typeFilter = sp.type && /^[1-4]$/.test(sp.type) ? Number(sp.type) : undefined;
  const page = parsePage(sp.page);

  const admin = createAdminClient();

  const tooShort = q.length > 0 && q.length < MIN_QUERY_LEN;
  // We always run a query (browse mode shows the newest rows even with no
  // search term) unless the term is non-empty-but-too-short.
  const willRun = !tooShort;

  let rows: ChinaHsRow[] = [];
  let total = 0;
  let queryFailed = false;

  if (willRun) {
    const { from, to } = pageRange(page, PAGE_SIZE);

    let query = admin
      .from("tb_api_china_hs")
      .select("id, whsid, url, type, status, namecategory", { count: "exact" });

    if (q.length >= MIN_QUERY_LEN) {
      const escaped = q.replace(/[%_]/g, (m) => `\\${m}`); // escape LIKE wildcards
      const ilike = `%${escaped}%`;
      query = query.or([`namecategory.ilike.${ilike}`, `url.ilike.${ilike}`].join(","));
    }
    if (typeFilter !== undefined) {
      query = query.eq("type", typeFilter);
    }

    const { data, count, error } = await query
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[china-category lookup] query failed", {
        code: error.code,
        message: error.message,
        q,
        typeFilter,
        page,
      });
      queryFailed = true;
    }
    rows = (data ?? []) as ChinaHsRow[];
    total = count ?? 0;
  }

  const searched = q.length >= MIN_QUERY_LEN || typeFilter !== undefined;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · เครื่องมือ
        </p>
        <h1 className="mt-1 text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Boxes className="w-6 h-6 shrink-0" /> หมวดสินค้าจีน / คำค้น (China category)
        </h1>
        <p className="mt-1 text-sm text-muted">
          ค้นหาข้อมูลหมวดสินค้าจีน + คำค้น / ลิงก์ 1688·Taobao·Tmall ที่ลูกค้าเคยค้นหา
          (อ่านอย่างเดียว · ~77k รายการ)
        </p>
      </div>

      <form
        action="/admin/tools/china-category"
        method="get"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="พิมพ์ชื่อหมวดสินค้า หรือบางส่วนของลิงก์ 1688/Taobao/Tmall..."
            className="flex-1 rounded-lg border border-border bg-surface-alt/30 px-4 py-2.5 text-base focus:outline-none focus:ring-1 focus:ring-primary-500/40"
            autoFocus
          />
          <select
            name="type"
            defaultValue={typeFilter ? String(typeFilter) : ""}
            className="rounded-lg border border-border bg-surface-alt/30 px-3 py-2.5 text-base focus:outline-none focus:ring-1 focus:ring-primary-500/40"
            aria-label="ประเภท"
          >
            <option value="">ทุกประเภท</option>
            <option value="1">ค้นหาคำ</option>
            <option value="2">ลิงก์ 1688</option>
            <option value="3">ลิงก์ Taobao</option>
            <option value="4">ลิงก์ Tmall</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-primary-700 inline-flex items-center justify-center gap-1.5"
          >
            <Search className="w-4 h-4" /> ค้นหา
          </button>
        </div>
      </form>

      {tooShort && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          พิมพ์อย่างน้อย {MIN_QUERY_LEN} ตัวอักษร
        </p>
      )}

      {queryFailed && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          โหลดข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง
        </div>
      )}

      {!queryFailed && willRun && (
        <>
          <p className="text-xs text-muted">
            {searched ? "พบ " : "ทั้งหมด "}
            <span className="font-mono font-bold text-foreground">
              {total.toLocaleString("th-TH")}
            </span>{" "}
            รายการ
            {!searched && " (เรียงจากใหม่ล่าสุด — พิมพ์คำค้นเพื่อกรอง)"}
          </p>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-alt/30 p-8 text-center text-sm text-muted">
              {searched
                ? `ไม่พบ "${q}" ในหมวดสินค้าจีน ลองคำค้นอื่น`
                : "ยังไม่มีข้อมูลหมวดสินค้าจีน"}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/40 text-xs text-muted">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-semibold">หมวดสินค้า</th>
                    <th className="px-4 py-2.5 font-semibold">ประเภท</th>
                    <th className="px-4 py-2.5 font-semibold">คำค้น / ลิงก์</th>
                    <th className="px-4 py-2.5 font-semibold text-center">โกดัง</th>
                    <th className="px-4 py-2.5 font-semibold text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-surface-alt/40"
                    >
                      <td className="px-4 py-2.5 font-medium max-w-xs">
                        {r.namecategory || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            TYPE_TINT[r.type] ?? "bg-surface-alt text-muted"
                          }`}
                        >
                          {TYPE_LABEL[r.type] ?? `type ${r.type}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-md">
                        {isUrl(r.url) ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-primary-600 hover:underline break-all text-xs"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{r.url}</span>
                          </a>
                        ) : (
                          <span className="text-foreground break-words">{r.url || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs text-muted">
                        {r.whsid || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.status === 0 ? (
                          <span className="inline-block rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
                            ปกติ
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[11px] font-medium">
                            ปิด
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/tools/china-category"
            params={{ q: q || undefined, type: typeFilter }}
          />
        </>
      )}
    </main>
  );
}
