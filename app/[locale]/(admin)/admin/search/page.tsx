import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Search } from "lucide-react";

/**
 * U4-1 — Admin global search.
 *
 * Single query box → ?q=<text> → searches across:
 *   - profiles      (member_code · first_name · last_name · phone · email · company_name)
 *   - forwarders    (f_no, cabinet_number)
 *   - service_orders (h_no)
 *   - freight_shipments (job_no)
 *   - tb_forwarder_tax_invoice + tb_shop_tax_invoice (serial_no · the live tb_* stores)
 *   - refund_requests (request_no)
 *   - freight_quotes (quote_no)
 *
 * Wave 3 cleanup (2026-05-20 ค่ำ): the dedicated cargo_containers entity
 * was removed when the spine was retired. Container searches now go via
 * forwarders.cabinet_number — staff paste a ตู้ number and get every
 * forwarder in that container, then jump to /admin/report-cnt for the
 * grouped container view.
 *
 * Each entity surfaces as a section with up to 5 hits + "ดูเพิ่ม" link to the
 * per-entity list filtered by the query. Designed so super/ops can paste any
 * customer-supplied identifier (member_code from a phone call, f_no from a
 * receipt, job_no from LINE) and find the row + jump to the right detail
 * page in 2 clicks.
 *
 * RBAC: super + ops + accounting + sales_admin (read-only — no mutations).
 */

export const dynamic = "force-dynamic";

const MIN_QUERY_LEN = 2;
const PER_ENTITY_LIMIT = 5;

type Profile = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  account_type: "personal" | "juristic";
};

type Forwarder    = { id: string; f_no: string; status: string; profile_id: string; total_price: number | null; cabinet_number: string | null; created_at: string };
type ServiceOrder = { id: string; h_no: string; status: string; profile_id: string; total_thb: number | null; created_at: string };
type FreightShip  = { id: string; job_no: string | null; status: string; profile_id: string; created_at: string };
type TaxInvoice   = { id: number; serial_no: string | null; userid: string | null; gross_before_wht: number | string | null; issued_at: string | null; store: "forwarder" | "shop" };
type RefundReq    = { id: string; request_no: string | null; status: string; profile_id: string; amount_thb: number; created_at: string };
type FreightQuote = { id: string; quote_no: string | null; status: string; profile_id: string | null; created_at: string };

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function customerLabel(p: Pick<Profile, "first_name" | "last_name" | "company_name" | "account_type">): string {
  if (p.account_type === "juristic" && p.company_name) return p.company_name;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export default async function AdminGlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp    = await searchParams;
  const q     = sp.q?.trim() ?? "";
  const admin = createAdminClient();

  const tooShort = q.length > 0 && q.length < MIN_QUERY_LEN;
  const willRun  = q.length >= MIN_QUERY_LEN;
  const escaped  = q.replace(/[%_]/g, (m) => `\\${m}`);   // escape LIKE wildcards
  const ilike    = `%${escaped}%`;

  let profiles:        Profile[]      = [];
  let forwarders:      Forwarder[]    = [];
  let serviceOrders:   ServiceOrder[] = [];
  let freightShips:    FreightShip[]  = [];
  let taxInvoices:     TaxInvoice[]   = [];
  let refundRequests:  RefundReq[]    = [];
  let freightQuotes:   FreightQuote[] = [];

  if (willRun) {
    // Profiles — multi-column OR via PostgREST `or` clause
    const { data: pData, error: pDataErr } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone, email, company_name, account_type")
      .or([
        `member_code.ilike.${ilike}`,
        `first_name.ilike.${ilike}`,
        `last_name.ilike.${ilike}`,
        `phone.ilike.${ilike}`,
        `email.ilike.${ilike}`,
        `company_name.ilike.${ilike}`,
      ].join(","))
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    if (pDataErr) {
      console.error(`[profiles list] failed`, { code: pDataErr.code, message: pDataErr.message });
    }
    profiles = (pData ?? []) as Profile[];

    // Forwarders — search both f_no AND cabinet_number (so a container ตู้
    // search lands here directly, replacing the deleted cargo_containers entity)
    const { data: fData, error: fDataErr } = await admin
      .from("forwarders")
      .select("id, f_no, status, profile_id, total_price, cabinet_number, created_at")
      .or([
        `f_no.ilike.${ilike}`,
        `cabinet_number.ilike.${ilike}`,
      ].join(","))
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    if (fDataErr) {
      console.error(`[forwarders list] failed`, { code: fDataErr.code, message: fDataErr.message });
    }
    forwarders = (fData ?? []) as Forwarder[];

    // Service orders
    const { data: soData, error: soDataErr } = await admin
      .from("service_orders")
      .select("id, h_no, status, profile_id, total_thb, created_at")
      .ilike("h_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    if (soDataErr) {
      console.error(`[service_orders list] failed`, { code: soDataErr.code, message: soDataErr.message });
    }
    serviceOrders = (soData ?? []) as ServiceOrder[];

    // Freight shipments
    const { data: fsData, error: fsDataErr } = await admin
      .from("freight_shipments")
      .select("id, job_no, status, profile_id, created_at")
      .ilike("job_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    if (fsDataErr) {
      console.error(`[freight_shipments list] failed`, { code: fsDataErr.code, message: fsDataErr.message });
    }
    freightShips = (fsData ?? []) as FreightShip[];

    // Tax invoices — search `serial_no` across the LIVE tb_* stores
    // (tb_forwarder_tax_invoice + tb_shop_tax_invoice). The World-A `tax_invoices`
    // twin is 0-row AND has no `invoice_no` column (it used serial_no), so the old
    // query was doubly dead. Each row carries a `store` tag so the drill-down (the
    // PDF route /api/tax-invoice/[id]?store=…) resolves the right bigserial id.
    async function searchTaxStore(
      table: "tb_forwarder_tax_invoice" | "tb_shop_tax_invoice",
      store: "forwarder" | "shop",
    ): Promise<TaxInvoice[]> {
      const { data, error } = await admin
        .from(table)
        .select("id, serial_no, userid, gross_before_wht, issued_at")
        .ilike("serial_no", ilike)
        .order("issued_at", { ascending: false, nullsFirst: false })
        .limit(PER_ENTITY_LIMIT);
      if (error) {
        console.error(`[${table} search] failed`, { code: error.code, message: error.message });
        return [];
      }
      return ((data ?? []) as Omit<TaxInvoice, "store">[]).map((r) => ({ ...r, store }));
    }
    const [fwdTi, shopTi] = await Promise.all([
      searchTaxStore("tb_forwarder_tax_invoice", "forwarder"),
      searchTaxStore("tb_shop_tax_invoice", "shop"),
    ]);
    taxInvoices = [...fwdTi, ...shopTi]
      .sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""))
      .slice(0, PER_ENTITY_LIMIT);

    // Container search now folds into forwarders.cabinet_number above
    // (Wave 3: cargo_containers retired). For the grouped container view,
    // jump to /admin/report-cnt directly.

    // Refund requests
    const { data: rData, error: rDataErr } = await admin
      .from("refund_requests")
      .select("id, request_no, status, profile_id, amount_thb, created_at")
      .ilike("request_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    if (rDataErr) {
      console.error(`[refund_requests list] failed`, { code: rDataErr.code, message: rDataErr.message });
    }
    refundRequests = (rData ?? []) as RefundReq[];

    // Freight quotes
    const { data: qData, error: qDataErr } = await admin
      .from("freight_quotes")
      .select("id, quote_no, status, profile_id, created_at")
      .ilike("quote_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    if (qDataErr) {
      console.error(`[freight_quotes list] failed`, { code: qDataErr.code, message: qDataErr.message });
    }
    freightQuotes = (qData ?? []) as FreightQuote[];
  }

  const totalHits = profiles.length + forwarders.length + serviceOrders.length
    + freightShips.length + taxInvoices.length
    + refundRequests.length + freightQuotes.length;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · U4-1 global search</p>
        <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6" /> ค้นหาทุกที่
        </h1>
        <p className="mt-1 text-sm text-muted">
          ค้นหาข้าม profiles · forwarders (+ตู้) · service_orders · freight · tax invoices · refunds · quotes
        </p>
      </div>

      <form action="/admin/search" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="พิมพ์ member_code, f_no, h_no, job_no, เบอร์โทร, อีเมล, container code..."
          className="flex-1 rounded-lg border border-border bg-surface-alt/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          autoFocus
        />
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-6 py-2.5 text-sm font-medium hover:bg-primary-600">
          ค้นหา
        </button>
      </form>

      {tooShort && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          พิมพ์อย่างน้อย {MIN_QUERY_LEN} ตัวอักษร
        </p>
      )}

      {!willRun && !tooShort && (
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-8 text-center text-sm text-muted">
          พิมพ์คำค้นแล้วกด Enter — ผลลัพธ์จากทุก entity จะแสดงเป็นกลุ่ม
        </div>
      )}

      {willRun && (
        <p className="text-xs text-muted">
          พบ <span className="font-mono font-bold text-foreground">{totalHits}</span> รายการ
          (จำกัด {PER_ENTITY_LIMIT}/หมวด — &quot;ดูเพิ่ม&quot; เพื่อดู list หมวดนั้น)
        </p>
      )}

      {willRun && profiles.length > 0 && (
        <Section title="ลูกค้า (profiles)" count={profiles.length} moreHref={`/admin/customers?q=${encodeURIComponent(q)}`}>
          {profiles.map((p) => (
            <Link key={p.id} href={`/admin/customers/${p.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium">{customerLabel(p)}</p>
                  <p className="text-[11px] text-muted">
                    <span className="font-mono">{p.member_code ?? "—"}</span>
                    {p.phone && <> · ☎ {p.phone}</>}
                    {p.email && <> · ✉ {p.email}</>}
                  </p>
                </div>
                <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] uppercase">{p.account_type}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && forwarders.length > 0 && (
        <Section title="ฝากนำเข้า (forwarders)" count={forwarders.length} moreHref={`/admin/forwarders?q=${encodeURIComponent(q)}`}>
          {forwarders.map((f) => (
            <Link key={f.id} href={`/admin/forwarders/${f.f_no}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{f.f_no}</span>
                {f.cabinet_number && <span className="text-muted text-[11px]">↳ ตู้: <span className="font-mono">{f.cabinet_number}</span></span>}
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{f.status}</span>
                <span className="font-mono">{thb(f.total_price)}</span>
                <span className="text-muted">{new Date(f.created_at).toLocaleDateString("th-TH")}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && serviceOrders.length > 0 && (
        <Section title="ฝากสั่ง (service_orders)" count={serviceOrders.length} moreHref={`/admin/service-orders?q=${encodeURIComponent(q)}`}>
          {serviceOrders.map((so) => (
            <Link key={so.id} href={`/admin/service-orders/${so.h_no}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{so.h_no}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{so.status}</span>
                <span className="font-mono">{thb(so.total_thb)}</span>
                <span className="text-muted">{new Date(so.created_at).toLocaleDateString("th-TH")}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && freightShips.length > 0 && (
        <Section title="Freight shipments" count={freightShips.length} moreHref={`/admin/freight/shipments?q=${encodeURIComponent(q)}`}>
          {freightShips.map((fs) => (
            <Link key={fs.id} href={`/admin/freight/shipments/${fs.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{fs.job_no ?? "(no job_no)"}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{fs.status}</span>
                <span className="text-muted">{new Date(fs.created_at).toLocaleDateString("th-TH")}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && taxInvoices.length > 0 && (
        <Section title="ใบกำกับภาษี (tax invoices)" count={taxInvoices.length} moreHref="/admin/accounting/etax">
          {taxInvoices.map((ti) => (
            // Drill-down = the issued-doc PDF (admin-gated, store-discriminated).
            // The World-A detail page was retired; the live id space is tb_*.
            <a
              key={`${ti.store}-${ti.id}`}
              href={`/api/tax-invoice/${ti.id}?store=${ti.store}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{ti.serial_no ?? "(ยังไม่มีเลข)"}</span>
                <span className="font-mono">{thb(Number(ti.gross_before_wht ?? 0))}</span>
                <span className="text-muted">{ti.issued_at ? new Date(ti.issued_at).toLocaleDateString("th-TH") : "ยังไม่ออก"}</span>
              </div>
            </a>
          ))}
        </Section>
      )}

      {willRun && refundRequests.length > 0 && (
        <Section title="ขอเงินคืน (refund requests)" count={refundRequests.length} moreHref={`/admin/refunds?q=${encodeURIComponent(q)}`}>
          {refundRequests.map((r) => (
            <Link key={r.id} href={`/admin/refunds/${r.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{r.request_no ?? r.id.slice(0, 8)}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{r.status}</span>
                <span className="font-mono">{thb(Number(r.amount_thb))}</span>
                <span className="text-muted">{new Date(r.created_at).toLocaleDateString("th-TH")}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && freightQuotes.length > 0 && (
        <Section title="Freight quotes" count={freightQuotes.length} moreHref={`/admin/freight/quotes?q=${encodeURIComponent(q)}`}>
          {freightQuotes.map((fq) => (
            <Link key={fq.id} href={`/admin/freight/quotes/${fq.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{fq.quote_no ?? fq.id.slice(0, 8)}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{fq.status}</span>
                <span className="text-muted">{new Date(fq.created_at).toLocaleDateString("th-TH")}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && totalHits === 0 && (
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-8 text-center text-sm text-muted">
          ไม่พบ &quot;{q}&quot; ในระบบเลย ลองคำค้นอื่น (member_code, เบอร์, f_no, h_no, container code)
        </div>
      )}
    </main>
  );
}

function Section({ title, count, moreHref, children }: {
  title: string;
  count: number;
  moreHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 bg-surface-alt/30 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-sm">{title} <span className="text-muted text-xs font-normal">({count})</span></h2>
        <Link href={moreHref} className="text-[11px] text-primary-600 hover:underline">↗ ดูเพิ่มใน list</Link>
      </header>
      {children}
    </section>
  );
}
