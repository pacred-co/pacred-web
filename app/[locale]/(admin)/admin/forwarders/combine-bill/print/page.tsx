/**
 * /admin/forwarders/combine-bill/print — "พิมพ์บิลรวม" delivery slip
 *
 * Wave 23 P0 fix #1 (Task #153, 2026-05-26 ค่ำ): the legacy
 * `pcs-admin/printBill.php` rendered a mPDF "ใบส่งสินค้า" delivery
 * slip — header (consignee + ship-by carrier + bill no) + line items
 * (tracking · location · weight · CBM · qty). The list page link
 * was 404'ing because this route didn't exist. Banner alternative:
 * we built the HTML version + `window.print()`. Future Wave (per
 * earlier comments in combine-bill/page.tsx) can swap to
 * @react-pdf/renderer for true PDF download — that's a polish lift.
 *
 * Legacy source: `pcs-admin/printBill.php` L1-326 (mPDF rendering).
 *
 * URL contract (preserved verbatim from legacy + Pacred port):
 *   /admin/forwarders/combine-bill/print?id[]=1&id[]=2&id[]=3
 *   ↑ the same `id[]=…&id[]=…` shape that
 *     `buildCombineBillPrintHref()` in lib/admin/combine-bill-urls.ts
 *     emits, and that the legacy `printBill.php` consumed.
 *
 * Data model (legacy printBill.php L36-42 + L243):
 *   - HEADER  = first forwarder ID (consignee + carrier + ship-to)
 *   - ITEMS   = ALL forwarder IDs in the URL list (tracking + dims)
 * One delivery slip per consignee = the warehouse staff pack one
 * box bundle and stick this slip on it.
 *
 * Auth — same gate as the list + delete page: super/ops/warehouse/
 * accounting (the warehouse role is the primary consumer — this is
 * a packing-slip print).
 *
 * Status (Wave 23):
 *   ✅ HTML render with `window.print()` button (browser-print)
 *   ✅ A4 layout via @page CSS
 *   ✅ Sidebar hidden via @media print
 *   ⏳ Future: swap to @react-pdf/renderer for true PDF download
 *      (the existing `/api/pdf/forwarder/[fNo]` route is the model)
 *   ⏳ Future: write `tb_forwarder.printstatus2='1'` on print
 *      (legacy printBill.php L45 marked the row as printed; we
 *      DON'T touch that here so a re-print doesn't double-toggle.
 *      Audit lift via Server Action is the cleaner path.)
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { CONTACT, ADDRESSES, SITE_NAME, SITE_LEGAL_NAME, SITE_LEGAL_NAME_TH, TAX_ID } from "@/components/seo/site";
// 2026-07-04 — นิติบุคคล consignee = registered company name (tb_corporate), not
// the contact person. The legacy code used userName as the "company name" which
// is actually the contact person.
import {
  fetchCorporateNameMap,
  resolveBillingIdentity,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Legacy `nameShipBy()` (pcs-admin/include/function.php L185-242)
// Translated to a static map; same enum values, same labels.
// ─────────────────────────────────────────────────────────────
const SHIP_BY_LABELS: Record<string, string> = {
  "1": "DHL Express",
  "2": "Flash Express",
  "3": "J.K. เอ็กซ์เพรส",
  "4": "Kerry Express",
  "5": "Nim Express",
  "6": "S & J ขนส่งด่วนสุพรรณบุรี",
  "7": "SB สมใจขนส่ง",
  "8": "SCG Express",
  "9": "เคพีเอ็น (2017)",
  "10": "เฟิร์ส เอ็กเพรส ขนส่ง",
  "11": "ไปรษณีย์ไทย",
  "12": "จันทร์สว่างขนส่ง",
  "13": "ธนามัย ขนส่งด่วน",
  "14": "บุญอนันต์ขนส่ง",
  "15": "พี.เจ. ด่วนอีสาน ขนส่ง",
  "16": "มะม่วงขนส่ง",
  "17": "วันชนะ แอนด์ วันณิสา ขนส่ง",
  "18": "สมพงษ์อุบลรัตน์ ขนส่ง",
  "19": "อาร์.ซี.อาร์ เพลส",
  "20": "ตองสอง ขนส่ง",
  "21": "นิ่มซี่เส็งขนส่ง 1988",
  "22": "ธนาไพศาล ขนส่ง",
  "23": "PL ขนส่งด่วน",
  "24": "J&T Express",
  "25": "มังกรทองขนส่ง 2019",
  "26": "PM ชลบุรี ขนส่งด่วน",
  "27": "ทรัพย์ปรีชา",
  "28": "พัฒนาเอ็กซ์เพลส",
  "29": "หาดใหญ่ทัวร์",
  "30": "หาดใหญ่ โอ.พี. 2012",
  "31": "อาร์.ซี.เอ็กซเพรส",
  "32": "สี่สหาย",
  "33": "แพปลา​สมบัติ​วัฒนา",
  "34": "ทวีทรัพย์ระยอง ขนส่ง",
  "35": "ศิริสมบูรณ์",
  "36": "นิวสอง อัศวินขนส่ง",
  "37": "โชคสถาพรขนส่ง",
  "38": "ทรัพย์สมบูรณ์ถาวร",
  "39": "MNB Transport",
  "40": "หจก.โชคพูลทรัพย์ขนส่ง 2014",
  "41": "สิรินครขนส่ง",
  "42": "พาณิชย์การขนส่ง KSD",
  "43": "นวรรณขนส่ง",
  "44": "กุญชรมณี ขนส่ง",
  "45": "เอ็มพอร์ท โลจิสติกส์",
  "46": "ซี.เอ็น.ทรานสปอร์ต",
  "47": "ภูเก็ตแหลมทองขนส่ง",
  PCS: `รับเองโกดัง ${SITE_NAME}`,
  PCSE: `${SITE_NAME} Express`,
  F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: `${SITE_NAME} เหมาเหมา`,
};

function shipByLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return SHIP_BY_LABELS[code] ?? `ขนส่งรหัส ${code}`;
}

// ─────────────────────────────────────────────────────────────
// URL parsing — Next 16 searchParams is a Promise<Record<string,
// string | string[] | undefined>>; for `?id[]=1&id[]=2` Next coalesces
// duplicate keys into an array under the bracket-less name `id`.
// We accept BOTH the bracketed (id[]) and bracket-less (id) shapes for
// safety since the legacy URL uses `id[]`.
// ─────────────────────────────────────────────────────────────
type SP = {
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

// ─────────────────────────────────────────────────────────────
// Number formatter — legacy uses PHP `number_format($n, 2)` etc.
// Replicate with toLocaleString.
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
// Data row shapes (mapped to ported tb_forwarder / tb_users schema)
// ─────────────────────────────────────────────────────────────
type ForwarderRow = {
  id: number;
  fdate: string | null;
  fshipby: string | null;
  fpallet: string | null;
  ftrackingchn: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fdiscount: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddressno: string | null;
  faddresssubdistrict: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
  faddressnote: string | null;
  faddresstel: string | null;
  faddresstel2: string | null;
  userid: string;
};

type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userCompany: string | null;
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default async function CombineBillPrintPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Same gate as the list page. Warehouse staff is the primary user.
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const sp = await searchParams;
  const ids = extractForwarderIds(sp);

  if (ids.length === 0) {
    return (
      <main className="min-h-screen bg-white p-8 text-black">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <h1 className="text-lg font-bold mb-2">ไม่พบเลขที่รายการ</h1>
          <p>
            URL ต้องมีพารามิเตอร์ <code className="px-1 bg-amber-100 rounded">id[]=…</code>{" "}
            อย่างน้อย 1 ตัว เช่น{" "}
            <code className="px-1 bg-amber-100 rounded">?id[]=12345</code>
          </p>
          <Link
            href="/admin/forwarders/combine-bill"
            className="mt-4 inline-block rounded-md bg-primary-600 px-4 py-2 text-white font-medium hover:bg-primary-700"
          >
            ← กลับไปประวัติรายการรวมบิล
          </Link>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();

  // ── Load all forwarder rows (legacy printBill.php L243) ──
  //   SELECT … FROM tb_forwarder WHERE id IN (…)
  const { data: forwardersData, error: fErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fshipby, fpallet, ftrackingchn, fweight, fvolume, famount, " +
        "ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, " +
        "pricecrate, ftransportpricechnthb, priceother, " +
        "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
        "faddressdistrict, faddressprovince, faddresszipcode, faddressnote, " +
        "faddresstel, faddresstel2, userid",
    )
    .in("id", ids);

  if (fErr) {
    console.error("[combine-bill/print] tb_forwarder query failed", {
      ids,
      code: fErr.code,
      message: fErr.message,
    });
    throw new Error(
      `combine-bill/print: failed to load tb_forwarder — ${fErr.code ?? "unknown"}: ${fErr.message}`,
    );
  }

  const forwarders = (forwardersData ?? []) as unknown as ForwarderRow[];

  if (forwarders.length === 0) notFound();

  // ── Preserve URL order — find() per ID since `in()` returns unsorted ──
  const byId = new Map<number, ForwarderRow>();
  for (const f of forwarders) byId.set(Number(f.id), f);
  const orderedForwarders = ids
    .map((id) => byId.get(id))
    .filter((f): f is ForwarderRow => f !== undefined);

  if (orderedForwarders.length === 0) notFound();

  // The HEADER is the FIRST forwarder ID (legacy printBill.php L42).
  const header = orderedForwarders[0];

  // ── Load the user row for the header (consignee info) ──
  const { data: userData, error: uErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userCompany")
    .eq("userID", header.userid)
    .maybeSingle<UserRow>();

  if (uErr) {
    console.error("[combine-bill/print] tb_users query failed", {
      userid: header.userid,
      code: uErr.code,
      message: uErr.message,
    });
    // Don't throw — show "—" for user info, still print the slip.
  }
  const user = userData ?? null;

  // ── Resolve the consignee DISPLAY identity (นิติบุคคล → registered company
  //    name; else the contact person). ONE batched .in() on tb_corporate. ──
  const corpNames = await fetchCorporateNameMap(admin, [header.userid]);
  const consigneeIdentity = resolveBillingIdentity({
    userCompany: user?.userCompany,
    userName: user?.userName,
    userLastName: user?.userLastName,
    corp: corpRowFromName(corpNames.get(header.userid)),
  });

  // ── Aggregates (legacy printBill.php L200-273 tfoot totals) ──
  const totalWeight = orderedForwarders.reduce(
    (s, f) => s + Number(f.fweight ?? 0),
    0,
  );
  const totalVolume = orderedForwarders.reduce(
    (s, f) => s + Number(f.fvolume ?? 0),
    0,
  );
  const totalAmount = orderedForwarders.reduce(
    (s, f) => s + Number(f.famount ?? 0),
    0,
  );

  // Consignee full name (legacy printBill.php L39 builds CONCAT in SQL).
  // นิติบุคคล → registered company name (no คุณ- honorific); else คุณ<person>.
  const consigneeName = consigneeIdentity.isJuristic
    ? consigneeIdentity.name
    : `คุณ ${user?.userName ?? ""} ${user?.userLastName ?? ""}`.trim();

  const fullShipAddress = [
    `คุณ ${header.faddressname ?? ""} ${header.faddresslastname ?? ""}`.trim(),
    `${header.faddressno ?? ""}`,
    `ต.${header.faddresssubdistrict ?? ""} อ.${header.faddressdistrict ?? ""} จ.${header.faddressprovince ?? ""} ${header.faddresszipcode ?? ""}`,
    `โทร. ${header.faddresstel ?? "—"}${header.faddresstel2 ? `, ${header.faddresstel2}` : ""}`,
  ]
    .filter((s) => s.trim().length > 0)
    .join(" · ");

  const headerDateLabel = header.fdate
    ? new Date(header.fdate).toLocaleString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="bg-white text-black min-h-screen">
      {/* ชื่อไฟล์ตอน Save PDF + หัวกระดาษ = ชื่อเอกสาร (กฎ print กลาง 2026-07-23) */}
      <title>{`บิลรวม ${header.userid ?? ""}`}</title>
      {/*
        Print-only styles — hide admin sidebar (rendered by
        (admin)/layout.tsx as <aside>) + the on-screen toolbar; reset
        margins; A4 page size.
      */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
          .print-area { box-shadow: none !important; border: none !important; }
        }
        @page { size: A4 portrait; margin: 1.2cm; }
      `}</style>

      {/* On-screen toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/admin/forwarders/combine-bill"
            className="text-primary-600 hover:underline"
          >
            ← กลับไปประวัติรายการรวมบิล
          </Link>
          <span className="text-xs text-gray-500">
            พิมพ์บิลรวม · {orderedForwarders.length} รายการ
          </span>
        </div>
        <div className="flex gap-2">
          <PrintButton />
        </div>
      </div>

      <main className="print-area mx-auto max-w-[800px] p-8 space-y-5">
        {/* Header — 2026-06-03 ภูม flag round-2: standardised layout (ภูม
            screenshot showed the company-info column getting squeezed to a
            narrow 17%-width column on smaller viewports — flex with
            text-right children was collapsing wrong). Rewritten as
            grid-cols-12 with explicit fractions: 7/12 for issuer block,
            5/12 for doc title + bill no — predictable on any width.
            Issuer block flows as INLINE text (legal name pair on one line,
            then TaxID line, then address line, then phone/email line) so
            address wrapping is graceful instead of cramming into a
            narrow column. */}
        <div className="grid grid-cols-12 items-start border-b-2 border-black pb-4 gap-6">
          {/* Issuer block (7/12) — Pacred legal identity */}
          <div className="col-span-7">
            <h1 className="text-3xl font-black text-primary-700 leading-tight">{SITE_NAME}</h1>
            <p className="text-sm font-semibold mt-1">{SITE_LEGAL_NAME_TH} · <span className="font-normal text-gray-700">{SITE_LEGAL_NAME}</span></p>
            <p className="text-xs mt-1">
              เลขประจำตัวผู้เสียภาษี / Tax ID: <span className="font-mono">{TAX_ID}</span>
            </p>
            <p className="text-xs text-gray-700 mt-0.5">{ADDRESSES.office.full}</p>
            <p className="text-xs text-gray-700 mt-0.5">
              โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </p>
          </div>
          {/* Doc title + bill-no (5/12) — right-aligned */}
          <div className="col-span-5 text-right">
            <h2 className="text-2xl font-bold">ใบส่งสินค้า</h2>
            <p className="text-xs text-gray-500 -mt-0.5">Delivery Note</p>
            {/* Bill-no list: when ≤4 ids show inline; when >4 collapse with count
                + first 2 + "และอีก N รายการ" so the header doesn't stretch wider
                than the right column on big batches (ภูม screenshot showed an
                8-id batch wrapping awkwardly at the seam). */}
            {ids.length <= 4 ? (
              <p className="font-mono text-sm text-gray-700 mt-2">
                เลขที่ #{ids.join(", #")}
              </p>
            ) : (
              <p className="font-mono text-sm text-gray-700 mt-2 leading-snug">
                เลขที่ #{ids.slice(0, 2).join(", #")} <span className="text-gray-500">และอีก {ids.length - 2} รายการ</span>
              </p>
            )}
            <p className="text-xs text-gray-600 mt-1">วันที่: {headerDateLabel}</p>
          </div>
        </div>

        {/* Consignee block (legacy printBill.php L176-187) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-2 border border-gray-300 rounded p-3">
            <h3 className="font-bold mb-1 text-xs uppercase tracking-wider text-gray-500">
              เรียน / Attention
            </h3>
            <p className="font-semibold">{user?.userID ?? header.userid}</p>
            <p className="text-sm">{consigneeName}</p>
            <p className="text-xs mt-1 text-gray-700">{fullShipAddress}</p>
            {header.faddressnote && (
              <p className="text-xs mt-1 text-amber-700">
                * {header.faddressnote}
              </p>
            )}
          </div>
          <div className="border border-gray-300 rounded p-3 text-sm">
            <h3 className="font-bold mb-1 text-xs uppercase tracking-wider text-gray-500">
              ขนส่งโดย
            </h3>
            <p>{shipByLabel(header.fshipby)}</p>
            {user?.userTel && (
              <p className="text-xs mt-2 text-gray-700">
                โทรลูกค้า: {user.userTel}
              </p>
            )}
          </div>
        </section>

        {/* Items table — 2026-06-03 ภูม flag: split "ลำดับ ITEM" into two
            columns (just running No. + Pacred internal order# #{f.id}) and
            rename "รายการ DESCRIPTION" → "รหัสพัสดุ Tracking" since the
            content IS the 中国 tracking number, not a free-text description.
            Matches the receipt-print table column shape so warehouse staff
            see the same layout across both docs. */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-center">
              <th className="border border-gray-400 px-2 py-1 w-12">ลำดับ<br /><span className="text-[11px] font-normal text-gray-500">No.</span></th>
              <th className="border border-gray-400 px-2 py-1 w-28">เลขที่ออเดอร์<br /><span className="text-[11px] font-normal text-gray-500">Order No.</span></th>
              <th className="border border-gray-400 px-2 py-1">รหัสพัสดุ<br /><span className="text-[11px] font-normal text-gray-500">Tracking</span></th>
              <th className="border border-gray-400 px-2 py-1 w-24">ที่ตั้ง<br /><span className="text-[11px] font-normal text-gray-500">Location</span></th>
              <th className="border border-gray-400 px-2 py-1 w-20">น้ำหนัก<br /><span className="text-[11px] font-normal text-gray-500">Wt./kg</span></th>
              <th className="border border-gray-400 px-2 py-1 w-20">ปริมาตร<br /><span className="text-[11px] font-normal text-gray-500">Vol./cbm</span></th>
              <th className="border border-gray-400 px-2 py-1 w-16">จำนวน<br /><span className="text-[11px] font-normal text-gray-500">Box</span></th>
            </tr>
          </thead>
          <tbody>
            {orderedForwarders.map((f, idx) => (
              <tr key={f.id}>
                <td className="border border-gray-400 px-2 py-1 text-center">
                  {idx + 1}
                </td>
                <td className="border border-gray-400 px-2 py-1 text-center font-mono text-xs">
                  #{f.id}
                </td>
                <td className="border border-gray-400 px-2 py-1 break-all font-mono text-xs">
                  {f.ftrackingchn || "—"}
                </td>
                <td className="border border-gray-400 px-2 py-1 text-center text-xs">
                  {f.fpallet || "—"}
                </td>
                <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                  {fmt(f.fweight, 2)}
                </td>
                <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                  {fmt(f.fvolume, 3)}
                </td>
                <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                  {fmt(f.famount, 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              {/* colSpan=4 now (ลำดับ + เลขที่ออเดอร์ + รหัสพัสดุ + ที่ตั้ง) */}
              <td colSpan={4} className="border border-gray-400 px-2 py-1 text-right">
                รวม
              </td>
              <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                {fmt(totalWeight, 2)}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                {fmt(totalVolume, 3)}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-right font-mono">
                {fmt(totalAmount, 0)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signature row (legacy printBill.php L293-302) */}
        <div className="grid grid-cols-3 gap-3 text-sm pt-2">
          <div className="border border-gray-300 rounded p-3 text-center text-xs">
            <p className="font-semibold">ผู้รับสินค้า</p>
            <div className="mt-8 border-t border-gray-400 pt-1 text-gray-500">
              วันที่ Date:
            </div>
          </div>
          <div className="border border-gray-300 rounded p-3 text-center text-xs">
            <p className="font-semibold">ผู้ส่งสินค้า</p>
            <div className="mt-8 border-t border-gray-400 pt-1 text-gray-500">
              วันที่ Date:
            </div>
          </div>
          <div className="border border-gray-300 rounded p-3 text-center text-xs">
            <p className="font-semibold">ผู้ตรวจสอบ</p>
            <div className="mt-8 border-t border-gray-400 pt-1 text-gray-500">
              วันที่ Date:
            </div>
          </div>
        </div>

        <p className="no-print text-[11px] text-gray-500 text-center pt-2">
          กดปุ่ม &quot;พิมพ์ / Save PDF&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด Ctrl+P
        </p>
      </main>
    </div>
  );
}
