/**
 * /admin/accounting/document-history — ประวัติออกเอกสารทั้งหมด (owner 2026-06-25 · HIST lane).
 *
 * One unified, browsable history of EVERY issued document — ใบเสร็จรับเงิน
 * (tb_receipt) · ใบวางบิล (tb_forwarder_invoice) · ใบกำกับภาษี (tb_forwarder_tax_invoice
 * + tb_shop_tax_invoice) — in a date range, with tabs (ทั้งหมด/นิติ/ทั่วไป), type
 * filter, search, and a per-row "ดู/พิมพ์" link. Port of the legacy
 * "ประวัติการออกบิลฝากนำเข้า" idea, generalised across all doc types.
 *
 * Read-only · roles super | accounting (matches /receipts + /documents · ADR-0006).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentHistoryTable, type DocRow } from "./document-history-table";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

type ReceiptRow = { rid: number; userid: string | null; rdate: string | null; ramount: number | string | null; rstatus: string | null };
type BillRow = { id: number; doc_no: string | null; userid: string | null; buyer_name: string | null; date_issued: string | null; total_thb: number | string | null; is_juristic: boolean | null; status: string | null };
type TaxRow = { id: number; serial_no: string | null; userid: string | null; buyer_name: string | null; gross_before_wht: number | string | null; is_juristic: boolean | null; status: string | null; issued_at: string | null };

export default async function DocumentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const now = new Date();
  const from = isYmd(sp.from) ? sp.from : ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = isYmd(sp.to) ? sp.to : ymd(now);
  const toEnd = `${to}T23:59:59`;

  const admin = createAdminClient();
  const PER_TABLE = 2000; // per-source cap (hardening: surface if hit, never silently truncate)
  const [rcptRes, billRes, ftaxRes, staxRes] = await Promise.all([
    admin.from("tb_receipt").select("rid,userid,rdate,ramount,rstatus")
      .gte("rdate", from).lte("rdate", to).order("rdate", { ascending: false }).limit(PER_TABLE),
    admin.from("tb_forwarder_invoice").select("id,doc_no,userid,buyer_name,date_issued,total_thb,is_juristic,status")
      .gte("date_issued", from).lte("date_issued", to).order("date_issued", { ascending: false }).limit(PER_TABLE),
    admin.from("tb_forwarder_tax_invoice").select("id,serial_no,userid,buyer_name,gross_before_wht,is_juristic,status,issued_at")
      .gte("issued_at", from).lte("issued_at", toEnd).order("issued_at", { ascending: false }).limit(PER_TABLE),
    admin.from("tb_shop_tax_invoice").select("id,serial_no,userid,buyer_name,gross_before_wht,is_juristic,status,issued_at")
      .gte("issued_at", from).lte("issued_at", toEnd).order("issued_at", { ascending: false }).limit(PER_TABLE),
  ]);
  for (const [name, res] of [["receipt", rcptRes], ["bill", billRes], ["ftax", ftaxRes], ["stax", staxRes]] as const) {
    if (res.error) console.error(`[document-history ${name}] failed`, { code: res.error.code, message: res.error.message });
  }
  // Hardening (no-silent-caps · AGENTS): flag when any source hit the row cap so
  // the UI tells staff to narrow the date range instead of silently dropping docs.
  const capped = [rcptRes, billRes, ftaxRes, staxRes].some((r) => (r.data?.length ?? 0) >= PER_TABLE);

  // Resolve customer name + นิติ flag via tb_users — CHUNKED .in() (hardening: a
  // wide range could collect thousands of ids → a single .in() blows the URL limit).
  const userids = Array.from(new Set([
    ...((rcptRes.data ?? []) as ReceiptRow[]).map((r) => r.userid),
    ...((billRes.data ?? []) as BillRow[]).map((r) => r.userid),
    ...((ftaxRes.data ?? []) as TaxRow[]).map((r) => r.userid),
    ...((staxRes.data ?? []) as TaxRow[]).map((r) => r.userid),
  ].filter((u): u is string => !!u)));
  const userMap = new Map<string, { name: string; juristic: boolean }>();
  for (let i = 0; i < userids.length; i += 300) {
    const chunk = userids.slice(i, i + 300);
    const { data: us, error: usErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany")
      .in("userID", chunk);
    if (usErr) { console.error("[document-history tb_users] failed", { code: usErr.code, message: usErr.message }); continue; }
    for (const u of (us ?? []) as { userID: string; userName: string | null; userLastName: string | null; userCompany: string | null }[]) {
      userMap.set(u.userID, { name: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim(), juristic: u.userCompany === "1" });
    }
  }
  const custName = (uid: string | null, fb?: string | null) =>
    (uid ? userMap.get(uid)?.name : "") || (fb ?? "") || (uid ?? "—");
  const custJur = (uid: string | null, fb?: boolean | null) =>
    (uid ? userMap.get(uid)?.juristic : undefined) ?? !!fb;

  const rows: DocRow[] = [];
  for (const r of (rcptRes.data ?? []) as ReceiptRow[]) {
    rows.push({
      kind: "receipt", kindLabel: "ใบเสร็จรับเงิน", docNo: String(r.rid),
      dateISO: (r.rdate ?? "").slice(0, 10), amount: Number(r.ramount ?? 0),
      userid: r.userid ?? "", customerName: custName(r.userid), isJuristic: custJur(r.userid),
      status: String(r.rstatus ?? ""), viewHref: `/service-import/receipts/print?id=${r.rid}`,
    });
  }
  for (const r of (billRes.data ?? []) as BillRow[]) {
    rows.push({
      kind: "bill", kindLabel: "ใบวางบิล", docNo: r.doc_no ?? String(r.id),
      dateISO: (r.date_issued ?? "").slice(0, 10), amount: Number(r.total_thb ?? 0),
      userid: r.userid ?? "", customerName: custName(r.userid, r.buyer_name), isJuristic: custJur(r.userid, r.is_juristic),
      status: String(r.status ?? ""), viewHref: `/admin/billing-run/${r.id}`,
    });
  }
  for (const r of [...((ftaxRes.data ?? []) as TaxRow[]), ...((staxRes.data ?? []) as TaxRow[])]) {
    rows.push({
      kind: "tax", kindLabel: "ใบกำกับภาษี", docNo: r.serial_no ?? `TI-${r.id}`,
      dateISO: (r.issued_at ?? "").slice(0, 10), amount: Number(r.gross_before_wht ?? 0),
      userid: r.userid ?? "", customerName: custName(r.userid, r.buyer_name), isJuristic: custJur(r.userid, r.is_juristic),
      status: String(r.status ?? ""), viewHref: `/admin/accounting/etax`,
    });
  }
  rows.sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  return <DocumentHistoryTable rows={rows} from={from} to={to} capped={capped} perTable={PER_TABLE} />;
}
