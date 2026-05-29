/**
 * Tier A6 (2026-05-29) — admin editor for tb_settings rate columns.
 *
 * The legacy `tb_settings` singleton (id=1) holds the THB-per-CNY rates
 * the entire system reads. Before this page existed, accounting could ONLY
 * edit these by raw SQL (or by setting `NEXT_PUBLIC_YUAN_RATE` env which
 * forces a Vercel rebuild AND only updated the customer-facing yuan-payment
 * surface). Either path is too slow + too error-prone to use daily as
 * USD/CNY moves.
 *
 * This page wraps the existing `adminSetTbSettingsRates` server action
 * (V-A4 in `actions/admin/tb-settings.ts` — already shipped with range
 * guard [2.0, 8.0], force_override for super, audit logging). The UI is
 * just the missing piece.
 *
 * Legacy field semantics (from `pcs-admin/settings.php` L1789, L1816, L1870):
 *   • rsdefault → เรทฝากสั่งสินค้า (shop yuan-rate — /cart, /search, /service-order)
 *   • rpdefault → เรทฝากชำระสินค้า (transfer rate — /service-payment, /admin/yuan-payments)
 *   • rgdefault → unused in legacy (schema-only · keep for fidelity · editable)
 *
 * Companion fix (Tier A6): `/admin/yuan-payments/new/page.tsx` and
 * `getCurrentYuanRate()` were both reading the WRONG column (`rsdefault`)
 * for the transfer surface. That was the original CNY rate config-key typo.
 *
 * RBAC: super + accounting (matches the action). Force-dynamic per AGENTS.md §11.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { LegacyRatesForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AdminLegacyRatesPage() {
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_settings")
    .select("rsdefault, rpdefault, rgdefault, hratecostdefault")
    .eq("id", 1)
    .maybeSingle<{
      rsdefault:        number | string | null;
      rpdefault:        number | string | null;
      rgdefault:        number | string | null;
      hratecostdefault: number | string | null;
    }>();

  if (error) {
    console.error(`[tb_settings legacy-rates load] failed`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`Failed to load tb_settings (${error.code ?? "unknown"}): ${error.message}`);
  }

  // The legacy schema guarantees id=1 exists post-migration; if it's missing
  // here something is very wrong (rate engine returns the fallback 5.00 for
  // EVERY pricing call). Surface the issue clearly so it can be fixed.
  const rowExists = data != null;
  const rsdefault = Number(data?.rsdefault ?? 5.0);
  const rpdefault = Number(data?.rpdefault ?? 5.0);
  const rgdefault = Number(data?.rgdefault ?? 5.0);
  const hratecostdefault = data?.hratecostdefault != null ? Number(data.hratecostdefault) : null;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <title>เรทฝากชำระ + ฝากสั่ง (tb_settings) | PR Admin</title>

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/settings" className="hover:text-primary-600">ตั้งค่าระบบ</Link>
        <span>/</span>
        <span className="text-foreground">เรท CNY-THB (legacy)</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · SETTINGS</p>
        <h1 className="mt-1 text-2xl font-bold">เรทฝากชำระ + ฝากสั่ง (tb_settings)</h1>
        <p className="mt-1 text-sm text-muted">
          เรทที่อ่านจากตาราง <code className="rounded bg-surface-alt px-1 text-xs">tb_settings</code> (id=1) —
          ใช้กับ <code className="rounded bg-surface-alt px-1 text-xs">/admin/yuan-payments</code>,{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">/service-payment</code>,{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">/cart</code>,{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">/search</code>,{" "}
          และ <code className="rounded bg-surface-alt px-1 text-xs">/service-order</code>.
          แก้ตรงนี้ → มีผลทันที (cache-tag ของหน้าจะ refresh ตอนเปิดรอบถัดไป).
        </p>
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ Range guard [2.0 - 8.0] · เรทนอกช่วงต้องให้ super admin ยืนยัน · ทุกการแก้ บันทึก audit ครบ
        </p>
      </header>

      {!rowExists && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">🔴 ตาราง tb_settings ไม่มี row id=1!</p>
          <p className="mt-1">
            ระบบจะ fallback เป็น 5.00 ทุกหน้าจน row ถูกสร้าง — แจ้งทีม dev ทันที (migration 0081 ติดตั้งครบหรือยัง?)
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <LegacyRatesForm
          initial={{
            rsdefault,
            rpdefault,
            rgdefault,
          }}
          hratecostdefault={hratecostdefault}
        />
      </section>

      {/* Reference card — explains which rate is read where */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900 space-y-2">
        <p className="font-semibold">หมายเหตุ — เรทแต่ละตัวใช้ที่ไหน</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>
            <code className="rounded bg-white px-1 py-0.5 font-mono">rpdefault</code> = เรทฝากชำระสินค้า
            (ฝากโอนหยวน) → ใช้กับ <Link href="/admin/yuan-payments" className="underline">/admin/yuan-payments</Link>{" "}
            + <Link href="/service-payment" className="underline">/service-payment</Link> (สำหรับลูกค้า).{" "}
            <strong>แก้บ่อยที่สุด — ตามอัตรา USD/CNY ที่ดีลกับ broker จีน.</strong>
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5 font-mono">rsdefault</code> = เรทฝากสั่งสินค้า
            (ราคาขาย CNY → THB ของ shop) → ใช้กับ <Link href="/cart" className="underline">/cart</Link>,{" "}
            <Link href="/search" className="underline">/search</Link>,{" "}
            <Link href="/service-order" className="underline">/service-order/add</Link>.
            (ปกติเรทนี้สูงกว่า rpdefault เพราะรวม margin shop service)
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5 font-mono">rgdefault</code> = ไม่ได้ใช้ใน legacy PHP
            (schema-only · เก็บไว้เพื่อ fidelity · admin dashboard แสดงเป็น &ldquo;เรทสั่งซื้อ&rdquo; reference เฉยๆ)
          </li>
          {hratecostdefault != null && (
            <li>
              <code className="rounded bg-white px-1 py-0.5 font-mono">hratecostdefault</code> = ปัจจุบัน{" "}
              <span className="font-mono">{hratecostdefault.toFixed(4)}</span> (cost-rate สำหรับ admin คำนวณ
              margin · แก้ผ่าน raw SQL ตอนนี้ — UI editor รอ Wave ต่อไป)
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
