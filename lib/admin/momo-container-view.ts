/**
 * MOMO container-view (เฟส 0b · ภูม 2026-07-14) — the data layer for the
 * container-centric "MOMO ตรวจตู้" workspace. Pure verify-status derivation so the
 * list/detail can flag each container at a glance:
 *   ✅ ตรง · 💗 ขาด(กล่อง) · ⚖️ น้ำหนักหาย · 📄 ยังไม่มี packing · 💗 API ขาด(reverse)
 *
 * "ระบบ" (system) = tb_forwarder aggregate for the cabinet · "packing" = the latest
 * momo_packing_upload for that container · apiMissing = the packing-vs-API reverse
 * check (trackings in packing but not in momo_import_tracks). Pure + testable.
 */

export type ContainerVerifyStatus =
  | "ok"            // ✅ ระบบ ≥ packing (ครบ)
  | "box_short"     // 💗 ระบบนับกล่องน้อยกว่า packing
  | "weight_missing"// ⚖️ ระบบน้ำหนักน้อยกว่า packing
  | "no_packing";   // 📄 ยังไม่มี packing list ให้เทียบ

export type ContainerVerifyInput = {
  hasPacking: boolean;
  systemBoxes: number | null;
  packingBoxes: number | null;
  systemWeight: number | null;
  packingWeight: number | null;
  apiMissing?: number; // trackings in packing but not in the MOMO API staging
};

export type ContainerVerify = {
  status: ContainerVerifyStatus;
  apiMissing: number;
  boxShort: boolean;
  weightShort: boolean;
  hasPacking: boolean;
};

const WT_EPS = 0.01;

/** Primary verify status + flags for one container (system vs its packing list). */
export function deriveContainerVerify(v: ContainerVerifyInput): ContainerVerify {
  const apiMissing = Math.max(0, v.apiMissing ?? 0);
  if (!v.hasPacking) {
    return { status: "no_packing", apiMissing, boxShort: false, weightShort: false, hasPacking: false };
  }
  const boxShort =
    v.packingBoxes != null && (v.systemBoxes == null || v.systemBoxes < v.packingBoxes);
  const weightShort =
    v.packingWeight != null && (v.systemWeight == null || v.systemWeight + WT_EPS < v.packingWeight);

  const status: ContainerVerifyStatus = boxShort ? "box_short" : weightShort ? "weight_missing" : "ok";
  return { status, apiMissing, boxShort, weightShort, hasPacking: true };
}

export const VERIFY_LABEL: Record<ContainerVerifyStatus, { label: string; cls: string }> = {
  ok:             { label: "✅ ตรง",         cls: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  box_short:      { label: "💗 กล่องขาด",     cls: "bg-rose-100 text-rose-700 border border-rose-300" },
  weight_missing: { label: "⚖️ น้ำหนักหาย",   cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  no_packing:     { label: "📄 ยังไม่มี packing", cls: "bg-gray-100 text-gray-600 border border-gray-300" },
};
