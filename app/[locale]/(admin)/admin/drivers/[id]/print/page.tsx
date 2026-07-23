/**
 * /admin/drivers/[id]/print — driver A4 "บิลจัดส่ง / Delivery Note".
 * Faithful port of legacy PCS Cargo `member/pcs-admin/printDriver.php`
 * (248 LOC · D1 / ADR-0017).
 *
 * ── The DRIVER's document (พี่ป๊อป spec 2026-07-06 · BUILD item #7) ────
 * This is one of TWO split logistics documents. It is the DRIVER's copy:
 * ordered by customer/address (userID ASC), with the ship-to string and a
 * per-recipient "ผู้รับสินค้า" sign line — everything the driver needs to
 * DELIVER. Its sibling — the warehouse "บิลหาสินค้า / Picking List"
 * (`../picking-list`) — is grouped by storage location so the assembler
 * can FIND the goods first. Same parcel set, different job.
 *
 * ── What the legacy printDriver.php does ─────────────────────────────
 * Given a driver-run id (`$_GET['id']` = tb_forwarder_driver.ID), it
 * renders ONE A4-P mPDF manifest the driver carries on the truck:
 *
 *   - HEADER (L148-156): Pacred logo + the batch title (fdName) + driver
 *     (fdAdminID) + create date (fdDate) + the run totals
 *     (SUM(fAmount) boxes · COUNT(fID) trackings · fdAmount stops).
 *   - TABLE  (L168-216): one row per forwarder in the run —
 *       ลำดับ (running no : fID) ·
 *       รหัสลูกค้า (userID + box / Kg / CBM / Location) ·
 *       ที่อยู่จัดส่ง (CONCAT'd fAddress* string) ·
 *       บริษัทขนส่ง (nameShipBy(fShipBy)) ·
 *       เลขแทรคกิ้ง (fTrackingCHN) ·
 *       ผู้รับสินค้า (a blank "____________" sign-here line).
 *
 * The run's forwarder ids come from tb_forwarder_driver_item.fID
 * (printDriver.php L17-24), joined to tb_forwarder for the row data
 * (L180-184), ORDER BY userID ASC.
 *
 * ── Data — tables/columns (lowercase on prod · CLAUDE.md casing) ─────
 *   tb_forwarder_driver       — id, fdname, fdadminid, fddate, fdamount
 *   tb_forwarder_driver_item  — fid (the run's forwarder ids)
 *   tb_forwarder              — id, userid, ftrackingchn, fshipby,
 *                               famount, fweight, fvolume, fpallet,
 *                               + fAddress* (ship-to)
 *   tb_users                  — userName/userLastName (driver name in
 *                               the header · camelCase exception)
 *
 * This route REUSES the exact same join shape the driver-batch DETAIL
 * page (`drivers/[id]/page.tsx`) already runs, so the data is identical
 * to what staff see on screen — this is just the printable manifest.
 *
 * ── Notes ────────────────────────────────────────────────────────────
 *  - A render is a PURE READ — no writes. (The legacy printDriver.php had
 *    its printStatus3 UPDATE commented out, L187-188, so there's no
 *    mutation to defer here anyway.)
 *  - AGENTS.md §0c — every Supabase query destructures `error`.
 *  - Brand: "PCS Cargo" → Pacred (settled · uses site.ts constants) ·
 *    legacy `PCS<n>` codes shown verbatim as `PR<n>`.
 *  - Auth — same gate as the batch detail page (ops / super / driver);
 *    a driver may only print their OWN run.
 */

import { notFound } from "next/navigation";
import { MapPin, Package, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { PrintButton } from "@/components/print-button";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import {
  DOC_CREAM as CREAM,
  DOC_GOLD as GOLD,
  DOC_RED,
  DocBrandBlock,
  DocFooter,
  DocMetaBox,
  DocMetaRow,
  DocPrintStyles,
  DocStat,
  DocTitle,
} from "@/components/admin/driver-doc-paper";

export const dynamic = "force-dynamic";

type Batch = {
  id: number;
  fdname: string | null;
  fdadminid: string | null;
  fddate: string | null;
  fdamount: number | null;
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
  fcover: string | null;
};

const FORWARDER_COLS =
  "id, userid, ftrackingchn, fshipby, famount, fweight, fvolume, fpallet, " +
  "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
  "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2, " +
  "fcover";

function fmt(n: number | string | null | undefined, decimals = 0): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Ship-to line — the CONCAT from printDriver.php L181, with ONE change:
 * the อำเภอ/เขต is rendered as a red chip.
 *
 * Why (ปอน 2026-07-23): a driver plans and re-sorts his run by DISTRICT, so
 * that single token is what he hunts for on every row while the truck is
 * moving. Buried mid-sentence in a 4-line address it is the hardest thing on
 * the page to find; as a chip it is the easiest.
 *
 * The district is its own column (`faddressdistrict`) — no string-parsing
 * guesswork, so the chip can never highlight the wrong token.
 *
 * Empty parts now drop their prefix instead of printing a dangling "ต." /
 * "อ." / "จ." (the old CONCAT emitted those unconditionally). Rows WITH data
 * render byte-identical to before, apart from the chip.
 */
function ShipToAddress({ f }: { f: Forwarder }) {
  const who = `คุณ ${f.faddressname ?? ""} ${f.faddresslastname ?? ""} ${f.faddressno ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const sub = (f.faddresssubdistrict ?? "").trim();
  const district = (f.faddressdistrict ?? "").trim();
  const province = (f.faddressprovince ?? "").trim();
  const zip = (f.faddresszipcode ?? "").trim();
  const tel = [(f.faddresstel ?? "").trim(), (f.faddresstel2 ?? "").trim()]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {who}
      {sub ? ` ต.${sub}` : ""}
      {district ? (
        <>
          {" "}
          <span
            className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-bold text-white"
            style={{ background: DOC_RED }}
          >
            อ.{district}
          </span>
        </>
      ) : null}
      {province ? ` จ.${province}` : ""}
      {zip ? ` ${zip}` : ""}
      {tel ? ` โทร. ${tel}` : ""}
    </>
  );
}

export default async function DriverPickingSlipPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Same gate as the batch detail page — ops/super see all; driver
  // sees only their own run (enforced below).
  // warehouse included — warehouse staff print the delivery note on-site
  // (ภูม 2026-06-17 · owner confirmed).
  const { user, roles } = await requireAdmin(["ops", "super", "driver", "warehouse"]);
  const { id } = await params;
  const batchId = Number.parseInt(id, 10);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const admin = createAdminClient();
  // god/ops/warehouse = staff who may print ANY run; a bare driver only their own.
  // isGodRole covers ultra+super (mirrors the sibling detail page drivers/[id]/page.tsx).
  const isOpsOverride =
    isGodRole(roles) || roles.includes("ops") || roles.includes("warehouse");

  // 1. Batch header — printDriver.php L25-29.
  const { data: batchData, error: batchErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdname, fdadminid, fddate, fdamount")
    .eq("id", batchId)
    .maybeSingle<Batch>();
  if (batchErr) {
    console.error(`/admin/drivers/${id}/print: batch read failed`, {
      code: batchErr.code,
      message: batchErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรอบจัดส่ง: ${batchErr.message}`);
  }
  if (!batchData) notFound();
  const batch = batchData;

  // Driver role — may only print their own run (same rule as detail page).
  if (!isOpsOverride) {
    const { data: myProfile, error: myProfileErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (myProfileErr) {
      console.error("[drivers/[id]/print] profiles lookup failed", {
        code: myProfileErr.code,
        message: myProfileErr.message,
      });
    }
    if (myProfile?.member_code !== batch.fdadminid) {
      notFound();
    }
  }

  // 2. The run's forwarder ids — printDriver.php L17-24.
  const { data: itemsData, error: itemsErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid")
    .eq("fdid", batchId);
  if (itemsErr) {
    console.error(`/admin/drivers/${id}/print: item read failed`, {
      code: itemsErr.code,
      message: itemsErr.message,
    });
    throw new Error(`ไม่สามารถอ่านรายการในรอบ: ${itemsErr.message}`);
  }
  const fwdIds = Array.from(
    new Set(((itemsData ?? []) as { fid: number }[]).map((it) => it.fid)),
  );

  // 3. Forwarder rows — printDriver.php L180-184 (ORDER BY userID ASC).
  let forwarders: Forwarder[] = [];
  if (fwdIds.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(FORWARDER_COLS)
      .in("id", fwdIds)
      .order("userid", { ascending: true });
    if (fwdErr) {
      console.error(`/admin/drivers/${id}/print: forwarder read failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
      throw new Error(`ไม่สามารถอ่านรายการสินค้า: ${fwdErr.message}`);
    }
    forwarders = (fwdData ?? []) as unknown as Forwarder[];
  }

  // 3b. รูปสินค้า (fcover) → signed/legacy URL per parcel, shown under the
  //     tracking number (ปอน 2026-07-23). The driver matches the carton in his
  //     hand to the picture before he hands it over — a 14-digit tracking
  //     number is slow and error-prone to read off a scuffed label.
  //     Same resolver the sibling บิลหาสินค้า uses. Parallel; no cover → a
  //     "ไม่มีรูป" placeholder so the column keeps its rhythm.
  const coverByFid = new Map<number, string>();
  await Promise.all(
    forwarders.map(async (f) => {
      if (f.fcover) {
        const u = await resolveLegacyUrl(f.fcover, "cover");
        if (u) coverByFid.set(f.id, u);
      }
    }),
  );

  // 4. Driver display name — tb_users camelCase (CLAUDE.md exception).
  let driverName = "—";
  if (batch.fdadminid) {
    const { data: driverUser, error: driverUserErr } = await admin
      .from("tb_users")
      .select("userName, userLastName")
      .eq("userID", batch.fdadminid)
      .maybeSingle<{ userName: string | null; userLastName: string | null }>();
    if (driverUserErr) {
      console.error("[drivers/[id]/print] driver user lookup failed", {
        code: driverUserErr.code,
        message: driverUserErr.message,
      });
    }
    if (driverUser) {
      driverName =
        `${driverUser.userName ?? ""} ${driverUser.userLastName ?? ""}`.trim() ||
        "—";
    }
  }

  // ── เอกสารอ้างอิงของรอบนี้ (owner 2026-07-15 · "เชื่อมโยง อ้างอิงถึงกัน" · F11) ──
  // The ใบวางบิล / ใบเสร็จ covering this run's parcels — surfaced in the on-screen
  // toolbar (NOT on the printed manifest, which is the driver/customer copy) so staff
  // cross-check the delivery note against the money docs in ≤1 click. READ-ONLY; soft-fail.
  // (Ship-to reconciliation between faddress* and the bill/receipt delivery_address is a
  // separate owner decision · not changed here.)
  const refBills: Array<{ id: number; docNo: string }> = [];
  const refReceipts: Array<{ id: number; rid: string }> = [];
  if (fwdIds.length > 0) {
    const { data: biItems, error: biErr } = await admin
      .from("tb_forwarder_invoice_item").select("invoice_id").in("forwarder_id", fwdIds);
    if (biErr) console.error("[drivers/[id]/print] ref-bill items failed", { code: biErr.code, message: biErr.message, batchId });
    const invIds = Array.from(new Set(((biItems ?? []) as { invoice_id: number }[]).map((x) => x.invoice_id)));
    if (invIds.length > 0) {
      const { data: invs, error: invErr } = await admin
        .from("tb_forwarder_invoice").select("id, doc_no").in("id", invIds).order("id", { ascending: false });
      if (invErr) console.error("[drivers/[id]/print] ref-bill headers failed", { code: invErr.code, message: invErr.message, batchId });
      for (const iv of (invs ?? []) as Array<{ id: number; doc_no: string | null }>)
        refBills.push({ id: iv.id, docNo: (iv.doc_no ?? "").trim() || `#${iv.id}` });
    }
    const { data: rItems, error: riErr } = await admin
      .from("tb_receipt_item").select("rid").in("fid", fwdIds);
    if (riErr) console.error("[drivers/[id]/print] ref-receipt items failed", { code: riErr.code, message: riErr.message, batchId });
    const rids = Array.from(new Set(((rItems ?? []) as { rid: string | null }[]).map((x) => (x.rid ?? "").trim()).filter(Boolean)));
    if (rids.length > 0) {
      const { data: recs, error: recErr } = await admin
        .from("tb_receipt").select("id, rid").in("rid", rids).order("id", { ascending: false });
      if (recErr) console.error("[drivers/[id]/print] ref-receipt headers failed", { code: recErr.code, message: recErr.message, batchId });
      for (const rc of (recs ?? []) as Array<{ id: number; rid: string | null }>)
        refReceipts.push({ id: rc.id, rid: (rc.rid ?? "").trim() || `#${rc.id}` });
    }
  }

  // Header aggregates — printDriver.php L30-38 (SUM/COUNT).
  const totalBoxes = forwarders.reduce((s, f) => s + Number(f.famount ?? 0), 0);
  const totalTrackings = forwarders.length;
  const totalStops = batch.fdamount ?? 0;

  const dateLabel = batch.fddate
    ? new Date(batch.fddate).toLocaleString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="doc-desk min-h-screen bg-slate-100 text-slate-900">
      <DocPrintStyles />

      {/* On-screen toolbar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/admin/drivers/${batch.id}`}
            className="text-primary-600 hover:underline"
          >
            ← กลับรายละเอียดรอบ
          </Link>
          <Link
            href={`/admin/drivers/${batch.id}/picking-list`}
            target="_blank"
            className="text-primary-600 hover:underline"
          >
            บิลหาสินค้า (คลัง) →
          </Link>
          <span className="text-xs text-gray-500">
            บิลจัดส่ง · รอบ #{batch.id} · {totalTrackings} แทรคกิ้ง
          </span>
          {/* เอกสารอ้างอิง — ใบวางบิล / ใบเสร็จ ของรอบนี้ (F11 · no-print) */}
          {refBills.map((b) => (
            <Link key={`b${b.id}`} href={`/admin/billing-run/${b.id}`}
              className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 font-mono text-xs text-sky-700 hover:bg-sky-100">
              🧾 {b.docNo} →
            </Link>
          ))}
          {refReceipts.map((rc) => (
            <Link key={`r${rc.id}`} href={`/admin/accounting/forwarder-invoice/${rc.id}`}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700 hover:bg-emerald-100">
              🧾 {rc.rid} →
            </Link>
          ))}
        </div>
        <PrintButton label="🖨 พิมพ์บิลจัดส่ง" />
      </div>

      <main className="print-area mx-auto my-6 max-w-[860px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-5 p-6 sm:p-9">
        {/* Header — logo/company + batch meta (printDriver.php L130-157) */}
        <div className="flex items-start justify-between gap-6">
          <DocBrandBlock />
          <div className="w-[46%] max-w-[320px] shrink-0">
            <DocTitle title="บิลจัดส่ง" subtitle="Delivery Note (คนขับ)" />
            <DocMetaBox>
              <DocMetaRow k="ชื่อเรื่อง" v={batch.fdname ?? `รอบ #${batch.id}`} />
              <DocMetaRow
                k="ผู้ส่งสินค้า"
                v={
                  <>
                    <span className="font-mono">{batch.fdadminid ?? "—"}</span>
                    {driverName ? ` · ${driverName}` : ""}
                  </>
                }
              />
              <DocMetaRow k="วันที่สร้าง" v={dateLabel} last />
            </DocMetaBox>
          </div>
        </div>

        {/* Run totals strip (printDriver.php L152-156) */}
        <div className="grid grid-cols-3 gap-3">
          <DocStat
            icon={<Package className="h-5 w-5" style={{ color: GOLD }} />}
            label="จำนวนกล่อง"
            value={fmt(totalBoxes, 0)}          />
          <DocStat
            icon={<Truck className="h-5 w-5" style={{ color: GOLD }} />}
            label="จำนวนแทรคกิ้ง"
            value={fmt(totalTrackings, 0)}          />
          <DocStat
            icon={<MapPin className="h-5 w-5" style={{ color: GOLD }} />}
            label="จำนวนจุดที่ส่ง"
            value={fmt(totalStops, 0)}          />
        </div>

        {/* Manifest table (printDriver.php L168-216) */}
        <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-center" style={{ background: CREAM }}>
              <th className="border border-slate-200 px-2 py-2.5 w-14 font-bold">ลำดับ</th>
              <th className="border border-slate-200 px-2 py-2.5 w-28 font-bold">รหัสลูกค้า</th>
              <th className="border border-slate-200 px-2 py-2.5 font-bold">ที่อยู่จัดส่ง</th>
              <th className="border border-slate-200 px-2 py-2.5 w-28 font-bold">บริษัทขนส่ง</th>
              <th className="border border-slate-200 px-2 py-2.5 w-32 font-bold">เลขแทรคกิ้ง</th>
              <th className="border border-slate-200 px-2 py-2.5 w-28 font-bold">ผู้รับสินค้า</th>
            </tr>
          </thead>
          <tbody>
            {forwarders.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-slate-200 px-2 py-6 text-center text-gray-500"
                >
                  ไม่มีรายการในรอบนี้
                </td>
              </tr>
            ) : (
              forwarders.map((f, idx) => (
                <tr key={f.id} className="align-top">
                  {/* ลำดับ : fID (printDriver.php L205 — "($count+1):$row[ID]") */}
                  <td className="border border-slate-200 px-1 py-1 text-center font-mono">
                    {idx + 1}:#{f.id}
                  </td>
                  {/* รหัสลูกค้า + box/Kg/CBM/Location (printDriver.php L206) */}
                  <td className="border border-slate-200 px-2 py-1">
                    <div className="font-bold font-mono">{f.userid ?? "—"}</div>
                    <div className="text-[11px] text-gray-600 leading-tight">
                      box: {fmt(f.famount, 0)}
                      <br />
                      Kg: {fmt(f.fweight, 2)}
                      <br />
                      CBM: {fmt(f.fvolume, 3)}
                      <br />
                      Location: {f.fpallet || "—"}
                    </div>
                  </td>
                  {/* ที่อยู่จัดส่ง (printDriver.php L207) */}
                  <td className="border border-slate-200 px-2 py-1 leading-snug">
                    <ShipToAddress f={f} />
                  </td>
                  {/* บริษัทขนส่ง (printDriver.php L208) */}
                  <td className="border border-slate-200 px-2 py-1 text-center">
                    {nameShipBy(f.fshipby)}
                  </td>
                  {/* เลขแทรคกิ้ง (printDriver.php L209-212) */}
                  <td className="border border-slate-200 px-2 py-1 text-center break-words">
                    <div>{f.ftrackingchn || "—"}</div>
                    {coverByFid.has(f.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverByFid.get(f.id)}
                        alt={f.ftrackingchn ?? "รูปสินค้า"}
                        className="mx-auto mt-1 h-16 w-16 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <span className="mt-1 inline-flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[11px] text-slate-400">
                        ไม่มีรูป
                      </span>
                    )}
                  </td>
                  {/* ผู้รับสินค้า — blank sign-here line (printDriver.php L213).
                      align-middle (not the row's align-top): the rows are tall
                      now that each carries a photo, and a signature line pinned
                      to the top edge is awkward to sign against — the customer
                      wants the pen in the middle of the box. `<td>` defaults to
                      `vertical-align: inherit`, so this overrides the row. */}
                  <td className="border border-slate-200 px-2 py-1 text-center align-middle text-slate-300">
                    ____________
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        <DocFooter
          left={`เอกสารเลขที่: ${batch.fdname ?? `รอบ #${batch.id}`}`}
          right="หน้า 1 จาก 1"
        />

        <p className="no-print text-[11px] text-slate-400 text-center">
          กดปุ่ม &quot;พิมพ์บิลจัดส่ง&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด
          Ctrl+P
        </p>
        </div>
      </main>
    </div>
  );
}
