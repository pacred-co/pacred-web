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
import { Mail, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { qrSvgDataUrl } from "@/lib/barcode";
import { DocPrintStyles } from "@/components/admin/driver-doc-paper";
import { DocSectionLabel } from "@/components/receipt/doc-section-label";
import { DocCertRow } from "@/components/receipt/doc-cert-row";
import { SITE_LEGAL_NAME_TH, SITE_URL, ADDRESSES, CONTACT, TAX_ID } from "@/components/seo/site";

export const dynamic = "force-dynamic";

const LOGO = "/images/pacred-logo-tight.png";

/**
 * 🎨 owner 2026-07-23: "แก้ไขให้เป็นแพทเทิร์นเดียวกัน … ไปลอกมาจากใบแจ้งหนี้ในระบบเลย"
 *
 * ใบส่งสินค้า จึงย้ายมาใช้ house style ของเอกสารฝั่ง "ส่งให้ลูกค้า" — ชุดเดียวกับ
 * ใบแจ้งหนี้ (`wallet/pay-user/summary/summary-doc.tsx`) · ใบวางบิล · ใบเสร็จ:
 * โครงสร้าง/เส้น/ระยะ ตามใบแจ้งหนี้ + ป้ายหมวด <DocSectionLabel>
 * + แถวลายเซ็น <DocCertRow> (ได้ลายเซ็นจริง + ตราบริษัท เหมือนใบแจ้งหนี้).
 *
 * ⚠️ ตั้งใจ "ไม่" ไปแก้สีใน `driver-doc-paper.tsx` (ซึ่งจะลากบิลจัดส่ง + บิลหาสินค้า
 * มาด้วย) — ไฟล์นั้นจดเหตุผลไว้ว่าใช้ทองแทนแดง "เพราะเป็นเอกสารโกดัง/คนขับ ต้องไม่ถูก
 * มองผ่านๆ ว่าเป็นเอกสารการเงิน". เส้นแบ่งที่ใช้ตัดสิน = ใบไหน "ยื่นให้ลูกค้าเซ็น":
 *   • ใบส่งสินค้า (ใบนี้) → ลูกค้าเซ็นรับ = เอกสารหน้าบ้าน → ตามชุดใบแจ้งหนี้
 *   • บิลจัดส่ง / บิลหาสินค้า → กระดาษทำงานภายใน → คงทองไว้ตามเดิม
 */
/**
 * 🔴 owner 2026-07-23 (รอบสอง): "กรอบ ไอคอน อะไรที่เป็นสีเหลืองในหน้านี้ เปลี่ยนเป็น
 * สีแดงให้หมด" → ทั้งใบใช้ **แดงแบรนด์** `#B30000` (= `--color-primary-600` ใน
 * globals.css และ `DOC_RED` ใน driver-doc-paper) แทนส้มของใบแจ้งหนี้.
 * โครงสร้าง/เส้น/ระยะ ยังยึดใบแจ้งหนี้เหมือนเดิม — เปลี่ยนแค่เฉดสี.
 * พื้นอ่อนใช้ alpha ต่ำกว่าส้ม (.10 vs .165) เพราะแดงเข้มกว่า ถ้าใช้ค่าเท่ากันจะทึบ
 * จนตัวหนังสือบนแถบอ่านยาก.
 */
const TITLE_COLOR = "#B30000";
const TINT_BG = "rgba(179,0,0,0.10)";
/** เส้นผมคั่นแถว — ค่าเดียวกับที่ใบแจ้งหนี้ใช้ (tdC/tdNum → borderTop 0.5px #e5e7eb). */
const HAIRLINE = "#e5e7eb";
/** เส้นแบ่งโครงสร้าง — ค่าเดียวกับใบแจ้งหนี้ (`1px solid #d8dade`).
 *  owner 2026-07-23: ย้ายจาก "ใต้หัวเอกสาร" มาไว้ "ใต้บล็อกผู้รับ/ขนส่งโดย" แทน
 *  → เส้นเดียวในเอกสาร ทำหน้าที่แยก "ใครรับ" ออกจาก "ของอะไรบ้าง". */
const RULE = "#d8dade";
// ชื่อเดิมที่ตัวหน้าใช้อยู่ — ชี้มาที่โทนใหม่ทั้งคู่ ไม่ต้องไล่แก้ทุกจุดที่อ้างถึง
const GOLD = TITLE_COLOR;
const CREAM = TINT_BG;

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

/**
 * เบอร์โทรที่ "ใช้ได้จริง" → รูปแบบไทยอ่านง่าย 0XX-XXX-XXXX, ใช้ไม่ได้ → "".
 *
 * ต้องกรองเพราะ prod มีค่าขยะปนอยู่จริงในช่องเบอร์ (`na-230`, `0`) — ถ้าพิมพ์ตรงๆ
 * ลงเอกสารที่ยื่นให้ลูกค้าจะกลายเป็นเบอร์มั่ว. เกณฑ์: ต้องมีตัวเลขอย่างน้อย 9 ตัว.
 * `+66…` แปลงกลับเป็น `0…` ให้อ่านแบบไทย (ในระบบเก็บทั้ง 2 แบบปนกัน).
 */
function displayThaiPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return "";
  const local = digits.startsWith("66") ? `0${digits.slice(2)}` : digits;
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  if (local.length === 9) return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  return local;
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

  // ── ชื่อคนขับ (owner 2026-07-23 "เอาชื่อจริงมาใส่ ไม่ใช่ user") ──────────────
  // `tb_forwarder_driver.fdadminid` เก็บ "รหัสพนักงาน" (AD###) แต่ของเก่าบางแถว
  // เก็บ "ชื่อล็อกอิน" (เช่น admin_pond) แทน → จับคู่ทั้ง 2 คอลัมน์.
  //
  // ⚠️ ห้ามหาใน `tb_users` — ตารางนั้นเป็นของ "ลูกค้า" พนักงานไม่มีแถวอยู่ในนั้น
  // (ยืนยันกับ prod: AD020 ไม่มีใน tb_users) ซึ่งเป็นสาเหตุที่คอลัมน์ "ผู้รับผิดชอบ"
  // บนหน้ารายการรอบโชว์รหัสดิบแทนชื่อ. ชื่อจริงอยู่ที่ `profiles` + ชื่อเล่นอยู่ที่
  // `admin_contact_extras`.
  let driverName = "";
  let driverPhone = "";
  if (batch.fdadminid) {
    const { data: drv, error: drvErr } = await admin
      .from("profiles")
      .select("id, first_name, last_name, phone, member_code, admin_login_id")
      .or(`member_code.eq.${batch.fdadminid},admin_login_id.eq.${batch.fdadminid}`)
      .limit(1)
      .maybeSingle<{
        id: string; first_name: string | null; last_name: string | null; phone: string | null;
      }>();
    if (drvErr) {
      // ชื่อคนขับเป็นข้อมูลประกอบ — อ่านไม่ได้ให้พิมพ์เอกสารต่อได้ ไม่ทำทั้งใบล้ม
      console.error(`/admin/drivers/${id}/delivery-slip: driver name lookup failed`, {
        code: drvErr.code,
        message: drvErr.message,
      });
    }
    driverName = [drv?.first_name, drv?.last_name]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ");

    // เบอร์คนขับ — prod เก็บคนละช่องกันแล้วแต่คน (Ben อยู่ extras.work_phone ·
    // ปอนด์อยู่ profiles.phone) จึงต้องไล่หลายช่อง. ไม่ใช้ tb_admin.adminTel
    // เพราะมีค่าขยะ ('na-230' / '0') ปนอยู่.
    if (drv?.id) {
      const { data: ex, error: exErr } = await admin
        .from("admin_contact_extras")
        .select("work_phone, direct_phone")
        .eq("profile_id", drv.id)
        .maybeSingle<{ work_phone: string | null; direct_phone: string | null }>();
      if (exErr) {
        console.error(`/admin/drivers/${id}/delivery-slip: driver phone lookup failed`, {
          code: exErr.code,
          message: exErr.message,
        });
      }
      driverPhone =
        displayThaiPhone(ex?.work_phone) ||
        displayThaiPhone(ex?.direct_phone) ||
        displayThaiPhone(drv.phone);
    }
  }
  // หาชื่อไม่เจอ → โชว์รหัสไว้ ดีกว่าเว้นว่างจนไม่รู้ว่าใครขับ
  const driverLabel = driverName || batch.fdadminid || "—";

  const docNo = forwarders.map((f) => f.id).join(",");
  // วันที่อย่างเดียว ไม่เอาเวลา (owner 2026-07-23) — ใบส่งสินค้าเป็นเอกสารราย "วัน"
  // เวลาที่สร้างรอบไม่ได้ให้ข้อมูลอะไรกับคนรับของ. ใช้ทั้งกล่องเลขที่และใต้ลายเซ็น.
  const dateLabel = batch.fddate
    ? new Date(batch.fddate).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
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
      {/* ซ่อน URL/วันที่/เลขหน้า ที่ browser แปะบนหัว-ท้ายกระดาษตอนสั่งพิมพ์
          (owner 2026-07-23 "เวลาสั่งพิมพ์มันขึ้นลิงก์เว็ป").
          หัว-ท้ายพวกนั้นถูกวาดใน "ขอบกระดาษ" ของ @page → บีบขอบเป็น 0 มันก็ไม่มี
          ที่ให้วาด. แล้วค่อยใส่ขอบกระดาษเองที่ตัวเอกสารแทน ไม่งั้นเนื้อหาจะชนขอบ.
          ประกาศไว้ "หลัง" <DocPrintStyles /> เพื่อ override @page ของชุดเอกสาร
          คนขับเฉพาะหน้านี้ (บิลจัดส่ง/บิลหาสินค้า ยังใช้ margin 1cm เหมือนเดิม).
          ⚠️ ไม่ 100% ทุก browser — Chrome/Edge ทำตาม, บางตัวยังโชว์อยู่ ทางที่
          ชัวร์สุดคือติ๊ก "Headers and footers" ออกในหน้าต่างพิมพ์. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          /* คืนขอบกระดาษให้เนื้อหาเอง + สูงเต็มหน้าเพื่อให้บล็อกล่างยังไปติดก้นหน้า */
          .print-area {
            padding: 12mm 12mm !important;
            min-height: 297mm !important;
          }
        }
      `}</style>

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
      {/* หน้าเป็นคอลัมน์ยืดได้ — ตัวคั่น flex-1 ใต้ตารางดันบล็อกล่าง (สรุป ·
          หมายเหตุ · ลายเซ็น) ลงไปติดก้นกระดาษ.
          ⚠️ ความสูงเท่าหน้า A4 ใส่ไว้ "เฉพาะตอนพิมพ์" (ดู <style> ด้านบน) ไม่ใส่
          บนจอ — owner 2026-07-23 "จัดฟอร์มให้กลางๆ มันเคลื่อนแปลกๆ": ถ้าบังคับ
          สูง 277mm บนจอด้วย รายการน้อยๆ จะเกิดช่องว่างยักษ์กลางเอกสาร อ่านแล้ว
          เหมือนของหลุดลอย. บนจอปล่อยให้การ์ดสูงเท่าเนื้อหา (กระชับ อยู่กลาง)
          ส่วนตอนพิมพ์ยังได้บล็อกล่างติดก้นหน้าเหมือนเดิม. */}
      {/* 📱 mobile-first (AGENTS.md §6) — คนขับเปิดใบนี้บนมือถือหน้างานจริง.
          ที่ 375px เนื้อที่เหลือ 311px แต่ของเดิมล็อกคอลัมน์ขวาไว้ 300px + gap 24
          = 324px → ล้น คอลัมน์ซ้ายถูกบีบจนแบน. ทุกจุดที่ล็อกความกว้างจึงปลดเป็น
          "เต็มแถวบนมือถือ · ค่าเดิมตั้งแต่ sm ขึ้นไป" — จอใหญ่และตอนพิมพ์ (กระดาษ
          A4 ≈ 794px = ผ่าน sm) หน้าตาเหมือนเดิมทุกประการ. */}
      <main className="print-area mx-auto my-6 flex max-w-[820px] flex-col bg-white p-4 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.06)]">
        {/* Header — sender (left) · document title + no./date (right) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
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

            {/* Recipient — legacy's เรียน / Attention block.
                owner 2026-07-23 "จัดซ้ายหน่อย ขยับขึ้นหน่อย ให้ชิดๆ กับข้างบน
                Pacred มันห่างไป" → ย้ายก้อนนี้ "เข้ามาอยู่ในคอลัมน์ซ้าย" ใต้ที่อยู่
                Pacred เลย. เดิมมันเป็นบล็อกเต็มความกว้าง "ใต้" แถวหัวเอกสาร ซึ่ง
                ความสูงของแถวถูกกำหนดโดยคอลัมน์ขวา (กล่องเลขที่ 4 บรรทัด + เบอร์
                คนขับ) ที่สูงกว่า → ต่อให้ลด margin เท่าไรก็ยังลอยห่าง เพราะช่องว่าง
                มาจากความสูงของอีกคอลัมน์ ไม่ใช่ margin. */}
            <div className="mt-3 text-[12px] leading-snug">
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
          </div>

          <div className="w-full sm:w-[300px] sm:shrink-0">
            <h1
              className="text-right text-[26px] font-black leading-none"
              style={{ color: GOLD }}
            >
              ใบส่งสินค้า
            </h1>
            <p className="mt-1.5 text-right text-[10px] font-medium tracking-[0.25em] text-slate-400">
              DELIVERY NOTE
            </p>
            {/* Peak meta box — พื้นอ่อน ไม่มีขอบ มุมโค้ง 2px เหมือนใบแจ้งหนี้
                (`summary-doc.tsx`: background TINT_BG + borderRadius 2px เปล่าๆ).
                เลิกใช้ <DocMetaBox> ของชุดเอกสารคนขับตรงนี้ เพราะกล่องนั้นมีขอบทอง
                — ใบนี้ย้ายมาตามชุดใบแจ้งหนี้แล้ว (owner 2026-07-23). */}
            <div className="mt-3 rounded-[3px]" style={{ background: TINT_BG }}>
              <MetaRow k="เลขที่/No." v={`#${docNo}`} />
              <MetaRow k="วันที่/Date" v={dateLabel} />
              {/* ชื่อ + เบอร์คนขับ อยู่ "แถวเดียวกัน" (owner 2026-07-23) — ชื่อบรรทัดบน
                  เบอร์บรรทัดล่างพร้อมไอคอน ไม่แยกไปลอยนอกกล่องอีกแล้ว */}
              <MetaRow
                k="ผู้ขับ/Driver"
                v={
                  // inline-flex (ไม่ใช่ flex) → ชื่อกับเบอร์อยู่ "บรรทัดเดียวกัน"
                  // flex-wrap ไว้เผื่อชื่อไทยยาวๆ จนไม่พอ ให้เบอร์ตกบรรทัดเองอย่าง
                  // เรียบร้อย ดีกว่าดันล้นออกนอกกล่อง
                  <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2">
                    <span>{driverLabel}</span>
                    {/* ไม่มีไอคอนโทรศัพท์ตรงนี้ (owner 2026-07-23) — อยู่ในกล่องที่มี
                        ป้าย "ผู้ขับ/Driver" กำกับอยู่แล้ว ไอคอนเลยกลายเป็นของเกิน */}
                    {driverPhone && (
                      <span className="text-[11px] font-normal text-slate-600">{driverPhone}</span>
                    )}
                  </span>
                }
              />
              {/* ทะเบียนรถ — owner 2026-07-23. ค้นทั้ง DB แล้วไม่มีที่เก็บทะเบียน
                  รถเลย (ไม่มีคอลัมน์ใน tb_forwarder_driver / tb_admin และไม่มี
                  ตารางรถ) จึงพิมพ์เป็น "ช่องเขียนมือ" ให้กรอกตอนส่งของ —
                  คนขับสลับคันได้ ทะเบียนจึงผูกกับ "รอบ" ไม่ใช่ "คน".
                  ถ้าจะให้พิมพ์มาจากระบบ ต้องมีที่เก็บก่อน (ดูสรุปที่คุยกับ owner). */}
              <MetaRow
                k="ทะเบียนรถ/Plate"
                v={<span className="inline-block w-[38mm] border-b border-dotted border-slate-400 align-bottom">&nbsp;</span>}
                last
              />
            </div>

            {/* (เบอร์คนขับย้ายเข้าไปอยู่ในแถว "ผู้ขับ/Driver" แล้ว 2026-07-23
                 ตาม owner — ไม่มีบรรทัดลอยนอกกล่องอีก) */}
          </div>
        </div>

        {/* ไม่มีเส้นปิดหัวเอกสารแล้ว (owner 2026-07-23) — ระยะห่างแยกหัวเอกสาร
            ออกจากบล็อกผู้รับเองอยู่แล้ว เส้นย้ายลงไปใต้ "ขนส่งโดย" แทน */}

        {/* เส้นแบ่ง — คั่น "ใครรับ / ส่งด้วยอะไร" ออกจาก "ของอะไรบ้าง"
            (owner 2026-07-23 "เอาเส้นมาขั้นตรงนี้แทน") */}
        <div className="mt-4" style={{ borderTop: `1px solid ${RULE}` }} />

        {/* Items — bordered grid with a tinted head + a รวม row (legacy shape) */}
        {/* Peak style (owner 2026-07-23 "ผมอยากได้แบบ peak") — ตารางไม่มีกรอบนอก
            ไม่มีเส้นทุกช่อง: พื้นอ่อนทั้งตาราง + เส้นผมคั่นแถวเท่านั้น เหมือน
            ใบแจ้งหนี้ (`summary-doc.tsx` tdC/tdNum ใช้ borderTop 0.5px อย่างเดียว). */}
        {/* overflow-x-AUTO ไม่ใช่ hidden — บนมือถือถ้าตาราง 6 คอลัมน์แคบเกินจะได้
            "เลื่อนดูได้" แทนที่จะโดนตัดหายไปเงียบๆ */}
        <div className="mt-5 overflow-x-auto rounded-[3px]" style={{ background: TINT_BG }}>
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
                // แถวข้อมูลพื้นขาว → แถบอ่อนเหลือแค่หัวตารางกับแถวรวม (Peak)
                <tr key={f.id} className="bg-white">
                  <td className="border-t border-slate-200 px-2 py-1.5 text-center font-mono">
                    {i + 1}:{f.id}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-1.5 text-center break-words">
                    {f.ftrackingchn || "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-1.5 text-center">
                    {f.fpallet || "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-1.5 text-center tabular-nums">
                    {fmt(f.fweight, 2)}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-1.5 text-center tabular-nums">
                    {fmt(f.fvolume, 3)}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-1.5 text-center tabular-nums">
                    {fmt(f.famount, 0)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold" style={{ background: CREAM }}>
                <td className="border-t border-slate-200 px-2 py-1.5 text-right" colSpan={3}>
                  รวม
                </td>
                <td className="border-t border-slate-200 px-2 py-1.5 text-center tabular-nums">
                  {fmt(totalWeight, 2)}
                </td>
                <td className="border-t border-slate-200 px-2 py-1.5 text-center tabular-nums">
                  {fmt(totalCbm, 3)}
                </td>
                <td className="border-t border-slate-200 px-2 py-1.5 text-center tabular-nums">
                  {fmt(totalBoxes, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ตัวคั่นยืดได้ — กินที่ว่างที่เหลือ ดันทุกอย่างข้างล่างไปติดก้นหน้า.
            รายการเยอะจนล้นหน้า ตัวนี้จะยุบเป็น 0 เองแล้วเนื้อหาไหลลงหน้าถัดไป. */}
        <div className="flex-1" aria-hidden="true" />

        {/* ── บล็อกท้ายเอกสาร (สรุป · หมายเหตุ · ลายเซ็น) ────────────────────
            `break-inside: avoid` กันไม่ให้กลุ่มนี้ถูกผ่าครึ่งคนละหน้าเวลาพิมพ์ */}
        <div style={{ breakInside: "avoid" }}>

        {/* สรุป box + QR */}
        {/* มือถือ: สรุปเต็มแถว แล้ว QR ลงมาอยู่ข้างล่าง (ของเดิม QR ล็อก 120px
            ทำให้กล่องสรุปเหลือ ~175px จนตัวเลขตกบรรทัด) */}
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-stretch">
          {/* กล่องสรุป = พื้นเปล่า ไม่มีสี ไม่มีขอบ (owner 2026-07-23 "เอาสีออก") —
              ตรงกับใบแจ้งหนี้ด้วย: ที่นั่นแถวสรุปก็พื้นเปล่า มีแค่บรรทัดยอดสุดท้าย
              บรรทัดเดียวที่ได้แถบสี ไม่ใช่ทั้งกล่อง. */}
          <div className="min-w-0 flex-1 px-1 py-1">
            {/* ป้ายหมวดตัวเดียวกับใบแจ้งหนี้/ใบวางบิล/ใบเสร็จ (📋 สรุป) */}
            <DocSectionLabel section="summary" style={{ marginBottom: "6px" }} />
            <TotalLine k="น้ำหนักรวม" v={fmt(totalWeight, 2)} unit="Kg" />
            <TotalLine k="ปริมาตรรวม" v={fmt(totalCbm, 3)} unit="CBM" />
            <TotalLine k="จำนวนรวม" v={fmt(totalBoxes, 0)} unit="BOX" strong />
          </div>

          {qr ? (
            <div className="flex w-full flex-col items-center justify-center sm:w-[120px] sm:shrink-0">
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

        {/* 💬 หมายเหตุ — ป้ายหมวดชุดเดียวกับใบแจ้งหนี้ */}
        <div className="mt-4 flex items-start gap-2">
          <DocSectionLabel section="remark" style={{ minWidth: "14mm" }} />
          <p className="text-[11px] leading-relaxed text-slate-500">
            เอกสารนี้จัดทำขึ้นเพื่อการตรวจสอบรายการจัดส่งสินค้าเท่านั้น — ไม่ใช่ใบเสร็จรับเงิน
            <br />
            {SITE_LEGAL_NAME_TH} เลขประจำตัวผู้เสียภาษี {TAX_ID}
          </p>
        </div>

        {/* ✍️ รับรอง — แถวลายเซ็นตัวเดียวกับใบแจ้งหนี้/ใบวางบิล/ใบเสร็จ
            (<DocCertRow>) จึงได้ลายเซ็นจริง + ตราบริษัทมาเหมือนกัน แทนที่จะเป็น
            เส้นประว่างๆ ที่วาดเองเฉพาะใบนี้. ป้าย 3 ช่องปรับเป็นภาษาของใบส่งสินค้า
            (ผู้ส่ง / ผู้ตรวจสอบ / ผู้รับสินค้า) ตามที่ legacy PCS ใช้. */}
        <div className="mt-6 flex items-start gap-2">
          <DocSectionLabel section="certify" style={{ minWidth: "14mm" }} />
          <DocCertRow
            customerName={consigneeName ? `คุณ${consigneeName}` : (head.userid ?? "")}
            dateIssued={dateLabel}
            issuerLabel="ผู้ส่งสินค้า (Pacred)"
            approverLabel="ผู้ตรวจสอบ (Pacred)"
            receiverLabel="ผู้รับสินค้า (ลูกค้า)"
            boxHeight="18mm"
          />
        </div>

        </div>{/* ── ปิดบล็อกท้ายเอกสาร ── */}

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
    // Peak: หัวตารางไม่มีเส้นเลย — แถบสีอ่อนทำหน้าที่แยกหัวออกจากเนื้อเอง
    <th className={`px-2 py-1.5 font-bold ${className}`}>
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
      style={strong ? undefined : { borderColor: HAIRLINE }}
    >
      <span className="text-slate-500">{k}</span>
      <span className="flex items-baseline gap-2">
        <span className={strong ? "font-bold" : "font-semibold"}>{v}</span>
        <span className="w-9 text-right text-[10px] text-slate-400">{unit}</span>
      </span>
    </div>
  );
}

// (SignBox ที่วาดเส้นประเองถูกถอดออก 2026-07-23 — แถวลายเซ็นใช้ <DocCertRow>
//  ตัวเดียวกับใบแจ้งหนี้/ใบวางบิล/ใบเสร็จแล้ว จึงไม่ต้องมีเวอร์ชันเฉพาะใบนี้อีก)

/** แถวในกล่อง เลขที่/วันที่ — Peak: ไม่มีขอบกล่อง มีแค่เส้นผมคั่นระหว่างแถว. */
function MetaRow({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <div
      className="flex items-start justify-between gap-3 px-3 py-1.5"
      style={last ? undefined : { borderBottom: `0.5px solid ${HAIRLINE}` }}
    >
      <span className="shrink-0 text-[11px] text-slate-500">{k}</span>
      <span className="min-w-0 break-words text-right text-[12px] font-semibold">{v}</span>
    </div>
  );
}
