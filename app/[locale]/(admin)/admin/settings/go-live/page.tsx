import { requireAdmin } from "@/lib/auth/require-admin";
import { loadGoLiveStatus } from "@/lib/admin/go-live-status";
import { getFreightCommissionState, type FreightCommissionTierView } from "@/actions/admin/freight-commission";
import { GoLivePanel } from "./go-live-client";

/**
 * /admin/settings/go-live — the Go-Live Control Panel (super-only · owner-level).
 *
 * Owner directive 2026-06-12: consolidate the ~9 scattered DORMANT go-live
 * levers (the things shipped code-complete-but-OFF, waiting on an owner flip /
 * accountant data / external infra) into ONE reachable surface so flipping each
 * is a single safe click when the input is ready — instead of editing raw JSON
 * across pages and hunting role screens.
 *
 * §0d reachability: linked from the settings sidebar (super-only · phase 2).
 * §0e isolation: every flip routes through the EXISTING audited super-only
 *   actions (adminUpdateBusinessConfig · adminSetFreightCommissionTierConfirmed);
 *   this page introduces NO new write path. The money/tax toggles each demand a
 *   consequence-spelling confirm (§0f) before they fire.
 *
 * requireAdmin reads cookies → force-dynamic (AGENTS.md §11).
 */

export const dynamic = "force-dynamic";

export default async function GoLivePage() {
  await requireAdmin(["super"]);

  const status = await loadGoLiveStatus();

  // The full tier catalogue for the in-panel commission confirm list.
  const freightState = await getFreightCommissionState();
  const tiers: FreightCommissionTierView[] =
    freightState.ok && freightState.data
      ? freightState.data.tiers.filter((t) => t.active)
      : [];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · SETTINGS</p>
        <h1 className="mt-1 text-2xl font-bold">🚦 Go-Live Control Panel</h1>
        <p className="mt-1 text-sm text-muted">
          ศูนย์รวม “สวิตช์เปิดระบบ” ทุกตัวที่โค้ดเสร็จแล้วแต่ยังปิดอยู่ — รอพี่กดเปิด / รอข้อมูลบัญชี / รอ
          ของภายนอก. แต่ละตัวมีสถานะสด + กดเปิดได้ปลอดภัยจากหน้าเดียว.
        </p>
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ super เท่านั้น · ทุกการเปิด/แก้ บันทึก audit (before/after) · สวิตช์เงิน/ภาษีต้องยืนยันก่อนเปิด.
        </p>
      </header>

      <GoLivePanel status={status} tiers={tiers} />
    </main>
  );
}
