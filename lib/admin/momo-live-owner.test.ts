/**
 * ล็อกการตัดสิน "เจ้าของ/ตู้ จากบอร์ด MOMO Live" ให้เป็นชุดเดียวกันทั้งระบบ.
 *
 * ทุกค่าที่ใช้เทสเป็นค่า **จริง** ที่ปรากฏในเคสของระบบนี้ (ไม่กุตัวเลข):
 *   PR145 / KY982669997      — actions/admin/momo-add-missing.ts (หัวไฟล์ · เคสจริง)
 *   PCS10830                 — รหัสยุคเก่าที่โค้ดเก่าเคยแปลงเป็น PR10830 (CLAUDE.md 2026-07-26)
 *   GZS260525-2              — เลขตู้จริงที่ commit-momo-row-core อ้างถึง
 *   SEA0625-8211YW           — เลขตู้ TTW/อี้อู จริง (owner 2026-07-20 "ยึดใช้ตามนี้")
 *   CBX260719-EK10           — เลขกระสอบจริง (lib/forwarder/cabinet-class.ts)
 *   PR20260720-SEA01         — placeholder รอบขนส่งของระบบจริง (ห้ามคีย์เป็นเลขตู้)
 */

import assert from "node:assert/strict";
import { pickMomoLivePrCode, pickMomoLiveContainer } from "./momo-live-owner";

// ── pickMomoLivePrCode ─────────────────────────────────────────────────────
assert.equal(pickMomoLivePrCode([]), null, "ไม่มีแถว → ไม่มี PR");
assert.equal(pickMomoLivePrCode([{ member_code: "PR145" }]), "PR145");
assert.equal(pickMomoLivePrCode([{ member_code: " pr145 " }]), "PR145", "trim + uppercase");

// แถวแรกที่ระบุลูกค้าไม่ได้ ต้องไม่บล็อกแถวถัดไป (บอร์ดมีทั้งกล่องที่มีและไม่มีรหัส)
assert.equal(
  pickMomoLivePrCode([{ member_code: null }, { member_code: "" }, { member_code: "PR145" }]),
  "PR145",
  "ข้ามแถวว่าง แล้วเจอ PR จริงในแถวถัดไป",
);

// 🔴 ค่าที่ "ดูเหมือนรหัส" แต่ระบุลูกค้าไม่ได้ = ต้องไม่ผ่าน (ห้ามเดาเจ้าของ)
assert.equal(pickMomoLivePrCode([{ member_code: "PR" }]), null, "PR เปล่า = NO CODE");
assert.equal(pickMomoLivePrCode([{ member_code: "PCS10830" }]), null, "รหัสยุคเก่า ไม่ใช่ PR####");
assert.equal(pickMomoLivePrCode([{ member_code: "10830" }]), null, "ตัวเลขลอยๆ ไม่พิสูจน์ว่าเป็น PR");
assert.equal(pickMomoLivePrCode([{ member_code: "KY982669997" }]), null, "เลขแทรคกิ้ง ไม่ใช่รหัสลูกค้า");
assert.equal(
  pickMomoLivePrCode([{ member_code: "PCS10830" }, { member_code: "PR145" }]),
  "PR145",
  "รหัสยุคเก่าถูกข้าม แล้ว PR จริงยังชนะ",
);

// ── pickMomoLiveContainer ──────────────────────────────────────────────────
assert.equal(pickMomoLiveContainer([]), null);
assert.equal(pickMomoLiveContainer([{ container_name: "GZS260525-2" }]), "GZS260525-2");
assert.equal(pickMomoLiveContainer([{ container_name: " GZS260525-2 " }]), "GZS260525-2", "trim");
assert.equal(
  pickMomoLiveContainer([{ container_name: "SEA0625-8211YW" }]),
  "SEA0625-8211YW",
  "เลขตู้ TTW ใช้ตามที่ส่งมา verbatim",
);

// 🔴 กระสอบ / placeholder ต้องถูกข้าม — เขียนลง fcabinetnumber ไม่ได้ (cabinetWriteGuard)
assert.equal(pickMomoLiveContainer([{ container_name: "CBX260719-EK10" }]), null, "กระสอบไม่ใช่ตู้");
assert.equal(pickMomoLiveContainer([{ container_name: "PR20260720-SEA01" }]), null, "รอบขนส่งไม่ใช่ตู้");
assert.equal(
  pickMomoLiveContainer([
    { container_name: "CBX260719-EK10" },
    { container_name: "PR20260720-SEA01" },
    { container_name: "GZS260525-2" },
  ]),
  "GZS260525-2",
  "ข้ามกระสอบ+placeholder แล้วเจอเลขตู้จริง",
);
assert.equal(pickMomoLiveContainer([{ container_name: "" }, { container_name: null }]), null);

console.log("✅ momo-live-owner: PR/ตู้ จากบอร์ด MOMO Live ตัดสินด้วยกฎชุดเดียว");
