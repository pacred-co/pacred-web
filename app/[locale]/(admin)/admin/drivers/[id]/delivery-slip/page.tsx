/**
 * /admin/drivers/[id]/delivery-slip — "ใบส่งสินค้า" (goods delivery slip).
 *
 * ⚠️ THIS IS NOT THE บิลจัดส่ง (`../print`). ปอน 2026-07-23 flagged the two are
 * different documents and staff must not confuse them:
 *
 *   • บิลจัดส่ง / Delivery Note (`../print`)  → ONE sheet for the WHOLE run,
 *     every stop listed, the driver's route paperwork.
 *   • ใบส่งสินค้า / this file                  → ONE sheet PER DELIVERY ADDRESS,
 *     handed to (and signed by) that customer. Reached from the
 *     "พิมพ์และบันทึกบิลรวม" action inside the bill modal.
 *
 * Faithful to the legacy PCS form: sender block + QR, centred ใบส่งสินค้า
 * title, เรียน/Attention + เลขที่/วันที่ box, an ITEM/DESCRIPTION/LOCATION/
 * Kg/CBM/BOX table with a รวม row, and the three signature boxes
 * (ผู้รับสินค้า · ผู้ส่งสินค้า · ผู้ตรวจสอบ). Branding is Pacred's own — the
 * company block comes from `components/seo/site.ts`, never hardcoded.
 *
 * ── Scope / security ─────────────────────────────────────────────────
 * `?fids=` names which parcels the slip covers. Those ids are INTERSECTED
 * with the ids actually attached to this driver run before anything is read,
 * so hand-editing the URL can never print another run's (or another
 * customer's) parcels.
 *
 * PURE READ — no writes. AGENTS.md §0c: every Supabase query destructures
 * `error`.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { qrSvgDataUrl } from "@/lib/barcode";
import { DocPrintStyles } from "@/components/admin/driver-doc-paper";
import { SITE_LEGAL_NAME_TH, ADDRESSES, CONTACT } from "@/components/seo/site";

export const dynamic = "force-dynamic";

const LOGO = "/images/pacred-logo-tight.png";

type Batch = {
  id: number;
  fdname: string | null;
  fdadminid: string | null;
  fddate: string | null;
};

type Forwarder = {
  id: number;
  userid: string | null;
  ftrackingchn: string | null;
  fshipby: string | null;
  famount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fpallet: string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddressno: string | null;
  faddresssubdistrict: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
  faddresstel: string | null;
  faddresstel2: string | null;
};

const FORWARDER_COLS =
  "id, userid, ftrackingchn, fshipby, famount, fweight, fvolume, fpallet, " +
  "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
  "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2";

function fmt(n: number | string | null | undefined, decimals = 0): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** `?fids=1,2,3` → unique positive ints (bad tokens are dropped, never throw). */
function parseFids(raw: string | string[] | undefined): number[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return [...out];
}

/**
 * Title carries the doc number (legacy did, and it becomes the PDF filename on
 * "save as PDF"). It runs the SAME run-scope intersection as the page — an
 * unverified `?fids=` must never end up in the title claiming parcels the
 * document does not actually contain.
 * No "| Pacred" suffix — the root layout's title template appends it.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fids?: string }>;
}): Promise<Metadata> {
  const [{ id }, { fids }] = await Promise.all([params, searchParams]);
  const batchId = Number.parseInt(id, 10);
  const asked = parseFids(fids);
  if (!Number.isFinite(batchId) || batchId <= 0) return { title: "ใบส่งสินค้า" };

  const { data, error } = await createAdminClient()
    .from("tb_forwarder_driver_item")
    .select("fid")
    .eq("fdid", batchId);
  if (error) return { title: "ใบส่งสินค้า" }; // title is cosmetic — never throw

  const runFids = new Set(((data ?? []) as { fid: number }[]).map((r) => r.fid));
  const scoped = (asked.length > 0 ? asked : [...runFids]).filter((f) =>
    runFids.has(f),
  );
  return {
    title: scoped.length
      ? `ใบส่งสินค้าเลขที่ #${scoped.join(",")}`
      : "ใบส่งสินค้า",
  };
}

export default async function DeliverySlipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fids?: string }>;
}) {
  // Same gate + own-run rule as the sibling driver documents.
  const { user, roles } = await requireAdmin(["ops", "super", "driver", "warehouse"]);
  const { id } = await params;
  const { fids: fidsParam } = await searchParams;

  const batchId = Number.parseInt(id, 10);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const admin = createAdminClient();
  const isOpsOverride =
    isGodRole(roles) || roles.includes("ops") || roles.includes("warehouse");

  // 1. Batch header.
  const { data: batchData, error: batchErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdname, fdadminid, fddate")
    .eq("id", batchId)
    .maybeSingle<Batch>();
  if (batchErr) {
    console.error(`/admin/drivers/${id}/delivery-slip: batch read failed`, {
      code: batchErr.code,
      message: batchErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรอบจัดส่ง: ${batchErr.message}`);
  }
  if (!batchData) notFound();
  const batch = batchData;

  // Driver role — own run only (same rule as ../print and ../picking-list).
  if (!isOpsOverride && roles.includes("driver")) {
    const { data: myProfile, error: myProfileErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (myProfileErr) {
      console.error("[drivers/[id]/delivery-slip] profiles lookup failed", {
        code: myProfileErr.code,
        message: myProfileErr.message,
      });
    }
    if (myProfile?.member_code !== batch.fdadminid) notFound();
  }

  // 2. The ids that really belong to this run — the scope ceiling.
  const { data: itemsData, error: itemsErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid")
    .eq("fdid", batchId);
  if (itemsErr) {
    console.error(`/admin/drivers/${id}/delivery-slip: item read failed`, {
      code: itemsErr.code,
      message: itemsErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรายการในรอบ: ${itemsErr.message}`);
  }
  const runFids = new Set(
    ((itemsData ?? []) as { fid: number }[]).map((it) => it.fid),
  );

  // 3. INTERSECT — a hand-edited ?fids= can only ever narrow, never widen.
  const asked = parseFids(fidsParam);
  const scoped = (asked.length > 0 ? asked : [...runFids]).filter((f) =>
    runFids.has(f),
  );
  if (scoped.length === 0) notFound();

  let forwarders: Forwarder[] = [];
  {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_COLS)
      .in("id", scoped)
      .order("id", { ascending: true });
    if (fwdErr) {
      console.error(`/admin/drivers/${id}/delivery-slip: forwarder read failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
      throw new Error(`ไม่สามารถอ่านรายการสินค้า: ${fwdErr.message}`);
    }
    forwarders = (fwdData ?? []) as unknown as Forwarder[];
  }
  if (forwarders.length === 0) notFound();

  // 4. Consignee — taken from the first row (the slip is issued per address, so
  //    every row shares it).
  const head = forwarders[0];
  const consigneeName = [head.faddressname, head.faddresslastname]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const consigneeAddress = [
    head.faddressno,
    head.faddresssubdistrict ? `ตำบล/แขวง ${head.faddresssubdistrict}` : "",
    head.faddressdistrict ? `อำเภอ/เขต ${head.faddressdistrict}` : "",
    head.faddressprovince ? `จังหวัด ${head.faddressprovince}` : "",
    head.faddresszipcode,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const consigneePhones = [head.faddresstel, head.faddresstel2]
    .map((p) => (p ?? "").trim())
    .filter((p, i, a) => p !== "" && p !== "-" && a.indexOf(p) === i);

  const docNo = forwarders.map((f) => f.id).join(",");
  const dateLabel = batch.fddate
    ? new Date(batch.fddate).toLocaleString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const totalWeight = forwarders.reduce((s, f) => s + Number(f.fweight ?? 0), 0);
  const totalCbm = forwarders.reduce((s, f) => s + Number(f.fvolume ?? 0), 0);
  const totalBoxes = forwarders.reduce((s, f) => s + Number(f.famount ?? 0), 0);

  // QR = the document number, so a scan on the warehouse floor resolves the
  // exact slip being held. (Owner may want a URL instead — one-line change.)
  const qr = qrSvgDataUrl(`PACRED-DN#${docNo}`);

  return (
    <div className="doc-desk min-h-screen bg-slate-100 text-slate-900">
      <DocPrintStyles />

      {/* On-screen toolbar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/admin/drivers/${batch.id}`} className="text-primary-600 hover:underline">
            ← กลับรายละเอียดรอบ
          </Link>
          <Link
            href={`/admin/drivers/${batch.id}/print`}
            target="_blank"
            className="text-primary-600 hover:underline"
          >
            บิลจัดส่ง (คนขับ · ทั้งรอบ) →
          </Link>
          <span className="text-xs text-gray-500">
            ใบส่งสินค้า · เลขที่ #{docNo} · {forwarders.length} รายการ
          </span>
        </div>
        <PrintButton label="🖨 พิมพ์ใบส่งสินค้า" />
      </div>

      <main className="print-area mx-auto my-6 max-w-[820px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)] sm:p-8">
        {/* Sender block + QR */}
        <div className="flex items-start justify-between gap-4 border border-slate-800 p-3">
          <div className="flex min-w-0 items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Pacred" className="mt-1 h-9 w-auto shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500">ผู้ส่ง/From</p>
              <p className="text-base font-bold leading-tight">{SITE_LEGAL_NAME_TH}</p>
              <p className="text-[12px] leading-snug text-slate-700">
                {ADDRESSES.office.full}
              </p>
              <p className="text-[12px] text-slate-700">
                โทร. {CONTACT.phoneCompanyDisplay}
              </p>
            </div>
          </div>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${docNo}`} className="h-20 w-20 shrink-0" />
          ) : null}
        </div>

        {/* Title */}
        <div className="border-x border-b border-slate-800 py-2 text-center">
          <h1 className="text-xl font-bold">ใบส่งสินค้า</h1>
        </div>

        {/* Consignee (left) · doc no + date (right) */}
        <div className="flex border-x border-b border-slate-800 text-[12px]">
          <div className="min-w-0 flex-1 space-y-0.5 p-2 leading-snug">
            <p>
              <span className="text-slate-500">เรียน/Attention :</span>{" "}
              <span className="font-semibold">{head.userid ?? "—"}</span>{" "}
              {consigneeName ? `คุณ${consigneeName}` : ""} {consigneeAddress}
            </p>
            {consigneePhones.length > 0 && <p>โทร. {consigneePhones.join(", ")}</p>}
            <p>
              <span className="text-slate-500">ขนส่งโดย :</span>{" "}
              {nameShipBy(head.fshipby)}
            </p>
          </div>
          <div className="w-[42%] shrink-0 border-l border-slate-800">
            <div className="flex gap-2 border-b border-slate-800 p-2">
              <span className="shrink-0 text-slate-500">เลขที่/No:</span>
              <span className="min-w-0 break-words font-semibold">#{docNo}</span>
            </div>
            <div className="flex gap-2 p-2">
              <span className="shrink-0 text-slate-500">วันที่/Date:</span>
              <span>{dateLabel}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-center">
              <th className="w-20 border border-slate-800 px-2 py-1.5 font-bold">
                ลำดับที่
                <br />
                <span className="text-[11px] font-normal text-slate-500">ITEM</span>
              </th>
              <th className="border border-slate-800 px-2 py-1.5 font-bold">
                รายการ
                <br />
                <span className="text-[11px] font-normal text-slate-500">DESCRIPTION</span>
              </th>
              <th className="w-20 border border-slate-800 px-2 py-1.5 font-bold">
                ที่ตั้ง
                <br />
                <span className="text-[11px] font-normal text-slate-500">LOCATION</span>
              </th>
              <th className="w-24 border border-slate-800 px-2 py-1.5 font-bold">
                น้ำหนัก
                <br />
                <span className="text-[11px] font-normal text-slate-500">Kg</span>
              </th>
              <th className="w-24 border border-slate-800 px-2 py-1.5 font-bold">
                ปริมาตร
                <br />
                <span className="text-[11px] font-normal text-slate-500">CBM</span>
              </th>
              <th className="w-20 border border-slate-800 px-2 py-1.5 font-bold">
                จำนวน
                <br />
                <span className="text-[11px] font-normal text-slate-500">BOX</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {forwarders.map((f, i) => (
              <tr key={f.id}>
                <td className="border border-slate-800 px-2 py-1 text-center font-mono">
                  {i + 1}:{f.id}
                </td>
                <td className="border border-slate-800 px-2 py-1 break-words">
                  {f.ftrackingchn || "—"}
                </td>
                <td className="border border-slate-800 px-2 py-1 text-center">
                  {f.fpallet || "—"}
                </td>
                <td className="border border-slate-800 px-2 py-1 text-right">
                  {fmt(f.fweight, 2)}
                </td>
                <td className="border border-slate-800 px-2 py-1 text-right">
                  {fmt(f.fvolume, 3)}
                </td>
                <td className="border border-slate-800 px-2 py-1 text-right">
                  {fmt(f.famount, 0)}
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border border-slate-800 px-2 py-1 text-right" colSpan={3}>
                รวม
              </td>
              <td className="border border-slate-800 px-2 py-1 text-right">
                {fmt(totalWeight, 2)}
              </td>
              <td className="border border-slate-800 px-2 py-1 text-right">
                {fmt(totalCbm, 3)}
              </td>
              <td className="border border-slate-800 px-2 py-1 text-right">
                {fmt(totalBoxes, 0)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signatures — receiver · sender · checker */}
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            <tr>
              <td className="w-1/3 border border-slate-800 px-2 py-2">ผู้รับสินค้า :</td>
              <td className="w-1/3 border border-slate-800 px-2 py-2">ผู้ส่งสินค้า :</td>
              <td className="w-1/3 border border-slate-800 px-2 py-2">ผู้ตรวจสอบ :</td>
            </tr>
            <tr>
              <td className="border border-slate-800 px-2 py-2">วันที่ Date :</td>
              <td className="border border-slate-800 px-2 py-2">วันที่ Date :</td>
              <td className="border border-slate-800 px-2 py-2">วันที่ Date :</td>
            </tr>
          </tbody>
        </table>

        <p className="no-print pt-3 text-center text-[11px] text-slate-400">
          กดปุ่ม &quot;พิมพ์ใบส่งสินค้า&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด Ctrl+P
        </p>
      </main>
    </div>
  );
}
