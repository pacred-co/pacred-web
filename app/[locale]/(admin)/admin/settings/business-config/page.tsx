import { requireAdmin } from "@/lib/auth/require-admin";
import { listAllBusinessConfig, type BusinessConfigRow } from "@/lib/business-config";
import { BusinessConfigEditor } from "./editor";

/**
 * G-10 — Admin business config screen. Super-only.
 *
 * Renders every row from public.business_config grouped by category,
 * with type-aware editors per row. Submitting an edit calls
 * adminUpdateBusinessConfig (super only, audit-logged with before/after).
 *
 * Per AGENTS.md §11: requireAdmin reads cookies → force-dynamic so the
 * route doesn't try to statically pre-render.
 */

export const dynamic = "force-dynamic";

export default async function AdminBusinessConfigPage() {
  await requireAdmin(["super"]);
  const rows = await listAllBusinessConfig();

  // Group by category (null bucket = "อื่นๆ"), preserving the sort
  // order from the query so the UI is stable across renders.
  const grouped = new Map<string, BusinessConfigRow[]>();
  for (const r of rows) {
    const cat = r.category ?? "อื่นๆ";
    const arr = grouped.get(cat) ?? [];
    arr.push(r);
    grouped.set(cat, arr);
  }
  const groups = Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · SETTINGS</p>
        <h1 className="mt-1 text-2xl font-bold">Business Config (super)</h1>
        <p className="mt-1 text-sm text-muted">
          ค่าคงที่ทางธุรกิจ — OTP TTL, ขั้นต่ำเงินฝาก/ถอน, % แคชแบ็ค, บัญชีธนาคารสำหรับฝาก, feature flags. แก้แล้วมีผลภายใน 1 นาที (60-second cache).
        </p>
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ super-only — ทุกการแก้บันทึก audit (action <code className="font-mono">business_config.update</code>) พร้อม before/after.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          ยังไม่มี row ในตาราง business_config — รัน migration 0076 เพื่อ seed defaults.
        </p>
      ) : (
        <BusinessConfigEditor groups={groups} />
      )}
    </main>
  );
}
