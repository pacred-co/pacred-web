/* eslint-disable @next/next/no-img-element */
/**
 * /admin/forwarders/print — box label (พิมพ์จากหน้ากล่อง) + address label
 * (พิมพ์ที่อยู่ส่งสินค้า) · Wave 30.6
 *
 * Faithful port of legacy `pcs-admin/printAll.php` case "1" (box) + case "4"
 * (address). Legacy rendered mPDF 100×75 mm labels; we render HTML labels
 * sized via `@page { size: 100mm 75mm }` + `window.print()` — the same
 * browser-print path as the existing combine-bill/print precedent. Each
 * label repeats `famount` times (one sticker per physical box), min 1.
 *
 * URL contract (mirrors legacy printAll.php?type=1|4&id[]=…):
 *   /admin/forwarders/print?type=box&id[]=51967&id[]=51968
 *   /admin/forwarders/print?type=address&id[]=51967
 *   (legacy numeric type=1 / type=4 also accepted for safety)
 *
 * The "พิมพ์แล้ว" audit flag (printStatus1 / printStatus4) is written by the
 * `markForwarderPrinted()` Server Action — the list-page print buttons call
 * it BEFORE window.open()-ing this route, so the flag write and the render
 * are decoupled (re-opening this URL never re-toggles the flag).
 *
 * BOX label (case "1") — legacy printAll.php L17-236:
 *   shows the customer member code (userID) ONLY + 3 QR codes
 *   (detail · gateway-pickup · tracking) + weight / total-CBM / qty / location.
 *   It does NOT print the ship-to address (legacy SELECTed it but never
 *   rendered it on the box sticker).
 *
 *   TRACKING BARCODE — faithful to legacy L162-175:
 *     `preg_match('/^[A-Z0-9-]+$/', fTrackingCHN)` true  → Code128A barcode
 *     with human-readable text + a separate tracking QR (both shown).
 *                                                  false → tracking QR only
 *     (no barcode).
 *   Code128 is rendered via `bwip-js/node` → SVG data URL (vector for crisp
 *   print at 100mm; no native canvas dep on Vercel).
 *
 * ADDRESS label (case "4") — legacy printAll.php L237-426:
 *   shows userID + full ship-to address + address note + carrier name + qty.
 *   It has NO barcode/QR (the legacy case-4 body renders none).
 *
 * Legacy source: D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\printAll.php
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import bwipjs from "bwip-js/node";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { SITE_URL, SITE_NAME, LOGO_PATH, SITE_LEGAL_NAME_TH, CONTACT, ADDRESSES } from "@/components/seo/site";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { loadCustomerPrimaryAddress, loadJuristicCorporateAddress } from "@/lib/legacy/customer-address-options";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// URL parsing — Next 16 searchParams is a Promise; for `?id[]=1&id[]=2`
// Next coalesces duplicate keys into an array under the bracket-less name
// `id`. Accept THREE shapes since callers may construct any of them:
//   ?id[]=1&id[]=2        → legacy printAll.php emits this; Next surfaces it as sp["id[]"]
//   ?id=1&id=2            → bracket-less duplicate keys; Next coalesces to sp.id array
//   ?ids=1,2,3            → comma-joined single param (compact for long lists / Excel-paste)
// ─────────────────────────────────────────────────────────────
type SP = {
  type?: string | string[];
  id?: string | string[];
  ids?: string | string[];
  "id[]"?: string | string[];
};

function extractForwarderIds(sp: SP): number[] {
  // Collect every candidate string token from all 3 supported shapes.
  const tokens: string[] = [];
  const push = (v: string | string[] | undefined) => {
    if (v === undefined) return;
    if (Array.isArray(v)) tokens.push(...v);
    else tokens.push(v);
  };
  push(sp["id[]"]);
  push(sp.id);
  push(sp.ids);

  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of tokens) {
    // ?ids=1,2,3 → split on comma (also tolerate whitespace).
    for (const piece of String(raw).split(/[\s,]+/)) {
      if (!piece) continue;
      const n = Number(piece);
      if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

type LabelType = "box" | "address";

function parseLabelType(sp: SP): LabelType {
  const raw = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  // address = legacy case "4"; everything else falls back to box (case "1").
  if (raw === "address" || raw === "4") return "address";
  return "box";
}

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

// ─────────────────────────────────────────────────────────────
// PCSFAM derivation (legacy printAll.php L40-49 / L260-269) — the shared
// family account renders the real sub-account derived from the secondary
// tracking string's "FAM" marker. PCS→PR rebrand means the live token could
// be PCSFAM or PRFAM; handle both.
// ─────────────────────────────────────────────────────────────
function displayBoxUserId(userid: string, trackingChn2: string | null): string {
  if (userid === "PCSFAM" || userid === "PRFAM") {
    if (trackingChn2 && trackingChn2.includes("FAM")) {
      return trackingChn2.slice(trackingChn2.indexOf("FAM"));
    }
    return "FAM";
  }
  return userid;
}

function isFamilyAccount(userid: string): boolean {
  return userid === "PCSFAM" || userid === "PRFAM";
}

// ─────────────────────────────────────────────────────────────
// Full ship-to address (legacy printAll.php CONCAT, case "4"):
//   คุณ {name} {lastname} {no} ตำบล/แขวง {sub} อำเภอ/เขต {dist}
//   จังหวัด {prov} {zip} โทร. {tel}, {tel2}
// (legacy had a stray double-space before อำเภอ — we use clean single spacing.)
// ─────────────────────────────────────────────────────────────
function buildFullAddress(r: ForwarderRow): string {
  const parts = [
    `คุณ ${r.faddressname ?? ""} ${r.faddresslastname ?? ""}`.trim(),
    (r.faddressno ?? "").trim(),
    r.faddresssubdistrict ? `ตำบล/แขวง ${r.faddresssubdistrict}` : "",
    r.faddressdistrict ? `อำเภอ/เขต ${r.faddressdistrict}` : "",
    r.faddressprovince ? `จังหวัด ${r.faddressprovince}` : "",
    (r.faddresszipcode ?? "").trim(),
  ].filter((s) => s.trim().length > 0);
  let s = parts.join(" ");
  const tels = [r.faddresstel, r.faddresstel2]
    .filter((t): t is string => Boolean(t && t.trim().length > 0))
    .map((t) => t.trim());
  if (tels.length > 0) s += ` โทร. ${tels.join(", ")}`;
  return s;
}

// ─────────────────────────────────────────────────────────────
// Effective ship-to (ภูม 2026-06-26) — mirror the [fNo] detail page (L399-444):
// a DELIVERY order whose stored faddress is the warehouse default
// ("รับที่โกดัง Pacred" / empty) prints the customer's saved primary address
// (tb_address) — or, for a juristic customer, the company address — instead of
// the placeholder. A real custom faddress is respected as-is. Self-pickup (PCS)
// keeps the warehouse address (the customer collects there).
// ─────────────────────────────────────────────────────────────
type ResolvedShipTo = { fullAddress: string; note: string | null; fromProfile: boolean };

async function resolveShipTo(
  admin: ReturnType<typeof createAdminClient>,
  f: ForwarderRow,
): Promise<ResolvedShipTo> {
  const isSelfPickup = (f.fshipby ?? "").trim() === "PCS";
  const warehouseDefault =
    !(f.faddressname ?? "").trim() ||
    /รับที่โกดัง|โกดัง\s*pacred/i.test(f.faddressname ?? "");
  if (!isSelfPickup && warehouseDefault) {
    const primary = await loadCustomerPrimaryAddress(admin, f.userid);
    if (primary && (primary.no.trim() || primary.province.trim())) {
      const parts = [
        `คุณ ${primary.name} ${primary.lastname}`.trim(),
        primary.no.trim(),
        primary.subdistrict ? `ตำบล/แขวง ${primary.subdistrict}` : "",
        primary.district ? `อำเภอ/เขต ${primary.district}` : "",
        primary.province ? `จังหวัด ${primary.province}` : "",
        primary.zipcode.trim(),
      ].filter((s) => s.trim().length > 0);
      let s = parts.join(" ");
      const tels = [primary.tel, primary.tel2]
        .filter((t): t is string => Boolean(t && t.trim().length > 0))
        .map((t) => t.trim());
      if (tels.length > 0) s += ` โทร. ${tels.join(", ")}`;
      return { fullAddress: s, note: primary.note?.trim() || null, fromProfile: true };
    }
    const corp = await loadJuristicCorporateAddress(admin, f.userid);
    if (corp) {
      return { fullAddress: `${corp.name} ${corp.addressLine}`.trim(), note: null, fromProfile: true };
    }
  }
  return { fullAddress: buildFullAddress(f), note: f.faddressnote?.trim() || null, fromProfile: false };
}

// QR data-url helper — same options lib/promptpay.ts uses.
async function qr(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, scale: 6 });
}

// ─────────────────────────────────────────────────────────────
// Code128 SVG data-url — faithful to legacy printAll.php L162-175.
// Legacy: `preg_match('/^[A-Z0-9-]+$/', $row["fTrackingCHN"])`
//   true  → mPDF `<barcode type="C128A" text="1">` (with human-readable text)
//   false → caller falls back to QR-only (no barcode)
// We render as SVG (vector → crisp print at 100mm scale; no native canvas dep
// → safe on Vercel serverless) embedded as a base64 data URL so the existing
// `<img src=…>` pipeline stays identical to QR rendering.
// ─────────────────────────────────────────────────────────────
const CODE128_FRIENDLY = /^[A-Z0-9-]+$/;

function tryRenderCode128(text: string): string | null {
  try {
    const svg = bwipjs.toSVG({
      bcid: "code128",
      text,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: "center",
      textsize: 9,
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
  } catch (e) {
    // Defensive — bwip-js throws on unencodable chars, but the regex above
    // guarantees [A-Z0-9-] which Code128 always accepts. Log + return null so
    // the label still renders (without the barcode) rather than 500-ing.
    console.error("[forwarders/print] Code128 render failed", {
      text,
      message: (e as Error).message,
    });
    return null;
  }
}

// Clamp copies-per-item so a bad `famount` can't render thousands of pages.
const MAX_COPIES_PER_ITEM = 99;

function copyCount(famount: number | string | null | undefined): number {
  const n = Math.floor(Number(famount) || 1);
  return Math.min(MAX_COPIES_PER_ITEM, Math.max(1, n));
}

// ─────────────────────────────────────────────────────────────
// Data row shape (mapped to ported tb_forwarder schema)
// ─────────────────────────────────────────────────────────────
type ForwarderRow = {
  id: number;
  userid: string;
  ftrackingchn: string | null;
  ftrackingchn2: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | string | null;
  fpallet: string | null;
  fshipby: string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddressno: string | null;
  faddresssubdistrict: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
  faddresstel: string | null;
  faddresstel2: string | null;
  faddressnote: string | null;
};

type BoxQr = { detail: string; gateway: string; tracking: string | null };

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default async function ForwarderLabelPrintPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Same gate as the combine-bill print + list page. Warehouse staff is the
  // primary consumer (they stick these labels on boxes).
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const sp = await searchParams;
  const ids = extractForwarderIds(sp);
  const labelType = parseLabelType(sp);
  const typeLabel = labelType === "box" ? "ป้ายหน้ากล่อง" : "ป้ายที่อยู่ส่งสินค้า";

  if (ids.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <h1 className="mb-2 text-xl font-bold text-amber-900">
              📋 หน้านี้พิมพ์ป้ายสติกเกอร์ — ต้องเลือกรายการก่อน
            </h1>
            <p className="text-sm text-amber-900">
              หน้านี้สร้างป้ายสติกเกอร์ฉลาก 100×150 มม. (พิมพ์แนวนอน) สำหรับติดบนกล่องพัสดุ
              (พิมพ์จากหน้ากล่อง) หรือใช้เป็นป้ายที่อยู่ส่งสินค้า — ไม่ใช่หน้าที่เปิดตรงๆ
              แต่ต้องเลือกรายการจากหน้ารายการพัสดุก่อน
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-gray-900">วิธีพิมพ์</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
              <li>
                เปิด{" "}
                <Link
                  href="/admin/forwarders"
                  className="font-semibold text-primary-600 hover:underline"
                >
                  รายการพัสดุ
                </Link>
              </li>
              <li>
                ติ๊กเลือกแถวที่ต้องการพิมพ์ (ติ๊กหลายแถวพิมพ์รวมเป็นชุดเดียวได้)
              </li>
              <li>
                ปุ่มจะโผล่ขึ้นที่แถบดำด้านล่างจอ — กด{" "}
                <span className="rounded bg-primary-100 px-2 py-0.5 font-semibold text-primary-700">
                  🖨 พิมพ์จากหน้ากล่อง
                </span>{" "}
                หรือ{" "}
                <span className="rounded bg-primary-100 px-2 py-0.5 font-semibold text-primary-700">
                  🏷 พิมพ์ที่อยู่ส่งสินค้า
                </span>
              </li>
              <li>หน้าพิมพ์จะเปิดขึ้นเป็นแท็บใหม่ → กด &quot;พิมพ์ป้าย&quot; หรือ Ctrl+P</li>
            </ol>

            <p className="mt-4 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
              💡 หรือถ้าจะลิงก์ URL ตรงๆ ใช้รูปแบบ:{" "}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
                /admin/forwarders/print?type=box&amp;id[]=51967&amp;id[]=51968
              </code>{" "}
              (รองรับ <code>id[]=</code>, <code>id=</code>, และ <code>ids=1,2,3</code>)
            </p>
          </div>

          <Link
            href="/admin/forwarders"
            className="inline-flex items-center rounded-md bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            ← ไปหน้ารายการพัสดุ
          </Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();

  // ── Load all forwarder rows (legacy printAll.php SELECT) ── §0c: throw on error.
  const { data: forwardersData, error: fErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, ftrackingchn, ftrackingchn2, fweight, fvolume, famount, fpallet, fshipby, " +
        "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
        "faddressdistrict, faddressprovince, faddresszipcode, " +
        "faddresstel, faddresstel2, faddressnote",
    )
    .in("id", ids);

  if (fErr) {
    console.error("[forwarders/print] tb_forwarder query failed", {
      ids,
      labelType,
      code: fErr.code,
      message: fErr.message,
    });
    throw new Error(
      `forwarders/print: failed to load tb_forwarder — ${fErr.code ?? "unknown"}: ${fErr.message}`,
    );
  }

  const forwarders = (forwardersData ?? []) as unknown as ForwarderRow[];
  if (forwarders.length === 0) notFound();

  // Preserve URL order — `in()` returns unsorted.
  const byId = new Map<number, ForwarderRow>();
  for (const f of forwarders) byId.set(Number(f.id), f);
  const orderedForwarders = ids
    .map((id) => byId.get(id))
    .filter((f): f is ForwarderRow => f !== undefined);

  if (orderedForwarders.length === 0) notFound();

  // ── Pre-generate QR codes + Code128 barcodes per forwarder (box label only) ──
  // Legacy printAll.php L162-175 dispatches: regex-match → Code128 + QR; else → QR only.
  const qrMap = new Map<number, BoxQr>();
  const barcodeMap = new Map<number, string | null>();
  if (labelType === "box") {
    for (const f of orderedForwarders) {
      const detailUrl = `${SITE_URL}/admin/forwarders/${f.id}`;
      const gatewayUrl = f.ftrackingchn
        ? `${SITE_URL}/admin/barcode/gateway?type=all&device=scanner&tracking=${encodeURIComponent(f.ftrackingchn)}`
        : detailUrl;
      const [detail, gateway, tracking] = await Promise.all([
        qr(detailUrl),
        qr(gatewayUrl),
        f.ftrackingchn ? qr(f.ftrackingchn) : Promise.resolve<string | null>(null),
      ]);
      qrMap.set(f.id, { detail, gateway, tracking });

      // Code128 only when the tracking string is Code128-A friendly
      // (uppercase / digits / dash) — same gate as legacy preg_match.
      const chn = f.ftrackingchn;
      barcodeMap.set(
        f.id,
        chn && CODE128_FRIENDLY.test(chn) ? tryRenderCode128(chn) : null,
      );
    }
  }

  // Resolve the effective ship-to per row for the ADDRESS label (ภูม 2026-06-26):
  // a delivery order on the warehouse placeholder gets the customer's real saved
  // address instead of printing "รับที่โกดัง Pacred".
  const addrMap = new Map<number, ResolvedShipTo>();
  if (labelType === "address") {
    await Promise.all(
      orderedForwarders.map(async (f) => {
        addrMap.set(f.id, await resolveShipTo(admin, f));
      }),
    );
  }

  const totalLabels = orderedForwarders.reduce((s, f) => s + copyCount(f.famount), 0);

  return (
    <div className="bg-white text-black min-h-screen">
      <style>{`
        /* The physical label stock is 100mm WIDE × 150mm TALL (portrait feed on
           the ES-9910UB 4" thermal head). The label READS landscape, so the
           content is a 150×100 landscape box (.label-rot) that prints ROTATED 90°
           to fit the 100×150 portrait page — and shows UPRIGHT on screen. */
        .label-page {
          background: #fff;
          color: #000;
          overflow: hidden;
        }
        .label-rot {
          width: 150mm;
          height: 100mm;
          box-sizing: border-box;
          padding: 3.5mm;
          background: #fff;
          color: #000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        @media screen {
          .label-page {
            width: 150mm;
            height: 100mm;
            border: 1px dashed #cbd5e1;
            margin: 0 auto 6mm;
            box-shadow: 0 1px 4px rgba(0,0,0,.08);
          }
        }
        @media print {
          aside, .no-print { display: none !important; }
          html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
          .label-page {
            position: relative;
            width: 100mm;
            height: 150mm;
            max-height: 150mm;
            overflow: hidden;
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .label-rot {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(90deg);
          }
          .label-page:last-child { break-after: auto; page-break-after: auto; }
        }
        @page { size: 100mm 150mm; margin: 0; }
      `}</style>

      {/* On-screen toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/admin/forwarders" className="text-primary-600 hover:underline">
            ← กลับไปรายการพัสดุ
          </Link>
          <span className="text-xs text-gray-500">
            {typeLabel} · {orderedForwarders.length} รายการ · {totalLabels} ป้าย
          </span>
        </div>
        <div className="flex gap-2">
          <PrintButton label="🖨 พิมพ์ป้าย / Save PDF" />
        </div>
      </div>

      <main className="py-6">
        {labelType === "box"
          ? // ── BOX LABEL (legacy case "1") ──
            orderedForwarders.flatMap((f) => {
              const copies = copyCount(f.famount);
              const q = qrMap.get(f.id);
              const barcode = barcodeMap.get(f.id) ?? null;
              const displayUser = displayBoxUserId(f.userid, f.ftrackingchn2);
              const showLogo = !isFamilyAccount(f.userid);
              const totalVolume = Number(f.fvolume ?? 0) * Number(f.famount ?? 1);
              return Array.from({ length: copies }).map((_, copy) => (
                <div key={`box-${f.id}-${copy}`} className="label-page">
                  <div className="label-rot">
                  {/* Row 1 — id badge + logo · detail QR */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {showLogo && (
                        <img src={LOGO_PATH} alt={SITE_NAME} className="h-[6mm] w-auto shrink-0" />
                      )}
                      <span className="rounded bg-gray-300 px-2 py-0.5 text-[3mm] font-bold leading-tight text-black">
                        เลขที่ #{f.id}
                      </span>
                    </div>
                    {q && (
                      <img src={q.detail} alt="QR" className="h-[20mm] w-[20mm] shrink-0" />
                    )}
                  </div>

                  <hr className="my-[2.5mm] border-gray-400" />

                  {/* Row 2 — TO + customer member code (large) */}
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black px-2 py-0.5 text-[3mm] font-bold leading-tight text-white">
                      ถึง / TO
                    </span>
                    <span className="truncate text-[13mm] font-black leading-none tracking-tight">
                      {displayUser}
                    </span>
                  </div>

                  <hr className="my-[2.5mm] border-gray-400" />

                  {/* Row 3 — tracking text + (optional Code128) + tracking QR
                      Faithful to legacy printAll.php L162-175:
                      regex-match → Code128 with human-readable text + QR alongside
                      else        → text + QR only (no barcode) */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[2.6mm] leading-tight text-gray-600">เลขแทรคกิ้ง</p>
                      <p
                        className={`break-all leading-tight ${
                          barcode ? "text-[3mm] font-semibold" : "text-[4mm] font-bold"
                        }`}
                      >
                        {f.ftrackingchn || "—"}
                      </p>
                      {barcode && (
                        <img
                          src={barcode}
                          alt="tracking barcode"
                          className="mt-[0.5mm] h-[9mm] w-auto max-w-full"
                        />
                      )}
                    </div>
                    {q?.tracking && (
                      <img
                        src={q.tracking}
                        alt="tracking QR"
                        className={`shrink-0 ${barcode ? "h-[11mm] w-[11mm]" : "h-[13mm] w-[13mm]"}`}
                      />
                    )}
                  </div>

                  <hr className="my-[2.5mm] border-gray-400" />

                  {/* Row 4 — gateway-pickup QR · weight / volume / qty / location */}
                  <div className="mt-auto flex items-end justify-between gap-2">
                    {q && (
                      <img
                        src={q.gateway}
                        alt="gateway QR"
                        className="h-[22mm] w-[22mm] shrink-0"
                      />
                    )}
                    <div className="text-right text-[5mm] leading-snug">
                      <p>น้ำหนัก : {fmt(f.fweight, 2)} kg.</p>
                      <p>ปริมาตรรวม : {fmt(totalVolume, 3)} CBM</p>
                      <p className="font-bold">จำนวน : {fmt(f.famount, 0)} กล่อง</p>
                      <p>location : {f.fpallet || "—"}</p>
                    </div>
                  </div>
                  </div>
                </div>
              ));
            })
          : // ── ADDRESS LABEL (legacy case "4") — no barcode/QR ──
            orderedForwarders.flatMap((f) => {
              const copies = copyCount(f.famount);
              const showLogo = !isFamilyAccount(f.userid);
              const displayUser = displayBoxUserId(f.userid, f.ftrackingchn2);
              const resolved = addrMap.get(f.id);
              const fullAddress = resolved?.fullAddress ?? buildFullAddress(f);
              const addrNote = resolved?.note ?? null;
              return Array.from({ length: copies }).map((_, copy) => (
                <div key={`addr-${f.id}-${copy}`} className="label-page">
                  <div className="label-rot">
                  {/* Row 1 — ผู้ส่ง/FROM (Pacred company · ภูม 2026-06-26) · id + tracking */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1 min-w-0">
                      {showLogo && (
                        <img src={LOGO_PATH} alt={SITE_NAME} className="h-[7mm] w-auto shrink-0" />
                      )}
                      <p className="min-w-0 text-[2.6mm] leading-[3mm] text-gray-700">
                        <span className="font-bold text-black">ผู้ส่ง/From: </span>
                        <span className="font-bold text-black">{SITE_LEGAL_NAME_TH}</span>{" "}
                        {ADDRESSES.office.full} โทร. {CONTACT.phoneCompanyDisplay}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="rounded bg-gray-300 px-2 py-0.5 text-[3mm] font-bold leading-tight text-black">
                        เลขที่ #{f.id}
                      </span>
                      <p className="mt-[0.5mm] break-all text-[5mm] font-bold leading-tight">
                        {f.ftrackingchn || "—"}
                      </p>
                      <p className="text-[3.2mm] leading-tight text-gray-600">แทรคกิ้ง</p>
                    </div>
                  </div>

                  <hr className="my-[2.5mm] border-gray-400" />

                  {/* Row 2 — TO + full ship-to address (large, faithful) */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <span className="rounded bg-black px-2 py-0.5 text-[3mm] font-bold leading-tight text-white">
                      ถึง / TO
                    </span>
                    <p className="mt-[1.5mm] text-[6mm] font-semibold leading-snug">
                      <span className="font-bold">{displayUser}</span> {fullAddress}
                    </p>
                    {addrNote && (
                      <p className="mt-[0.5mm] text-[3.4mm] leading-snug text-gray-700">
                        (* {addrNote})
                      </p>
                    )}
                  </div>

                  <hr className="my-[2.5mm] border-gray-400" />

                  {/* Row 3 — carrier · qty */}
                  <div className="flex items-end justify-between gap-2 text-[5mm]">
                    <p className="min-w-0 truncate">
                      บริษัทขนส่ง : <span className="font-bold">{nameShipBy(f.fshipby)}</span>
                    </p>
                    <p className="shrink-0 font-bold">จำนวน : {fmt(f.famount, 0)} กล่อง</p>
                  </div>
                  </div>
                </div>
              ));
            })}

        <p className="no-print mt-2 text-center text-[11px] text-gray-500">
          กดปุ่ม &quot;พิมพ์ป้าย / Save PDF&quot; ด้านบน หรือ Ctrl+P · เลือกกระดาษ (Paper) = 100×150 มม. ·
          Margins = None · Scale = 100% (ป้ายจะหมุนเป็นแนวนอนให้เองตอนพิมพ์ · ไม่ต้องตั้ง Landscape)
        </p>
      </main>
    </div>
  );
}
