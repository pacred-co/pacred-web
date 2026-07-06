/* eslint-disable @next/next/no-img-element */
/**
 * /admin/forwarders/[fNo]/receive-bill — พิมพ์บิลรับสินค้า (China warehouse
 * goods-receiving slip) · พี่ป๊อป spec 2026-07-06 · TASK #8 (BUILD-PLAN item 8).
 *
 * What this is (SPEC §4 · 01-status-logic lines 34-72):
 *   "ออกบิลรับสินค้า (China warehouse)" = the slip the จีน warehouse prints when
 *   it receives a customer's goods. Once printed + signed + photographed the
 *   parcel is marked = "ถึงโกดังจีนแล้ว". Owner's field list:
 *     • SM auto + barcode/QR       → the forwarder id (SM) auto + Code128 + QR
 *     • รหัสสมาชิก PR…             → tb_forwarder.userid (member code)
 *     • ประเภทขนส่ง เรือ/รถ/แอร์   → resolveTransportMode(cabinet, ftransporttype)
 *     • วันที่รับสินค้า            → fdatestatus2 (ถึงโกดังจีน) · today fallback
 *     • จำนวนกล่อง                → tb_forwarder.famount
 *     • เบอร์ผู้ส่งสินค้า          → customer tel pre-fill + a write-in line
 *     • เซ็นรับ + ชื่อคนส่ง        → blank sign box (warehouse fills by hand)
 *     • ถ่ายภาพสินค้า             → blank photo box (staff stamps/attaches photo)
 *
 * DISPLAY / PRINT-ONLY. No data mutation, no money, no status logic. The
 * "ถึงโกดังจีนแล้ว" flip (fstatus '2') already happens via the MOMO API / the
 * handheld scan — this route only renders the physical slip. It reads the SAME
 * tb_forwarder row + tb_users customer + the MOMO cabinet the detail page reads.
 *
 * Reachable from: the forwarder detail header (/admin/forwarders/[fNo]) via the
 * "🖨 พิมพ์บิลรับสินค้า" button (§0d · 1 click from the order).
 *
 * Barcode/QR: local `lib/barcode.ts` (Code128 · no external request) + `qrcode`
 * (QR → data URL), the same pipeline /admin/forwarders/print uses.
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { code128SvgDataUrl } from "@/lib/barcode";
import { resolveTransportMode, type TransportMode } from "@/lib/forwarder/cabinet-transport";
import { formatThaiDate } from "@/lib/utils/thai-datetime";
import { SITE_URL, SITE_LEGAL_NAME_TH, SITE_NAME, LOGO_PATH, CONTACT } from "@/components/seo/site";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Transport label — mode ("1"|"2"|"3") → Thai ประเภทขนส่ง.
// Owner's field is "ประเภทขนส่ง เรือ/รถ/แอร์"; cabinet-transport.ts decodes the
// canonical mode from the cabinet name (name wins over the stored type).
// ─────────────────────────────────────────────────────────────
const TRANSPORT_LABEL: Record<TransportMode, string> = {
  "1": "ทางรถ",
  "2": "ทางเรือ",
  "3": "ทางอากาศ",
};

// ─────────────────────────────────────────────────────────────
// QR data-url helper — same options lib/promptpay.ts + the print label use.
// ─────────────────────────────────────────────────────────────
async function qr(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, scale: 6 });
}

type ForwarderRow = {
  id: number;
  fidorco: string | null;
  userid: string;
  fstatus: string;
  fdatestatus2: string | null;
  ftransporttype: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingchn2: string | null;
  fweight: number | null;
  fvolume: number | null;
  famount: number | null;
  fnote: string | null;
};

type CustomerRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userCompany: string | null;
};

// ─────────────────────────────────────────────────────────────
// Number formatter — mirror legacy PHP number_format().
// ─────────────────────────────────────────────────────────────
function fmt(n: number | string | null | undefined, decimals: number = 0): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default async function ChinaReceiveBillPage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  // Same reach as the label print + forwarder detail. Warehouse (จีน) staff is
  // the primary consumer; super/ops/accounting can also print for reference.
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const admin = createAdminClient();
  const { fNo } = await params;

  // Resolve by numeric id OR the fidorco order-code (same lookup as [fNo]/page).
  const asNumber = Number(fNo);
  const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

  let q = admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, userid, fstatus, fdatestatus2, ftransporttype, fcabinetnumber, " +
        "ftrackingchn, ftrackingchn2, fweight, fvolume, famount, fnote",
    )
    .limit(1);
  q = isId ? q.eq("id", asNumber) : q.eq("fidorco", fNo);
  const { data: row, error: rowErr } = await q.maybeSingle<ForwarderRow>();
  if (rowErr) {
    console.error("[receive-bill] tb_forwarder lookup failed", {
      code: rowErr.code,
      message: rowErr.message,
    });
  }
  if (!row) notFound();

  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userCompany")
    .eq("userID", row.userid)
    .maybeSingle<CustomerRow>();
  if (userErr) {
    console.error("[receive-bill] tb_users lookup failed", {
      code: userErr.code,
      message: userErr.message,
    });
  }

  const orderNo = String(row.fidorco ?? row.id);
  const tracking = (row.ftrackingchn ?? "").trim();
  const mode = resolveTransportMode(row.fcabinetnumber, row.ftransporttype);
  const transportLabel = TRANSPORT_LABEL[mode];

  // วันที่รับสินค้า = fdatestatus2 (ถึงโกดังจีน) when present, else today (the slip
  // is printed AT receiving, so today is the natural default for a not-yet-flipped
  // row).
  const receiveDate = formatThaiDate(row.fdatestatus2 ?? new Date());

  const customerName = [userRow?.userName ?? "", userRow?.userLastName ?? ""]
    .join(" ")
    .trim();
  const customerTel = (userRow?.userTel ?? "").trim();

  // Barcode = the SM (forwarder id/order code) so the จีน warehouse scanner can
  // pull the row back up; QR = the admin order page for a phone scan. A tracking
  // barcode is also shown when the tracking code is Code128-safe.
  const smBarcode = code128SvgDataUrl(orderNo);
  const trackingBarcode = tracking ? code128SvgDataUrl(tracking) : null;
  const orderQr = await qr(`${SITE_URL}/admin/forwarders/${row.id}`);

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900 print:bg-white print:p-0">
      {/* ── screen-only toolbar ── */}
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/forwarders/${row.id}`}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← กลับหน้าออเดอร์
          </Link>
          <span className="text-sm text-gray-500">
            บิลรับสินค้า (โกดังจีน) · ออเดอร์ #{orderNo}
          </span>
        </div>
        <PrintButton label="🖨 พิมพ์บิลรับสินค้า" />
      </div>

      {/* ── A5-landscape receiving slip ── */}
      <div className="mx-auto max-w-[210mm] bg-white p-6 shadow-sm print:max-w-none print:p-4 print:shadow-none">
        {/* header: logo + company + doc title + SM barcode/QR */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-3">
          <div className="flex items-start gap-3">
            <img src={LOGO_PATH} alt={SITE_NAME} className="h-12 w-auto" />
            <div>
              <p className="text-base font-bold text-gray-900">{SITE_LEGAL_NAME_TH}</p>
              <p className="text-xs text-gray-600">
                โกดังจีน · โทร. {CONTACT.phoneCompanyDisplay}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-extrabold tracking-wide text-gray-900">
              บิลรับสินค้า
            </p>
            <p className="text-[11px] text-gray-500">China Warehouse — Goods Received</p>
            <p className="mt-1 text-sm font-semibold text-gray-800">
              SM #<span className="font-mono">{orderNo}</span>
            </p>
          </div>
        </div>

        {/* SM barcode + order QR strip */}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {smBarcode ? (
              <img src={smBarcode} alt={orderNo} className="h-12 w-auto max-w-full" />
            ) : (
              <p className="font-mono text-lg font-bold">{orderNo}</p>
            )}
            <p className="mt-0.5 text-center font-mono text-xs text-gray-600">SM {orderNo}</p>
          </div>
          <div className="shrink-0 text-center">
            <img src={orderQr} alt="QR" className="h-20 w-20" />
            <p className="text-[10px] text-gray-500">สแกนดูออเดอร์</p>
          </div>
        </div>

        {/* main fields grid */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field label="รหัสสมาชิก">
            <span className="font-mono text-base font-bold text-red-600">{row.userid}</span>
          </Field>
          <Field label="ประเภทขนส่ง">
            <span className="font-semibold">{transportLabel}</span>
            <span className="ml-2 text-xs text-gray-500">(เรือ / รถ / แอร์)</span>
          </Field>

          <Field label="ชื่อลูกค้า">{customerName || "—"}</Field>
          <Field label="วันที่รับสินค้า">
            <span className="font-semibold">{receiveDate}</span>
          </Field>

          <Field label="จำนวนกล่อง">
            <span className="text-base font-bold">{fmt(row.famount)}</span> กล่อง
          </Field>
          <Field label="น้ำหนัก / คิว">
            {fmt(row.fweight, 2)} กก. · {fmt(row.fvolume, 4)} คิว
          </Field>

          <Field label="เลขแทรคกิ้งจีน">
            <span className="break-all font-mono">{tracking || "—"}</span>
          </Field>
          <Field label="เลขตู้">
            <span className="font-mono">{row.fcabinetnumber || "—"}</span>
          </Field>
        </div>

        {/* tracking barcode (when Code128-safe) */}
        {trackingBarcode && (
          <div className="mt-3 border-t border-dashed border-gray-300 pt-2">
            <p className="text-[11px] text-gray-500">บาร์โค้ดแทรคกิ้ง</p>
            <img src={trackingBarcode} alt={tracking} className="h-10 w-auto max-w-full" />
          </div>
        )}

        {/* เบอร์ผู้ส่งสินค้า — pre-fill customer tel + a write-in line for the
            actual sender the warehouse takes at the counter. */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-[11px] text-gray-500">เบอร์ผู้ส่งสินค้า</p>
            <div className="mt-1 border-b border-gray-400 pb-1 font-mono">
              {customerTel || " "}
            </div>
            <p className="mt-0.5 text-[10px] text-gray-400">
              (เบอร์ลูกค้าในระบบ — แก้เป็นเบอร์ผู้ส่งจริงได้)
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">หมายเหตุ</p>
            <div className="mt-1 min-h-[1.5rem] border-b border-gray-400 pb-1">
              {(row.fnote ?? "").trim() || " "}
            </div>
          </div>
        </div>

        {/* sign + photo boxes (filled by hand at the warehouse) */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-400 p-3">
            <p className="text-xs font-semibold text-gray-700">ถ่ายภาพสินค้า</p>
            <div className="mt-1 flex h-28 items-center justify-center rounded border border-dashed border-gray-300 text-[11px] text-gray-400">
              (แนบ/ประทับรูปสินค้าที่รับ)
            </div>
          </div>
          <div className="rounded-lg border border-gray-400 p-3">
            <p className="text-xs font-semibold text-gray-700">เซ็นรับสินค้า</p>
            <div className="mt-6 border-b border-gray-500 pb-1" />
            <p className="mt-1 text-center text-[11px] text-gray-500">
              ลงชื่อผู้รับ (โกดังจีน)
            </p>
            <div className="mt-4 border-b border-gray-500 pb-1" />
            <p className="mt-1 text-center text-[11px] text-gray-500">ชื่อผู้ส่งสินค้า</p>
          </div>
        </div>

        {/* footer note */}
        <p className="mt-4 text-center text-[11px] text-gray-500">
          พิมพ์จากระบบ {SITE_NAME} · บิลรับสินค้าโกดังจีน — เมื่อเซ็นรับ + ถ่ายรูปครบ =
          ถึงโกดังจีนแล้ว
        </p>
      </div>

      {/* print rules — A5 landscape, one slip per page */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { @page { size: A5 landscape; margin: 8mm; } }`,
        }}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Field — a compact label/value pair used across the slip grid.
// ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-gray-900">{children}</p>
    </div>
  );
}
