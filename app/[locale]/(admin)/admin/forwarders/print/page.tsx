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
 *   rendered it on the box sticker). Since Pacred has no Code128 lib, the
 *   tracking "barcode" is rendered as a QR of the tracking string (§0a — our
 *   design; same scannable intent).
 *
 * ADDRESS label (case "4") — legacy printAll.php L237-426:
 *   shows userID + full ship-to address + address note + carrier name + qty.
 *   It has NO barcode/QR (the legacy case-4 body renders none).
 *
 * Legacy source: D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\printAll.php
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { SITE_URL, SITE_NAME, LOGO_PATH } from "@/components/seo/site";
import { nameShipBy } from "@/lib/freight/shipping-methods";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// URL parsing — Next 16 searchParams is a Promise; for `?id[]=1&id[]=2`
// Next coalesces duplicate keys into an array under the bracket-less name
// `id`. Accept BOTH the bracketed (id[]) and bracket-less (id) shapes since
// the legacy URL emits `id[]`.
// ─────────────────────────────────────────────────────────────
type SP = {
  type?: string | string[];
  id?: string | string[];
  "id[]"?: string | string[];
};

function extractForwarderIds(sp: SP): number[] {
  const raw = sp["id[]"] ?? sp.id;
  if (raw === undefined) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: number[] = [];
  for (const v of arr) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out.push(n);
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

// QR data-url helper — same options lib/promptpay.ts uses.
async function qr(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, scale: 6 });
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
      <main className="min-h-screen bg-white p-8 text-black">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <h1 className="text-lg font-bold mb-2">ไม่พบเลขที่รายการ</h1>
          <p>
            URL ต้องมีพารามิเตอร์{" "}
            <code className="px-1 bg-amber-100 rounded">id[]=…</code> อย่างน้อย 1 ตัว
            เช่น <code className="px-1 bg-amber-100 rounded">?type=box&amp;id[]=51967</code>
          </p>
          <Link
            href="/admin/forwarders"
            className="mt-4 inline-block rounded-md bg-primary-600 px-4 py-2 text-white font-medium hover:bg-primary-700"
          >
            ← กลับไปรายการพัสดุ
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

  // ── Pre-generate the 3 QR codes per forwarder (box label only) ──
  const qrMap = new Map<number, BoxQr>();
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
    }
  }

  const totalLabels = orderedForwarders.reduce((s, f) => s + copyCount(f.famount), 0);

  return (
    <div className="bg-white text-black min-h-screen">
      <style>{`
        .label-page {
          width: 100mm;
          height: 75mm;
          box-sizing: border-box;
          padding: 2.5mm;
          background: #fff;
          color: #000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        @media screen {
          .label-page {
            border: 1px dashed #cbd5e1;
            margin: 0 auto 6mm;
            box-shadow: 0 1px 4px rgba(0,0,0,.08);
          }
        }
        @media print {
          aside, .no-print { display: none !important; }
          html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
          .label-page {
            break-after: page;
            page-break-after: always;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .label-page:last-child { break-after: auto; page-break-after: auto; }
        }
        @page { size: 100mm 75mm; margin: 0; }
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
              const displayUser = displayBoxUserId(f.userid, f.ftrackingchn2);
              const showLogo = !isFamilyAccount(f.userid);
              const totalVolume = Number(f.fvolume ?? 0) * Number(f.famount ?? 1);
              return Array.from({ length: copies }).map((_, copy) => (
                <div key={`box-${f.id}-${copy}`} className="label-page">
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
                      <img src={q.detail} alt="QR" className="h-[14mm] w-[14mm] shrink-0" />
                    )}
                  </div>

                  <hr className="my-[1mm] border-gray-400" />

                  {/* Row 2 — TO + customer member code (large) */}
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black px-2 py-0.5 text-[3mm] font-bold leading-tight text-white">
                      ถึง / TO
                    </span>
                    <span className="truncate text-[8mm] font-black leading-none tracking-tight">
                      {displayUser}
                    </span>
                  </div>

                  <hr className="my-[1mm] border-gray-400" />

                  {/* Row 3 — tracking + tracking QR */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[3mm] leading-tight text-gray-600">เลขแทรคกิ้ง</p>
                      <p className="break-all text-[4mm] font-bold leading-tight">
                        {f.ftrackingchn || "—"}
                      </p>
                    </div>
                    {q?.tracking && (
                      <img
                        src={q.tracking}
                        alt="tracking QR"
                        className="h-[13mm] w-[13mm] shrink-0"
                      />
                    )}
                  </div>

                  <hr className="my-[1mm] border-gray-400" />

                  {/* Row 4 — gateway-pickup QR · weight / volume / qty / location */}
                  <div className="mt-auto flex items-end justify-between gap-2">
                    {q && (
                      <img
                        src={q.gateway}
                        alt="gateway QR"
                        className="h-[15mm] w-[15mm] shrink-0"
                      />
                    )}
                    <div className="text-right text-[3.4mm] leading-snug">
                      <p>น้ำหนัก : {fmt(f.fweight, 2)} kg.</p>
                      <p>ปริมาตรรวม : {fmt(totalVolume, 3)} CBM</p>
                      <p className="font-bold">จำนวน : {fmt(f.famount, 0)} กล่อง</p>
                      <p>location : {f.fpallet || "—"}</p>
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
              const fullAddress = buildFullAddress(f);
              return Array.from({ length: copies }).map((_, copy) => (
                <div key={`addr-${f.id}-${copy}`} className="label-page">
                  {/* Row 1 — logo · id + tracking */}
                  <div className="flex items-start justify-between gap-2">
                    {showLogo ? (
                      <img src={LOGO_PATH} alt={SITE_NAME} className="h-[7mm] w-auto shrink-0" />
                    ) : (
                      <span />
                    )}
                    <div className="text-right">
                      <span className="rounded bg-gray-300 px-2 py-0.5 text-[3mm] font-bold leading-tight text-black">
                        เลขที่ #{f.id}
                      </span>
                      <p className="mt-[0.5mm] break-all text-[4mm] font-bold leading-tight">
                        {f.ftrackingchn || "—"}
                      </p>
                      <p className="text-[2.6mm] leading-tight text-gray-600">แทรคกิ้ง</p>
                    </div>
                  </div>

                  <hr className="my-[1mm] border-gray-400" />

                  {/* Row 2 — TO + full ship-to address (large, faithful) */}
                  <div className="flex-1 overflow-hidden">
                    <span className="rounded bg-black px-2 py-0.5 text-[3mm] font-bold leading-tight text-white">
                      ถึง / TO
                    </span>
                    <p className="mt-[1mm] text-[4.6mm] font-semibold leading-snug">
                      <span className="font-bold">{displayUser}</span> {fullAddress}
                    </p>
                    {f.faddressnote && (
                      <p className="mt-[0.5mm] text-[3.4mm] leading-snug text-gray-700">
                        (* {f.faddressnote})
                      </p>
                    )}
                  </div>

                  <hr className="my-[1mm] border-gray-400" />

                  {/* Row 3 — carrier · qty */}
                  <div className="flex items-end justify-between gap-2 text-[3.6mm]">
                    <p className="min-w-0 truncate">
                      บริษัทขนส่ง : <span className="font-bold">{nameShipBy(f.fshipby)}</span>
                    </p>
                    <p className="shrink-0 font-bold">จำนวน : {fmt(f.famount, 0)} กล่อง</p>
                  </div>
                </div>
              ));
            })}

        <p className="no-print mt-2 text-center text-[11px] text-gray-500">
          กดปุ่ม &quot;พิมพ์ป้าย / Save PDF&quot; ด้านบน หรือ Ctrl+P · ตั้งขนาดกระดาษ 100×75 มม.
          (สติกเกอร์ฉลาก)
        </p>
      </main>
    </div>
  );
}
