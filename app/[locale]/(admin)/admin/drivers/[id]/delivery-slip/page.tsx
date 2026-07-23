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
 * Content follows the legacy PCS form (ITEM / DESCRIPTION / LOCATION / Kg /
 * CBM / BOX + the three signatures ผู้รับสินค้า · ผู้ส่งสินค้า · ผู้ตรวจสอบ),
 * but the LAYOUT is Pacred's own (ปอน 2026-07-23): brand block + big
 * ใบส่งสินค้า / DELIVERY NOTE title, a labelled RECIPIENT section, a hairline
 * items table instead of legacy's heavy boxed grid, right-aligned totals with
 * units, and the QR moved down beside them. Company details come from
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
import { Mail, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { qrSvgDataUrl } from "@/lib/barcode";
import { DocPrintStyles } from "@/components/admin/driver-doc-paper";
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
      </div>
      <main className="print-area mx-auto my-6 max-w-[820px] bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
        {/* Header — brand (left) · document title (right) */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Pacred" className="mt-0.5 h-11 w-auto shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight">{SITE_LEGAL_NAME_TH}</p>
              <p className="mt-1 max-w-[300px] text-[11px] leading-relaxed text-slate-500">
                {ADDRESSES.office.full}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                {CONTACT.phoneCompanyDisplay}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                {CONTACT.email}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <h1 className="text-[26px] font-black leading-none text-slate-800">ใบส่งสินค้า</h1>
            <p className="mt-1.5 text-[10px] font-medium tracking-[0.25em] text-slate-400">
              DELIVERY NOTE
            </p>
          </div>
        </div>

        {/* Document meta — right aligned under the title */}
        <div className="mt-6 ml-auto w-full max-w-[340px] text-[12px]">
          <MetaLine k="เลขที่เอกสาร" v={`#${docNo}`} />
          <MetaLine k="วันที่" v={dateLabel} />
        </div>

        {/* Recipient */}
        <SectionHead th="ข้อมูลผู้รับสินค้า" en="RECIPIENT" />
        <div className="flex flex-wrap gap-x-10 gap-y-1.5 text-[12px]">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Field k="รหัสลูกค้า" v={head.userid ?? "—"} mono />
            <Field k="ชื่อผู้รับ" v={consigneeName ? `คุณ${consigneeName}` : "—"} />
            <Field k="ที่อยู่จัดส่ง" v={consigneeAddress || "—"} />
            <Field k="โทรศัพท์" v={consigneePhones.join(", ") || "—"} />
          </div>
          <div className="w-[210px] shrink-0">
            <Field k="ขนส่งโดย" v={nameShipBy(head.fshipby)} />
          </div>
        </div>

        {/* Items — hairline rules, no boxed grid */}
        <table className="mt-6 w-full text-[12px]">
          <thead>
            <tr className="border-y border-slate-300 text-slate-500">
              <ItemTh th="ลำดับที่" en="ITEM" className="w-20 text-left" />
              <ItemTh th="รายการ" en="DESCRIPTION" className="text-left" />
              <ItemTh th="ที่ตั้ง" en="LOCATION" className="w-24 text-center" />
              <ItemTh th="น้ำหนัก" en="Kg" className="w-24 text-right" />
              <ItemTh th="ปริมาตร" en="CBM" className="w-24 text-right" />
              <ItemTh th="จำนวน" en="BOX" className="w-20 text-right" />
            </tr>
          </thead>
          <tbody>
            {forwarders.map((f) => (
              <tr key={f.id} className="border-b border-slate-100">
                <td className="py-2 font-mono">{f.id}</td>
                <td className="py-2 break-words">{f.ftrackingchn || "—"}</td>
                <td className="py-2 text-center">{f.fpallet || "—"}</td>
                <td className="py-2 text-right">{fmt(f.fweight, 2)}</td>
                <td className="py-2 text-right">{fmt(f.fvolume, 3)}</td>
                <td className="py-2 text-right">{fmt(f.famount, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals + QR — right column */}
        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-[320px]">
            <TotalLine k="น้ำหนักรวม" v={fmt(totalWeight, 2)} unit="Kg" />
            <TotalLine k="ปริมาตรรวม" v={fmt(totalCbm, 3)} unit="CBM" />
            <TotalLine k="จำนวนรวม" v={fmt(totalBoxes, 0)} unit="BOX" strong />

            {qr ? (
              <div className="mt-5 flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt={`QR รอบ #${batch.id}`}
                  title={runUrl}
                  className="h-[76px] w-[76px]"
                />
                <p className="mt-1 text-center text-[9px] leading-tight text-slate-400">
                  ตรวจสอบเอกสาร
                  <br />
                  สแกนเพื่อเปิดรายการ
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-3 gap-8 text-[12px]">
          {["ผู้รับสินค้า", "ผู้ส่งสินค้า", "ผู้ตรวจสอบ"].map((label) => (
            <div key={label}>
              <p className="text-slate-600">{label}</p>
              <div className="mt-9 border-b border-dotted border-slate-400" />
              <p className="mt-2 text-slate-600">วันที่ / Date</p>
              <div className="mt-7 border-b border-dotted border-slate-400" />
            </div>
          ))}
        </div>

        <p className="no-print pt-8 text-center text-[11px] text-slate-400">
          กดปุ่ม &quot;พิมพ์ใบส่งสินค้า&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด Ctrl+P
        </p>
      </main>
    </div>
  );
}

/** Right-aligned `label : value` line in the document meta block. */
function MetaLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5">
      <span className="shrink-0 text-slate-500">{k} :</span>
      <span className="min-w-0 break-words text-right font-semibold">{v}</span>
    </div>
  );
}

/** Section heading with the accent bar (ข้อมูลผู้รับสินค้า / RECIPIENT). */
function SectionHead({ th, en }: { th: string; en: string }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-2">
      <span className="h-4 w-1 rounded-sm bg-primary-600" />
      <h2 className="text-[12px] font-bold text-slate-800">
        {th} <span className="font-normal text-slate-400">/ {en}</span>
      </h2>
    </div>
  );
}

/** One `label   value` row in the recipient block. */
function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-[74px] shrink-0 text-slate-500">{k}</span>
      <span className={`min-w-0 break-words ${mono ? "font-mono font-semibold" : ""}`}>
        {v}
      </span>
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
    <th className={`py-2 align-bottom font-semibold ${className}`}>
      {th}
      <br />
      <span className="text-[10px] font-normal uppercase tracking-wide text-slate-400">
        {en}
      </span>
    </th>
  );
}

/** One totals row — label · value · unit. */
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
      className={`flex items-baseline justify-between gap-3 border-b py-1.5 text-[12px] ${
        strong ? "border-slate-300" : "border-slate-100"
      }`}
    >
      <span className="text-slate-500">{k}</span>
      <span className="flex items-baseline gap-2">
        <span className={strong ? "font-bold" : "font-semibold"}>{v}</span>
        <span className="w-9 text-right text-[10px] text-slate-400">{unit}</span>
      </span>
    </div>
  );
}
