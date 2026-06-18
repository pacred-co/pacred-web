/**
 * /admin/forwarders/combine-bill/[id] — "รายละเอียดบิลรวม" (editable detail)
 *
 * Pacred re-sweep A2 #9 (2026-06-01). The legacy `forwarder-bill.php`
 * list (L57-231) only exposed a whole-bill delete + a print link per
 * row — it had NO per-bill detail page. (Its `?page=detail` mode at
 * L543-1267 is the DRIVER-RUN screen built on `tb_forwarder_driver` /
 * `tb_forwarder_driver_item` — Google-Maps routing + photo-on-delivery
 * (`fPhotoEnd` → `fStatus=7`) — which is ported separately at
 * `/admin/drivers/[id]`. `tb_bill` itself has only 4 columns
 * (`billid, date, printstatus, adminid`) — no photo / status / cascade.)
 *
 * This page is the editable per-bill view: it shows ONE bill, its
 * forwarder line items (rich data joined from `tb_forwarder`), and lets
 * staff add or remove individual forwarders + delete the whole bill, all
 * from one reachable surface (AGENTS.md §0d — the list row now links here).
 *
 * Data model (same `tb_bill` + `tb_bill_item` + `tb_forwarder` schema the
 * list + print pages read · migration 0081 · all lowercase):
 *   - HEADER = tb_bill row (billid · date · adminid)
 *   - ITEMS  = tb_bill_item.fid[] → tb_forwarder rows (tracking · consignee
 *     · ship-by carrier · box count) — column set mirrors print/page.tsx
 *
 * Auth — same gate as the list + print + delete: super/ops/warehouse/
 * accounting. The mutate actions inside the client island re-check super-
 * set roles per ADR-0002.
 *
 * AGENTS.md §0c — every Supabase query destructures `error` + throws on
 * the load-bearing reads (no silent null → 404).
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCombineBillPrintHref } from "@/lib/admin/combine-bill-urls";
import { SITE_NAME } from "@/components/seo/site";
import {
  ArrowLeft, Printer, Package, User, Calendar, UserCog,
} from "lucide-react";
import {
  AddForwardersForm,
  RemoveLineButton,
  DeleteBillButton,
} from "./edit-actions";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Legacy `nameShipBy()` (pcs-admin/include/function.php L185-242),
// same static map the print page uses (kept local — small + stable).
// ─────────────────────────────────────────────────────────────
const SHIP_BY_LABELS: Record<string, string> = {
  "1": "DHL Express", "2": "Flash Express", "3": "J.K. เอ็กซ์เพรส",
  "4": "Kerry Express", "5": "Nim Express", "8": "SCG Express",
  "11": "ไปรษณีย์ไทย", "24": "J&T Express",
  PCS: `รับเองโกดัง ${SITE_NAME}`,
  PCSE: `${SITE_NAME} Express`,
  F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: `${SITE_NAME} เหมาเหมา`,
};

function shipByLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return SHIP_BY_LABELS[code] ?? `ขนส่งรหัส ${code}`;
}

function fmtBoxes(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString("th-TH") : "0";
}

// ─────────────────────────────────────────────────────────────
// Row shapes (subset of tb_forwarder the detail table needs — mirrors
// the print page's column set so both stay in sync).
// ─────────────────────────────────────────────────────────────
type BillRow = {
  billid: number;
  date: string | null;
  printstatus: string | null;
  adminid: string | null;
};

type ForwarderLine = {
  id: number;
  fdate: string | null;
  fshipby: string | null;
  ftrackingchn: string | null;
  famount: number | string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddressprovince: string | null;
  faddresstel: string | null;
  userid: string | null;
};

export default async function CombineBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Same gate as the list/print/delete surfaces.
  const { roles } = await requireAdmin([
    "super", "ops", "warehouse", "accounting",
  ]);
  const canMutate =
    isGodRole(roles) ||
    roles.includes("ops") ||
    roles.includes("warehouse") ||
    roles.includes("accounting");

  const { id } = await params;
  const billId = Number(id);
  if (!Number.isInteger(billId) || billId <= 0) notFound();

  const admin = createAdminClient();

  // ── (1) Bill header ──────────────────────────────────────────
  const { data: billData, error: billErr } = await admin
    .from("tb_bill")
    .select("billid, date, printstatus, adminid")
    .eq("billid", billId)
    .maybeSingle<BillRow>();
  if (billErr) {
    console.error("[combine-bill/detail] tb_bill query failed", {
      billId, code: billErr.code, message: billErr.message,
    });
    throw new Error(
      `combine-bill/detail: failed to load tb_bill — ${billErr.code ?? "unknown"}: ${billErr.message}`,
    );
  }
  if (!billData) notFound();

  // ── (2) Line items (tb_bill_item.fid[]) ──────────────────────
  const { data: itemRows, error: itemErr } = await admin
    .from("tb_bill_item")
    .select("fid")
    .eq("billid", billId)
    .order("id", { ascending: true });
  if (itemErr) {
    console.error("[combine-bill/detail] tb_bill_item query failed", {
      billId, code: itemErr.code, message: itemErr.message,
    });
    throw new Error(
      `combine-bill/detail: failed to load tb_bill_item — ${itemErr.code ?? "unknown"}: ${itemErr.message}`,
    );
  }
  const fids = (itemRows ?? []).map((r) => Number(r.fid));

  // ── (3) Rich forwarder rows for the line items ───────────────
  let lines: ForwarderLine[] = [];
  if (fids.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, fdate, fshipby, ftrackingchn, famount, " +
          "faddressname, faddresslastname, faddressprovince, faddresstel, userid",
      )
      .in("id", fids);
    if (fwdErr) {
      console.error("[combine-bill/detail] tb_forwarder query failed", {
        billId, fids, code: fwdErr.code, message: fwdErr.message,
      });
      throw new Error(
        `combine-bill/detail: failed to load tb_forwarder — ${fwdErr.code ?? "unknown"}: ${fwdErr.message}`,
      );
    }
    // Preserve line-item insertion order (`in()` returns unsorted).
    const byId = new Map<number, ForwarderLine>();
    for (const f of (fwdData ?? []) as unknown as ForwarderLine[]) {
      byId.set(Number(f.id), f);
    }
    lines = fids
      .map((fid) => byId.get(fid))
      .filter((f): f is ForwarderLine => f !== undefined);
  }

  const printHref = buildCombineBillPrintHref(fids);
  const totalBoxes = lines.reduce((sum, l) => sum + Number(l.famount ?? 0), 0);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb — 2026-06-03 ภูม flag · moved to ระบบบัญชี → รายรับ */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/accounting" className="hover:text-primary-600">ระบบบัญชี</Link>
        <span>/</span>
        <span className="text-muted">รายรับ</span>
        <span>/</span>
        <Link href="/admin/forwarders/combine-bill" className="hover:text-primary-600">รวมบิลสินค้า</Link>
        <span>/</span>
        <span className="text-foreground">บิล #{billData.billid}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ระบบบัญชี · รายรับ</p>
          <h1 className="mt-1 text-2xl font-bold">รวมบิลสินค้า #{billData.billid}</h1>
          <p className="mt-1 text-sm text-muted">
            {lines.length.toLocaleString("th-TH")} รายการฝากนำเข้า · รวม {fmtBoxes(totalBoxes)} กล่อง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/forwarders/combine-bill"
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-muted hover:bg-surface-alt inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> กลับ
          </Link>
          {fids.length > 0 && (
            <a
              href={printHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100 inline-flex items-center gap-1.5"
            >
              <Printer className="h-4 w-4" aria-hidden /> พิมพ์บิลรวม
            </a>
          )}
        </div>
      </div>

      {/* Bill meta cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <p className="text-xs text-muted flex items-center gap-1.5"><Package className="h-3.5 w-3.5" aria-hidden /> billID</p>
          <p className="mt-1 text-lg font-mono font-semibold">#{billData.billid}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <p className="text-xs text-muted flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" aria-hidden /> เวลาที่รวมบิล</p>
          <p className="mt-1 text-sm font-medium">
            {billData.date
              ? new Date(billData.date).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
              : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <p className="text-xs text-muted flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5" aria-hidden /> ผู้รวมบิล</p>
          <p className="mt-1 text-sm font-mono font-medium">{billData.adminid ?? "—"}</p>
        </div>
      </div>

      {/* Line items table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">รายการฝากนำเข้าในบิลนี้</h2>
        </div>
        {lines.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📦</div>
            <p className="text-sm font-medium text-foreground">บิลนี้ยังไม่มีรายการฝากนำเข้า</p>
            <p className="text-xs text-muted">เพิ่มเลขที่ออเดอร์ด้านล่างเพื่อเริ่มรวมบิล</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">เลขออเดอร์</th>
                  <th className="px-4 py-3 whitespace-nowrap">รหัสสมาชิก</th>
                  <th className="px-4 py-3">ผู้รับ</th>
                  <th className="px-4 py-3 whitespace-nowrap">เลขแทรคกิ้ง</th>
                  <th className="px-4 py-3 whitespace-nowrap">ขนส่ง</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">กล่อง</th>
                  {canMutate && <th className="px-4 py-3 text-right whitespace-nowrap">จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const recipient = [l.faddressname, l.faddresslastname]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={l.id} className="border-t border-border align-top hover:bg-surface-alt/40">
                      <td className="px-4 py-3 text-xs font-mono font-semibold">
                        <Link
                          href={`/admin/forwarders/${l.id}`}
                          target="_blank"
                          className="text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          #{l.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {l.userid ? (
                          <Link
                            href={`/admin/customers/${l.userid}`}
                            target="_blank"
                            className="text-primary-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1"
                          >
                            <User className="h-3 w-3" aria-hidden /> {l.userid}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-medium">{recipient || "—"}</div>
                        <div className="text-muted">
                          {[l.faddressprovince, l.faddresstel].filter(Boolean).join(" · ") || ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{l.ftrackingchn || "—"}</td>
                      <td className="px-4 py-3 text-xs">{shipByLabel(l.fshipby)}</td>
                      <td className="px-4 py-3 text-xs text-right font-medium">{fmtBoxes(l.famount)}</td>
                      {canMutate && (
                        <td className="px-4 py-3 text-right">
                          <RemoveLineButton billId={billData.billid} forwarderId={l.id} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit actions (mutation roles only) */}
      {canMutate && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-2">
            <h3 className="text-sm font-semibold">เพิ่มรายการเข้าบิล</h3>
            <AddForwardersForm billId={billData.billid} />
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-red-800">ลบบิลรวม</h3>
            <p className="text-xs text-red-700/80">
              ลบทั้งบิล — ถอดทุกรายการออกจากบิลนี้ (ไม่ลบรายการฝากนำเข้าเอง) แล้วลบหัวบิล
            </p>
            <DeleteBillButton billId={billData.billid} />
          </div>
        </div>
      )}
    </main>
  );
}
