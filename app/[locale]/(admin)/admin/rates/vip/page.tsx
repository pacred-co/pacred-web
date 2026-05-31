import { redirect } from "next/navigation";

// 2026-06-01 Wave-A trust-sweep — DEAD-WRITE TRAP REMOVED (AGENTS.md §0e).
// This page used to read/write the REBUILT `rate_vip` table (0 rows on prod);
// the forwarder pricing engine (lib/forwarder/resolve-rate.ts) reads the LIVE
// `tb_rate_vip_kg`/`tb_rate_vip_cbm` (192 rows). So editing here changed nothing
// (green toast, no effect). The faithful VIP-rate editor is `/admin/rates/custom-user`
// ("Rate Override ตามกลุ่ม VIP" → tb_rate_vip_*). Redirect there so any old link/bookmark
// lands on the editor that actually moves prices. (`row-form.tsx` + `adminUpsertVipRate`
// → rate_vip are now orphaned; safe to delete in a later cleanup.)
export default function RatesVipRedirect() {
  redirect("/admin/rates/custom-user");
}
