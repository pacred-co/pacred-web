/**
 * /admin/drivers/[id]/print — driver A4 picking slip ("ใบส่งสินค้า").
 * Faithful port of legacy PCS Cargo `member/pcs-admin/printDriver.php`
 * (248 LOC · D1 / ADR-0017).
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
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { SITE_NAME, ADDRESSES, CONTACT } from "@/components/seo/site";

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

/** CONCAT('คุณ ',fAddressName,…) — printDriver.php L181 ship-to string. */
function fullAddress(f: Forwarder): string {
  return (
    `คุณ ${f.faddressname ?? ""} ${f.faddresslastname ?? ""} ${f.faddressno ?? ""}` +
    ` ต.${f.faddresssubdistrict ?? ""} อ.${f.faddressdistrict ?? ""}` +
    ` จ.${f.faddressprovince ?? ""} ${f.faddresszipcode ?? ""}` +
    ` โทร. ${f.faddresstel ?? ""}${f.faddresstel2 ? `, ${f.faddresstel2}` : ""}`
  ).replace(/\s+/g, " ").trim();
}

export default async function DriverPickingSlipPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Same gate as the batch detail page — ops/super see all; driver
  // sees only their own run (enforced below).
  const { user, roles } = await requireAdmin(["ops", "super", "driver"]);
  const { id } = await params;
  const batchId = Number.parseInt(id, 10);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const admin = createAdminClient();
  const isOpsOverride = roles.includes("ops") || roles.includes("super");

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
    <div className="bg-white text-black min-h-screen">
      {/* Print-only styles — hide admin sidebar + on-screen toolbar; A4. */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          html, body { background: #fff !important; }
          body { padding: 0 !important; margin: 0 !important; }
          .print-area { box-shadow: none !important; border: none !important; }
        }
        @page { size: A4 portrait; margin: 1cm; }
      `}</style>

      {/* On-screen toolbar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/admin/drivers/${batch.id}`}
            className="text-primary-600 hover:underline"
          >
            ← กลับรายละเอียดรอบ
          </Link>
          <span className="text-xs text-gray-500">
            ใบส่งสินค้า · รอบ #{batch.id} · {totalTrackings} แทรคกิ้ง
          </span>
        </div>
        <PrintButton label="🖨 พิมพ์ใบส่งสินค้า" />
      </div>

      <main className="print-area mx-auto max-w-[800px] p-6 space-y-4">
        {/* Header — logo/company + batch meta (printDriver.php L130-157) */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-3xl font-black text-primary-700 leading-none">
              {SITE_NAME}
            </h1>
            <p className="text-[11px] text-gray-600 mt-1">
              {ADDRESSES.office.full}
            </p>
            <p className="text-[11px] text-gray-600">
              โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </p>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <h2 className="text-xl font-bold">ใบส่งสินค้า</h2>
            <p className="text-gray-700">
              <span className="text-gray-500">ชื่อเรื่อง:</span>{" "}
              {batch.fdname ?? `รอบ #${batch.id}`}
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">ผู้ส่งสินค้า:</span>{" "}
              <span className="font-mono">{batch.fdadminid ?? "—"}</span> ·{" "}
              {driverName}
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">วันที่สร้าง:</span> {dateLabel}
            </p>
          </div>
        </div>

        {/* Run totals strip (printDriver.php L152-156) */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <Cell label="จำนวนกล่อง" value={fmt(totalBoxes, 0)} />
          <Cell label="จำนวนแทรคกิ้ง" value={fmt(totalTrackings, 0)} />
          <Cell label="จำนวนจุดที่ส่ง" value={fmt(totalStops, 0)} />
        </div>

        {/* Manifest table (printDriver.php L168-216) */}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-center">
              <th className="border border-gray-400 px-1 py-1 w-10">ลำดับ</th>
              <th className="border border-gray-400 px-2 py-1 w-28">รหัสลูกค้า</th>
              <th className="border border-gray-400 px-2 py-1">ที่อยู่จัดส่ง</th>
              <th className="border border-gray-400 px-2 py-1 w-24">บริษัทขนส่ง</th>
              <th className="border border-gray-400 px-2 py-1 w-28">เลขแทรคกิ้ง</th>
              <th className="border border-gray-400 px-2 py-1 w-24">ผู้รับสินค้า</th>
            </tr>
          </thead>
          <tbody>
            {forwarders.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-gray-400 px-2 py-6 text-center text-gray-500"
                >
                  ไม่มีรายการในรอบนี้
                </td>
              </tr>
            ) : (
              forwarders.map((f, idx) => (
                <tr key={f.id} className="align-top">
                  {/* ลำดับ : fID (printDriver.php L205 — "($count+1):$row[ID]") */}
                  <td className="border border-gray-400 px-1 py-1 text-center font-mono">
                    {idx + 1}:#{f.id}
                  </td>
                  {/* รหัสลูกค้า + box/Kg/CBM/Location (printDriver.php L206) */}
                  <td className="border border-gray-400 px-2 py-1">
                    <div className="font-bold font-mono">{f.userid ?? "—"}</div>
                    <div className="text-[10px] text-gray-600 leading-tight">
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
                  <td className="border border-gray-400 px-2 py-1 leading-snug">
                    {fullAddress(f)}
                  </td>
                  {/* บริษัทขนส่ง (printDriver.php L208) */}
                  <td className="border border-gray-400 px-2 py-1 text-center">
                    {nameShipBy(f.fshipby)}
                  </td>
                  {/* เลขแทรคกิ้ง (printDriver.php L209-212) */}
                  <td className="border border-gray-400 px-2 py-1 text-center break-all">
                    {f.ftrackingchn || "—"}
                  </td>
                  {/* ผู้รับสินค้า — blank sign-here line (printDriver.php L213) */}
                  <td className="border border-gray-400 px-2 py-1 text-center text-gray-400">
                    ____________
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="no-print text-[11px] text-gray-500 text-center pt-2">
          กดปุ่ม &quot;พิมพ์ใบส่งสินค้า&quot; ด้านบนเพื่อพิมพ์ หรือใช้คีย์บอร์ด
          Ctrl+P
        </p>
      </main>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-300 px-2 py-1.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}
