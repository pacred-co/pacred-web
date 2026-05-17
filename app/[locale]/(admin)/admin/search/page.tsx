import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Search } from "lucide-react";

/**
 * U4-1 — Admin global search.
 *
 * Single query box → ?q=<text> → searches across:
 *   - profiles      (member_code · first_name · last_name · phone · email · company_name)
 *   - forwarders    (f_no)
 *   - service_orders (h_no)
 *   - freight_shipments (job_no)
 *   - tax_invoices  (invoice_no)
 *   - cargo_containers (code · legacy_container_no)
 *   - refund_requests (request_no)
 *   - freight_quotes (quote_no)
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

type Forwarder    = { id: string; f_no: string; status: string; profile_id: string; total_price: number | null; created_at: string };
type ServiceOrder = { id: string; h_no: string; status: string; profile_id: string; total_thb: number | null; created_at: string };
type FreightShip  = { id: string; job_no: string | null; status: string; profile_id: string; created_at: string };
type TaxInvoice   = { id: string; invoice_no: string | null; profile_id: string; total_thb: number | null; issued_at: string | null };
type Container    = { id: string; code: string | null; legacy_container_no: string | null; status: string; transport_mode: string | null };
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
  let containers:      Container[]    = [];
  let refundRequests:  RefundReq[]    = [];
  let freightQuotes:   FreightQuote[] = [];

  if (willRun) {
    // Profiles — multi-column OR via PostgREST `or` clause
    const { data: pData } = await admin
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
    profiles = (pData ?? []) as Profile[];

    // Forwarders
    const { data: fData } = await admin
      .from("forwarders")
      .select("id, f_no, status, profile_id, total_price, created_at")
      .ilike("f_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    forwarders = (fData ?? []) as Forwarder[];

    // Service orders
    const { data: soData } = await admin
      .from("service_orders")
      .select("id, h_no, status, profile_id, total_thb, created_at")
      .ilike("h_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    serviceOrders = (soData ?? []) as ServiceOrder[];

    // Freight shipments
    const { data: fsData } = await admin
      .from("freight_shipments")
      .select("id, job_no, status, profile_id, created_at")
      .ilike("job_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    freightShips = (fsData ?? []) as FreightShip[];

    // Tax invoices
    const { data: tiData } = await admin
      .from("tax_invoices")
      .select("id, invoice_no, profile_id, total_thb, issued_at")
      .ilike("invoice_no", ilike)
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(PER_ENTITY_LIMIT);
    taxInvoices = (tiData ?? []) as TaxInvoice[];

    // Cargo containers (search both spine `code` + legacy `legacy_container_no` from U1-1 backfill)
    const { data: cData } = await admin
      .from("cargo_containers")
      .select("id, code, legacy_container_no, status, transport_mode")
      .or([
        `code.ilike.${ilike}`,
        `legacy_container_no.ilike.${ilike}`,
      ].join(","))
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    containers = (cData ?? []) as Container[];

    // Refund requests
    const { data: rData } = await admin
      .from("refund_requests")
      .select("id, request_no, status, profile_id, amount_thb, created_at")
      .ilike("request_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    refundRequests = (rData ?? []) as RefundReq[];

    // Freight quotes
    const { data: qData } = await admin
      .from("freight_quotes")
      .select("id, quote_no, status, profile_id, created_at")
      .ilike("quote_no", ilike)
      .order("created_at", { ascending: false })
      .limit(PER_ENTITY_LIMIT);
    freightQuotes = (qData ?? []) as FreightQuote[];
  }

  const totalHits = profiles.length + forwarders.length + serviceOrders.length
    + freightShips.length + taxInvoices.length + containers.length
    + refundRequests.length + freightQuotes.length;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · U4-1 global search</p>
        <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6" /> ค้นหาทุกที่
        </h1>
        <p className="mt-1 text-sm text-muted">
          ค้นหาข้าม profiles · forwarders · service_orders · freight · tax invoices · containers · refunds · quotes
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
          (จำกัด {PER_ENTITY_LIMIT}/หมวด — "ดูเพิ่ม" เพื่อดู list หมวดนั้น)
        </p>
      )}

      {willRun && profiles.length > 0 && (
        <Section title="ลูกค้า (profiles)" count={profiles.length} moreHref={`/admin/customers?q=${encodeURIComponent(q)}`}>
          {profiles.map((p) => (
            <Link key={p.id} href={`/admin/customers/${p.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium">{customerLabel(p)}</p>
                  <p className="text-[10px] text-muted">
                    <span className="font-mono">{p.member_code ?? "—"}</span>
                    {p.phone && <> · ☎ {p.phone}</>}
                    {p.email && <> · ✉ {p.email}</>}
                  </p>
                </div>
                <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] uppercase">{p.account_type}</span>
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
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{f.status}</span>
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
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{so.status}</span>
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
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{fs.status}</span>
                <span className="text-muted">{new Date(fs.created_at).toLocaleDateString("th-TH")}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && taxInvoices.length > 0 && (
        <Section title="ใบกำกับภาษี (tax invoices)" count={taxInvoices.length} moreHref={`/admin/tax-invoices?q=${encodeURIComponent(q)}`}>
          {taxInvoices.map((ti) => (
            <Link key={ti.id} href={`/admin/tax-invoices/${ti.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{ti.invoice_no ?? "(no number)"}</span>
                <span className="font-mono">{thb(ti.total_thb)}</span>
                <span className="text-muted">{ti.issued_at ? new Date(ti.issued_at).toLocaleDateString("th-TH") : "ยังไม่ออก"}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && containers.length > 0 && (
        <Section title="ตู้คอนเทนเนอร์ (containers)" count={containers.length} moreHref={`/admin/warehouse/containers?q=${encodeURIComponent(q)}`}>
          {containers.map((c) => (
            <Link key={c.id} href={`/admin/warehouse/containers/${c.code ?? c.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{c.code ?? c.id.slice(0, 8)}</span>
                {c.legacy_container_no && <span className="text-muted text-[10px]">↳ legacy: {c.legacy_container_no}</span>}
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{c.status}</span>
                <span className="text-muted">{c.transport_mode ?? "—"}</span>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {willRun && refundRequests.length > 0 && (
        <Section title="ขอเงินคืน (refund requests)" count={refundRequests.length} moreHref={`/admin/refunds?q=${encodeURIComponent(q)}`}>
          {refundRequests.map((r) => (
            <Link key={r.id} href={`/admin/refunds/${r.id}`} className="block px-4 py-2 hover:bg-surface-alt/50 border-t border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-mono font-medium text-primary-700">{r.request_no ?? r.id.slice(0, 8)}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{r.status}</span>
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
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">{fq.status}</span>
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
