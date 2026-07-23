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
 * Content follows the legacy PCS form (ผู้ส่ง/From · เรียน/Attention ·
 * ITEM / DESCRIPTION / LOCATION / Kg / CBM / BOX with a รวม row · the three
 * signatures ผู้รับสินค้า · ผู้ส่งสินค้า · ผู้ตรวจสอบ) but is styled to ปอน's
 * 2026-07-23 design: big ใบส่งสินค้า / DELIVERY NOTE title over an accent
 * rule, a tinted items grid, a สรุป box paired with the QR, a หมายเหตุ line
 * and icon-led signature columns. Palette is the SHARED driver-document one
 * (`components/admin/driver-doc-paper`) so this sheet, บิลจัดส่ง and
 * บิลหาสินค้า read as one set. Company details come from
 * `components/seo/site.ts`, never hardcoded.
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
import { headers } from "next/headers";
import type { Metadata } from "next";
import {
  ClipboardCheck,
  ClipboardList,
  Info,
  Mail,
  Phone,
  Truck,
  UserCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { qrSvgDataUrl } from "@/lib/barcode";
import {
  DOC_CREAM as CREAM,
  DOC_CREAM_BD as CREAM_BD,
  DOC_GOLD as GOLD,
  DocMetaBox,
  DocMetaRow,
  DocPrintStyles,
} from "@/components/admin/driver-doc-paper";
import { SITE_LEGAL_NAME_TH, SITE_URL, ADDRESSES, CONTACT } from "@/components/seo/site";

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

  // QR = a real link to this run's detail page, mirroring legacy PCS whose slip
  // QR opened `…/forwarder-driver/detail/<id>/`. Scanning the printed sheet on
  // the floor jumps straight to the run — a bare doc number would only be a
  // string to re-type.
  //
  // Origin comes from the REQUEST, not SITE_URL: on localhost SITE_URL falls
  // back to the production domain, which would print a QR that opens prod while
  // you are testing. Header-derived origin is right on both without config.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host && /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https");
  const origin = host ? `${proto}://${host}` : SITE_URL;
  const runUrl = `${origin}/admin/drivers/${batch.id}`;
  const qr = qrSvgDataUrl(runUrl);

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
      </div>      <main className="print-area mx-auto my-6 max-w-[820px] bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
        {/* Header — sender (left) · document title + no./date (right) */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Pacred" className="h-10 w-auto" />
            <p className="mt-2 text-[10px] text-slate-400">ผู้ส่ง / From</p>
            <p className="text-[13px] font-bold leading-tight">{SITE_LEGAL_NAME_TH}</p>
            <p className="mt-0.5 max-w-[330px] text-[11px] leading-relaxed text-slate-500">
              {ADDRESSES.office.full}
            </p>
            {/* phone + email share ONE line — both are "how to reach us" */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
                โทร. {CONTACT.phoneCompanyDisplay}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
                {CONTACT.email}
              </span>
            </div>
          </div>

          <div className="w-[300px] shrink-0">
            <h1
              className="text-right text-[26px] font-black leading-none"
              style={{ color: GOLD }}
            >
              ใบส่งสินค้า
            </h1>
            <p className="mt-1.5 text-right text-[10px] font-medium tracking-[0.25em] text-slate-400">
              DELIVERY NOTE
            </p>
            {/* Same tinted meta box the sibling บิลจัดส่ง uses — shared
                component, not a look-alike, so the two can never drift. */}
            <DocMetaBox>
              <DocMetaRow k="เลขที่/No." v={`#${docNo}`} />
              <DocMetaRow k="วันที่/Date" v={dateLabel} last />
            </DocMetaBox>
          </div>
        </div>

        {/* accent rule closing the header */}
        <div className="mt-4 border-t-2" style={{ borderColor: GOLD }} />

        {/* Recipient — legacy's เรียน / Attention block */}
        <div className="mt-4 text-[12px] leading-relaxed">
          <p>
            <span className="text-slate-500">เรียน / Attention :</span>{" "}
            <span className="font-mono font-semibold">{head.userid ?? "—"}</span>
          </p>
          {consigneeName ? <p className="font-semibold">คุณ{consigneeName}</p> : null}
          <p className="text-slate-700">{consigneeAddress || "—"}</p>
          {consigneePhones.length > 0 ? (
            <p className="text-slate-700">โทร. {consigneePhones.join(", ")}</p>
          ) : null}
          <p className="mt-1">
            <span className="text-slate-500">ขนส่งโดย :</span>{" "}
            <span className="font-semibold">{nameShipBy(head.fshipby)}</span>
          </p>
        </div>

        {/* Items — bordered grid with a tinted head + a รวม row (legacy shape) */}
        <div className="mt-5 overflow-hidden rounded border border-slate-300">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-center" style={{ background: CREAM }}>
                <ItemTh th="ลำดับที่" en="ITEM" className="w-24" />
                <ItemTh th="รายการ" en="DESCRIPTION" />
                <ItemTh th="ที่ตั้ง" en="LOCATION" className="w-24" />
                <ItemTh th="น้ำหนัก" en="Kg" className="w-24" />
                <ItemTh th="ปริมาตร" en="CBM" className="w-24" />
                <ItemTh th="จำนวน" en="BOX" className="w-20" />
              </tr>
            </thead>
            <tbody>
              {forwarders.map((f, i) => (
                <tr key={f.id}>
                  <td className="border border-slate-200 px-2 py-1.5 text-center font-mono">
                    {i + 1}:{f.id}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 break-words">
                    {f.ftrackingchn || "—"}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-center">
                    {f.fpallet || "—"}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">
                    {fmt(f.fweight, 2)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">
                    {fmt(f.fvolume, 3)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">
                    {fmt(f.famount, 0)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold" style={{ background: CREAM }}>
                <td className="border border-slate-200 px-2 py-1.5 text-right" colSpan={3}>
                  รวม
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">
                  {fmt(totalWeight, 2)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">
                  {fmt(totalCbm, 3)}
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right">
                  {fmt(totalBoxes, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* สรุป box + QR */}
        <div className="mt-5 flex items-stretch gap-4">
          <div
            className="min-w-0 flex-1 rounded-lg border p-4"
            style={{ background: CREAM, borderColor: CREAM_BD }}
          >
            <p
              className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold"
              style={{ color: GOLD }}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              สรุป
            </p>
            <TotalLine k="น้ำหนักรวม" v={fmt(totalWeight, 2)} unit="Kg" />
            <TotalLine k="ปริมาตรรวม" v={fmt(totalCbm, 3)} unit="CBM" />
            <TotalLine k="จำนวนรวม" v={fmt(totalBoxes, 0)} unit="BOX" strong />
          </div>

          {qr ? (
            <div className="flex w-[120px] shrink-0 flex-col items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`QR รอบ #${batch.id}`}
                title={runUrl}
                className="h-[84px] w-[84px]"
              />
              <p className="mt-1 text-center text-[9px] leading-tight text-slate-400">
                ตรวจสอบเอกสาร
                <br />
                สแกนเพื่อเปิดรายการ
              </p>
            </div>
          ) : null}
        </div>

        {/* หมายเหตุ */}
        <p className="mt-4 flex items-start gap-2 text-[11px] text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
          <span>
            <span className="font-semibold text-slate-600">หมายเหตุ</span>{" "}
            เอกสารนี้จัดทำขึ้นเพื่อการตรวจสอบรายการจัดส่งสินค้าเท่านั้น
          </span>
        </p>

        {/* Signatures */}
        <div className="mt-6 grid grid-cols-3 gap-6 text-[12px]">
          <SignBox icon={<UserCheck className="h-3.5 w-3.5" style={{ color: GOLD }} />} label="ผู้รับสินค้า" />
          <SignBox icon={<Truck className="h-3.5 w-3.5" style={{ color: GOLD }} />} label="ผู้ส่งสินค้า" />
          <SignBox icon={<ClipboardCheck className="h-3.5 w-3.5" style={{ color: GOLD }} />} label="ผู้ตรวจสอบ" />
        </div>

        <p className="no-print pt-8 text-center text-[11px] text-slate-400">
          กดปุ่ม &quot;พิมพ์ใบส่งสินค้า&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด Ctrl+P
        </p>
      </main>
    </div>
  );
}

/** Items-table head cell — Thai over its English caption. */
function ItemTh({
  th,
  en,
  className = "",
}: {
  th: string;
  en: string;
  className?: string;
}) {
  return (
    <th className={`border border-slate-200 px-2 py-1.5 font-bold ${className}`}>
      {th}
      <br />
      <span className="text-[10px] font-normal uppercase tracking-wide text-slate-400">
        {en}
      </span>
    </th>
  );
}

/** One row inside the สรุป box — label · value · unit. */
function TotalLine({
  k,
  v,
  unit,
  strong,
}: {
  k: string;
  v: string;
  unit: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 text-[12px] ${
        strong ? "" : "border-b"
      }`}
      style={strong ? undefined : { borderColor: CREAM_BD }}
    >
      <span className="text-slate-500">{k}</span>
      <span className="flex items-baseline gap-2">
        <span className={strong ? "font-bold" : "font-semibold"}>{v}</span>
        <span className="w-9 text-right text-[10px] text-slate-400">{unit}</span>
      </span>
    </div>
  );
}

/** One signature column — icon + role, a dotted rule, then a dated line. */
function SignBox({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
        {icon}
        {label}
      </p>
      <div className="mt-9 border-b border-dotted border-slate-400" />
      <p className="mt-2 text-slate-500">วันที่ Date :</p>
      <div className="mt-6 border-b border-dotted border-slate-400" />
    </div>
  );
}
