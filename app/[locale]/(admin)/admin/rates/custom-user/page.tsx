/**
 * /admin/rates/custom-user — Rate ต่อกลุ่ม VIP (Wave 9 · 2026-05-23)
 *
 * 🎯 Wave 7.2 บอกว่า "Phase A migration pending — tb_priceuser_member ไม่อยู่บน prod"
 *    → จริงๆ คือ ผมตั้งชื่อตาราง legacy ผิด ตอน banner. ตารางจริงคือ
 *    `tb_rate_vip_kg` + `tb_rate_vip_cbm` ทั้งคู่มีอยู่บน prod แล้ว (192/192 rows)
 *    — เลย rewrite เป็นหน้าจริงเลย ไม่ต้อง migration.
 *
 * Legacy source: pcs-admin/rate-vip.php (300+ LOC, 4 cascading select forms).
 *
 * Data model:
 *   tb_users.coid (text · เช่น "VIP1", "OOAEOM.VIP", "THADA.VIP")
 *     ⇣ links to
 *   tb_rate_vip_kg(coid, sourcewarehouse '1|2', rtransporttype '1|2|3',
 *                  rproductstype '1|2|3|4', rkg)
 *   tb_rate_vip_cbm(coid, ..., rcbm)
 *
 *   13 coid groups × 2 wh × 3 transport × 4 product = 312 possible cells
 *   (ปัจจุบันมี 192 รวม — บางคู่ไม่ตั้ง = ใช้ default จาก tb_settings)
 *
 * Wave 9 (initial commit): read-only view — ดูทุก VIP tier + matrix ของแต่ละ
 * Wave 12-D (2026-05-23): inline-edit matrix · sticky save bar · before→after
 *   diff preview · UPSERT-pair tb_rate_vip_kg + tb_rate_vip_cbm via
 *   adminUpdateVipRateCells. Composite cell key = (coid, sourcewarehouse,
 *   rtransporttype, rproductstype); no schema unique on the tuple so the
 *   action does read-then-update-or-insert.
 * Wave 13 backlog: create-tier flow (เพิ่ม coid ใหม่ + ตั้ง matrix แรกในรอบเดียว)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { VipRateEditForm, type VipCellInitial } from "./edit-form";

export const dynamic = "force-dynamic";

// Cell labels live with the client edit-form (edit-form.tsx) — single
// source of truth so a label tweak there flows into the matrix.

type KgRow = {
  id: number;
  coid: string;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  rkg: number | null;
  adminidupdate: string | null;
};
type CbmRow = {
  id: number;
  coid: string;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  rcbm: number | null;
  adminidupdate: string | null;
};

type SP = { coid?: string };

function cellKey(r: { sourcewarehouse: string; rtransporttype: string; rproductstype: string }) {
  return `${r.sourcewarehouse}|${r.rtransporttype}|${r.rproductstype}`;
}

/**
 * Fuse the per-coid KG + CBM lookups into the `VipCellInitial[]` the
 * client form consumes. We emit one entry per cell that has EITHER a KG
 * or CBM value (or both). Empty cells aren't passed — the form will seed
 * them locally and let the operator type values to create them.
 */
function buildCellMatrix(kgRows: KgRow[], cbmRows: CbmRow[]): VipCellInitial[] {
  const out = new Map<string, VipCellInitial>();
  for (const r of kgRows) {
    const k = cellKey(r);
    out.set(k, {
      sourcewarehouse: r.sourcewarehouse as "1" | "2",
      rtransporttype: r.rtransporttype as "1" | "2" | "3",
      rproductstype: r.rproductstype as "1" | "2" | "3" | "4",
      rkg: r.rkg,
      rcbm: null,
      rkg_admin: r.adminidupdate,
      rcbm_admin: null,
    });
  }
  for (const r of cbmRows) {
    const k = cellKey(r);
    const existing = out.get(k);
    if (existing) {
      existing.rcbm = r.rcbm;
      existing.rcbm_admin = r.adminidupdate;
    } else {
      out.set(k, {
        sourcewarehouse: r.sourcewarehouse as "1" | "2",
        rtransporttype: r.rtransporttype as "1" | "2" | "3",
        rproductstype: r.rproductstype as "1" | "2" | "3" | "4",
        rkg: null,
        rcbm: r.rcbm,
        rkg_admin: null,
        rcbm_admin: r.adminidupdate,
      });
    }
  }
  return Array.from(out.values());
}

export default async function CustomUserRatesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;

  const admin = createAdminClient();
  const [{ data: kgRaw }, { data: cbmRaw }] = await Promise.all([
    admin.from("tb_rate_vip_kg").select("id,coid,sourcewarehouse,rtransporttype,rproductstype,rkg,adminidupdate").order("coid").limit(2000),
    admin.from("tb_rate_vip_cbm").select("id,coid,sourcewarehouse,rtransporttype,rproductstype,rcbm,adminidupdate").order("coid").limit(2000),
  ]);
  const kgRows = ((kgRaw ?? []) as unknown as KgRow[]).filter((r) => r.coid);
  const cbmRows = ((cbmRaw ?? []) as unknown as CbmRow[]).filter((r) => r.coid);

  // List of unique coid groups
  const coidList = Array.from(new Set([...kgRows.map((r) => r.coid), ...cbmRows.map((r) => r.coid)])).sort();

  // Customer count per coid (so admin sees "VIP1 has 47 customers")
  const { data: usersRaw, error: usersRawErr } = await admin
    .from("tb_users")
    .select("coid")
    .in("coid", coidList)
    .limit(20000);
  if (usersRawErr) {
    console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
  }
  const userCountByCoid = new Map<string, number>();
  for (const u of (usersRaw ?? []) as { coid: string | null }[]) {
    if (!u.coid) continue;
    userCountByCoid.set(u.coid, (userCountByCoid.get(u.coid) ?? 0) + 1);
  }

  // If coid selected — drill into the matrix for that tier
  const selectedCoid = sp.coid && coidList.includes(sp.coid) ? sp.coid : null;
  const selectedKg = selectedCoid ? kgRows.filter((r) => r.coid === selectedCoid) : [];
  const selectedCbm = selectedCoid ? cbmRows.filter((r) => r.coid === selectedCoid) : [];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · RATES · ตามกลุ่ม VIP
        </p>
        <h1 className="mt-1 text-2xl font-bold">Rate Override ตามกลุ่ม VIP</h1>
        <p className="mt-1 text-sm text-muted">
          Wave 12-D inline edit · อ่าน-เขียน tb_rate_vip_kg + tb_rate_vip_cbm ·
          เพิ่มกลุ่มใหม่ → Wave 13
        </p>
      </div>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {coidList.map((c) => {
          const userCount = userCountByCoid.get(c) ?? 0;
          const kgCount = kgRows.filter((r) => r.coid === c).length;
          const cbmCount = cbmRows.filter((r) => r.coid === c).length;
          const isActive = c === selectedCoid;
          return (
            <Link
              key={c}
              href={`/admin/rates/custom-user?coid=${encodeURIComponent(c)}`}
              className={`rounded-2xl border p-4 transition-all ${
                isActive
                  ? "border-primary-500 bg-primary-50 shadow-md"
                  : "border-border bg-white dark:bg-surface shadow-sm hover:shadow-md hover:border-primary-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-mono">{c}</h3>
                <span className="text-xs rounded-full bg-surface-alt px-2 py-0.5 text-muted">
                  {userCount} คน
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {kgCount} KG rates · {cbmCount} CBM rates
              </p>
            </Link>
          );
        })}
      </section>

      {selectedCoid && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold">
                Matrix สำหรับ <span className="font-mono text-primary-600">{selectedCoid}</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {userCountByCoid.get(selectedCoid) ?? 0} ลูกค้าใน tier นี้ · แก้ไขแล้วกด &ldquo;บันทึก&rdquo; ที่แถบล่าง
              </p>
            </div>
            <Link
              href="/admin/rates/custom-user"
              className="text-xs text-muted hover:text-foreground"
            >
              ล้างการเลือก
            </Link>
          </div>

          <VipRateEditForm
            coid={selectedCoid}
            cells={buildCellMatrix(selectedKg, selectedCbm)}
          />
        </section>
      )}

      {!selectedCoid && (
        <p className="text-sm text-muted italic">
          เลือกกลุ่ม VIP ด้านบนเพื่อดู matrix ของแต่ละกลุ่ม
        </p>
      )}

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/rates/general"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← Rate default
        </Link>
        <Link
          href="/admin/rates/custom-hs"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          Rate override ตาม HS code →
        </Link>
      </div>
    </main>
  );
}
