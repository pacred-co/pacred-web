/**
 * READ-ONLY replay — พิสูจน์ว่า "ติ๊กค่าเทียบเอง แล้วบันทึก จะได้ฐานตามที่จอโชว์"
 * โดยรัน **ตัวคิดราคาตัวเดียวกับที่เส้นบันทึกใช้** (resolveLiveForwarderRate) กับแถว prod จริง.
 *
 * เหตุ (owner 2026-07-26 · งาน 52560/PR075): "ปรับค่าเทียบให้คิดกิโล พอบันทึกแล้วมันไม่เปลี่ยน" —
 * รอบแรกผมแก้ที่ resolve-rate.ts (ธง customComparison) แต่ **live-rate.ts จงใจไม่ส่งธงนั้น**
 * → ด่านไม่เคยทำงานบนเส้นจริง = แก้แล้วเหมือนไม่ได้แก้. บทเรียน: แก้ที่ "เส้นที่รันจริง"
 * แล้วพิสูจน์ด้วยการ replay ไม่ใช่ unit test ที่เรียกชั้นในตรงๆ.
 *
 * ไม่เขียนอะไรทั้งสิ้น (อ่าน tb_forwarder + การ์ดเรท แล้วคิดราคาในหน่วยความจำ).
 *
  * RUN: ./node_modules/.bin/tsx --env-file=.env.local scripts/verify-custom-comparison-52560-2026-07-27.ts
 * ⚠️ ต้อง shim server-only ก่อน (live-rate import): mkdir -p node_modules/server-only && echo "module.exports={}" > node_modules/server-only/index.js
 */
import { createClient } from "@supabase/supabase-js";
import { resolveLiveForwarderRate } from "../lib/forwarder/live-rate";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("ต้องมี NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ใช้ --env-file=.env.local)"); process.exit(1); }

const FID = 52560;

async function main() {
  const admin = createClient(URL!, KEY!, { auth: { persistSession: false } });
  const { data: row, error } = await admin
    .from("tb_forwarder")
    .select("id, userid, ftrackingchn, fweight, fvolume, famount, famountcount, custom_comparison, custom_comparison_value, customratekg, customratecbm, customrate, ftransporttype, fcabinetnumber, fproductstype, ftotalprice, frefrate, frefprice")
    .eq("id", FID)
    .maybeSingle();
  if (error || !row) { console.error("อ่านแถวไม่ได้", error?.message); process.exit(1); }

  const r = row as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0);
  console.log("── แถวจริงบน prod ──");
  console.table([{
    id: r.id, แทรค: r.ftrackingchn, ลูกค้า: r.userid,
    นน: n(r.fweight), คิว: n(r.fvolume),
    ติ๊กค่าเทียบเอง: r.custom_comparison, ค่าเทียบ: n(r.custom_comparison_value),
    "เรท ฿/กก.": n(r.customratekg), "เรท ฿/คิว": n(r.customratecbm),
    ยอดที่เก็บอยู่: n(r.ftotalprice), ฐานที่เก็บอยู่: r.frefprice === "1" ? "น้ำหนัก" : "ปริมาตร",
  }]);

  // ── ชิปเม้นนี้มีหลายแทรค → ตัวบันทึกส่ง "อัตราส่วนทั้งชิปเม้น" มาตัดสินฐาน ──
  const base = String(r.ftrackingchn ?? "").replace(/-\d+(\/\d+)?$/, "");
  const { data: fam } = await admin
    .from("tb_forwarder")
    .select("fweight, fvolume, famount, famountcount")
    .or(`ftrackingchn.eq.${base},ftrackingchn.like.${base}-%`)
    .eq("userid", String(r.userid));
  const totalKg = (fam ?? []).reduce((s, x) => s + n((x as Record<string, unknown>).fweight), 0);
  const totalCbm = (fam ?? []).reduce((s, x) => {
    const o = x as Record<string, unknown>;
    const v = n(o.fvolume);
    return s + (String(o.famountcount ?? "") === "1" ? v : v * Math.max(1, n(o.famount)));
  }, 0);
  const ratio = totalCbm > 0 ? totalKg / totalCbm : 0;
  console.log(`\nทั้งชิปเม้น ${base}: ${totalKg} กก. · ${totalCbm.toFixed(6)} คิว → อัตราส่วน ${ratio.toFixed(2)} กก./คิว`);

  const ctx = {
    userid: String(r.userid),
    weightKg: n(r.fweight),
    cbmProduct: String(r.famountcount ?? "") === "1" ? n(r.fvolume) : n(r.fvolume) * Math.max(1, n(r.famount)),
    ftransporttype: String(r.ftransporttype ?? "2") as "1" | "2" | "3",
    fproductstype: String(r.fproductstype ?? "1"),
    customRateSwitch: String(r.customrate ?? "0") === "1",
    customRateKg: n(r.customratekg),
    customRateCbm: n(r.customratecbm),
    comparisonKgPerCbm: ratio,
  } as Parameters<typeof resolveLiveForwarderRate>[1];

  const off = await resolveLiveForwarderRate(admin, { ...ctx, customComparisonSwitch: false });
  const on = await resolveLiveForwarderRate(admin, {
    ...ctx,
    customComparisonSwitch: true,
    customComparisonValue: n(r.custom_comparison_value),
  });

  type Res = { resolved: { rate: number; basis: "kg" | "cbm" } };
  const show = (label: string, x: Res) => ({
    กรณี: label,
    ฐาน: x.resolved.basis === "kg" ? "น้ำหนัก" : "ปริมาตร",
    เรท: x.resolved.rate,
    "ยอดทั้งชิปเม้น": x.resolved.basis === "kg"
      ? +(totalKg * x.resolved.rate).toFixed(2)
      : +(totalCbm * x.resolved.rate).toFixed(2),
  });
  console.log("\n── ผลจากตัวคิดราคาตัวเดียวกับที่บันทึกจริง ──");
  console.table([
    show("ไม่ติ๊กค่าเทียบ (นโยบายเก็บฐานแพงกว่า)", off as unknown as Res),
    show("ติ๊กค่าเทียบเอง (ของงานนี้)", on as unknown as Res),
  ]);

  const onR = (on as unknown as Res).resolved;
  console.log(onR.basis === "kg"
    ? `\n✅ ติ๊กค่าเทียบเอง → คิดตามน้ำหนักแล้ว (ตรงกับที่จอโชว์) · ยอดทั้งชิปเม้น = ${(totalKg * onR.rate).toFixed(2)} บาท`
    : `\n🔴 ยังไม่ได้ — ติ๊กแล้วยังคิดเป็น ${onR.basis}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
