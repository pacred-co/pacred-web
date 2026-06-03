import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { GeneralRateMatrix, type GeneralMatrix } from "./general-rate-matrix";

// Theme B (2026-05-31 · เดฟ) — FAITHFUL general-rate editor.
//
// REPOINTED from the rebuilt `rate_general` (empty on prod · the pricing engine
// never read it → "admin changes the rate, nothing happens") to the legacy
// `tb_rate_g_kg` / `tb_rate_g_cbm` that lib/forwarder/resolve-rate.ts ACTUALLY
// reads (see forwarders-edit.ts L222-238). Edits here now take effect on the
// next forwarder re-price.
//
// The general bucket = coid 'PCS' (the PCS<n>→PR<n> rebrand kept the legacy
// 'PCS' coid token for non-VIP/general customers; resolve-rate.ts gates
// isGeneral on coID==='PCS'). Per-customer-group VIP rates live in
// /admin/rates/* (tb_rate_vip_* via rate-edits.ts adminUpdateVipRateCells).

export const dynamic = "force-dynamic";

const GENERAL_COID = "PCS";

type KgRow = { sourcewarehouse: string; rgtransporttype: string; rgproductstype: string; rgkg1: number | string | null; rgkg2: number | string | null; rgkg3: number | string | null };
type CbmRow = { sourcewarehouse: string; rgtransporttype: string; rgproductstype: string; rgcbm1: number | string | null; rgcbm2: number | string | null; rgcbm3: number | string | null };

function n(v: number | string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export default async function AdminRatesGeneralPage() {
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  const [{ data: kgData, error: kgErr }, { data: cbmData, error: cbmErr }] = await Promise.all([
    admin.from("tb_rate_g_kg")
      .select("sourcewarehouse, rgtransporttype, rgproductstype, rgkg1, rgkg2, rgkg3")
      .eq("coid", GENERAL_COID),
    admin.from("tb_rate_g_cbm")
      .select("sourcewarehouse, rgtransporttype, rgproductstype, rgcbm1, rgcbm2, rgcbm3")
      .eq("coid", GENERAL_COID),
  ]);
  if (kgErr) console.error(`[tb_rate_g_kg list] failed`, { code: kgErr.code, message: kgErr.message });
  if (cbmErr) console.error(`[tb_rate_g_cbm list] failed`, { code: cbmErr.code, message: cbmErr.message });

  // Build the cell matrix (join KG + CBM by cell key).
  const key = (wh: string, tt: string, pt: string) => `${wh}|${tt}|${pt}`;
  const matrix: GeneralMatrix = {};
  const ensure = (k: string) => (matrix[k] ??= { kg1: null, kg2: null, kg3: null, cbm1: null, cbm2: null, cbm3: null });
  for (const r of (kgData ?? []) as unknown as KgRow[]) {
    const c = ensure(key(r.sourcewarehouse, r.rgtransporttype, r.rgproductstype));
    c.kg1 = n(r.rgkg1); c.kg2 = n(r.rgkg2); c.kg3 = n(r.rgkg3);
  }
  for (const r of (cbmData ?? []) as unknown as CbmRow[]) {
    const c = ensure(key(r.sourcewarehouse, r.rgtransporttype, r.rgproductstype));
    c.cbm1 = n(r.rgcbm1); c.cbm2 = n(r.rgcbm2); c.cbm3 = n(r.rgcbm3);
  }

  const cellCount = Object.keys(matrix).length;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · อัตราขนส่ง (General)</p>
          <h1 className="mt-1 text-2xl font-bold">ตารางเรท General — แก้ไขได้</h1>
          <p className="mt-1 text-sm text-muted">
            เรทลูกค้าทั่วไป (coid <code className="rounded bg-surface-alt px-1 text-[10px]">{GENERAL_COID}</code>) ตาม
            (โกดัง × ขนส่ง × ประเภทสินค้า) × 3 tier — เขียน
            <code className="mx-1 rounded bg-surface-alt px-1 py-0.5 text-[10px]">tb_rate_g_kg / tb_rate_g_cbm</code>
            ที่ engine คำนวณราคาใช้จริง
          </p>
        </div>
        <Link href="/admin/rates" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับสรุปอัตรา
        </Link>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
        ✅ แก้ไขเรทในตารางนี้ <b>มีผลทันที</b>กับการคำนวณราคาฝากนำเข้า (waterfall: custom-HS → SVIP → VIP →
        <b> general</b>). พบ {cellCount} ช่องที่ตั้งค่าไว้.
      </div>

      <GeneralRateMatrix coid={GENERAL_COID} initial={matrix} />

      <p className="text-[11px] text-muted">
        tier1 → tier2 → tier3 = ราคา/หน่วย ตามช่วงปริมาณที่สูงขึ้น · ปล่อยว่าง = ไม่ตั้งค่า tier นั้น ·
        เรท VIP รายกลุ่ม/รายลูกค้าอยู่ที่หน้าโปรไฟล์ลูกค้า + /admin/rates
      </p>
    </main>
  );
}
