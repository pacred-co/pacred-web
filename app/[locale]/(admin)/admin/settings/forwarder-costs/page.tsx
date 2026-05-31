/**
 * Re-sweep A2 #28 (money P0 · D1 faithful-port) — admin editor for the DEFAULT
 * forwarder-cost matrix held on the `tb_settings` singleton (id=1).
 *
 * Legacy SOT: `pcs-admin/settings.php` — the "ตั้งค่าเรทนำเข้าสินค้า <CARRIER>"
 * sections (one "บันทึก" button per cost cell). These 144 cost columns + the
 * master cost-rate config auto-fill a NEW forwarder row's per-tier cost when
 * an order lands (read side: `report-cnt-detail.ts:warehouseSegment()`).
 * Before this page they were editable only via raw SQL.
 *
 * UI = our Tailwind (AGENTS.md §0a — steal the logic, polish the look). RBAC
 * super + accounting (matches the action). force-dynamic per AGENTS.md §11.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import {
  ALL_COST_COLUMNS,
  MASTER_NUMERIC_COLUMNS,
} from "./costs-model";
import { ForwarderCostsForm } from "./costs-form";

export const dynamic = "force-dynamic";

export default async function AdminForwarderCostsPage() {
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();

  // Select every managed column: the 144 cost cells + the master config the
  // same legacy screen edits. (rs/rp/rgdefault live in their own editor.)
  const selectCols = [
    ...ALL_COST_COLUMNS,
    ...MASTER_NUMERIC_COLUMNS.map((m) => m.col),
    "numberpaymemt",
    "freeshipping",
  ].join(", ");

  const { data, error } = await admin
    .from("tb_settings")
    .select(selectCols)
    .eq("id", 1)
    .maybeSingle<Record<string, number | string | null>>();

  if (error) {
    console.error(`[tb_settings forwarder-costs load] failed`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(
      `Failed to load tb_settings (${error.code ?? "unknown"}): ${error.message}`,
    );
  }

  const rowExists = data != null;
  const row = data ?? {};

  // Normalise to a plain {col: number} for the cost cells (DB returns string
  // or number depending on column type; 0/null → 0).
  const costValues: Record<string, number> = {};
  for (const col of ALL_COST_COLUMNS) {
    costValues[col] = row[col] != null ? Number(row[col]) : 0;
  }

  const masterValues: Record<string, number> = {};
  for (const m of MASTER_NUMERIC_COLUMNS) {
    masterValues[m.col] = row[m.col] != null ? Number(row[m.col]) : 0;
  }

  const numberpaymemt = row.numberpaymemt != null ? String(row.numberpaymemt) : "";
  // legacy: "1" = on, anything else (typically "2") = off
  const freeshipping = String(row.freeshipping ?? "2") === "1" ? "1" : "2";

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>เรทต้นทุนฝากนำเข้า (tb_settings) | PR Admin</title>

      {/* Breadcrumb */}
      <nav
        aria-label="breadcrumb"
        className="text-xs text-muted flex gap-1.5 items-center flex-wrap"
      >
        <Link href="/admin" className="hover:text-primary-600">
          หน้าแรก
        </Link>
        <span>/</span>
        <Link href="/admin/settings" className="hover:text-primary-600">
          ตั้งค่าระบบ
        </Link>
        <span>/</span>
        <span className="text-foreground">เรทต้นทุนฝากนำเข้า (default)</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · SETTINGS
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          เรทต้นทุนฝากนำเข้า — ค่าเริ่มต้น (tb_settings)
        </h1>
        <p className="mt-1 text-sm text-muted">
          ต้นทุนค่าขนส่งต่อตู้ (บาท/คิว) ของแต่ละขนส่ง × ประเภทสินค้า × โกดัง
          ที่ระบบใช้ <strong>เติมอัตโนมัติ</strong> ลงรายการฝากนำเข้า (forwarder)
          ใหม่ที่เข้ามา. เก็บอยู่ในตาราง{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">tb_settings</code>{" "}
          (id=1) — ตรงกับหน้า <em>ตั้งค่าเรทนำเข้าสินค้า</em> ของระบบเดิม.
        </p>
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ แก้แล้วมีผลกับ <strong>forwarder ที่เข้ามาใหม่</strong> เท่านั้น
          (รายการเดิมใช้ต้นทุนตอนเปิด) · เรท CNY ต้นทุนนอกช่วง [2.00 - 8.00]
          ต้องให้ super admin ยืนยัน · ทุกการแก้บันทึก audit ครบ.
        </p>
        <p className="mt-2 text-xs">
          <Link
            href="/admin/settings/legacy-rates"
            className="text-primary-600 underline"
          >
            → แก้เรท CNY-THB (ฝากชำระ rpdefault / ฝากสั่ง rsdefault)
          </Link>
        </p>
      </header>

      {!rowExists && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">🔴 ตาราง tb_settings ไม่มี row id=1!</p>
          <p className="mt-1">
            ต้นทุน forwarder ใหม่จะ fallback เป็น 0 ทั้งหมด — แจ้งทีม dev ทันที
            (migration 0081 ติดตั้งครบหรือยัง?)
          </p>
        </div>
      )}

      <ForwarderCostsForm
        initialCosts={costValues}
        initialMaster={masterValues}
        initialNumberPaymemt={numberpaymemt}
        initialFreeShipping={freeshipping as "1" | "2"}
      />
    </main>
  );
}
