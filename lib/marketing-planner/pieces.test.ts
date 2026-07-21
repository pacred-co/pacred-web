import assert from "node:assert/strict";
import { pieceProgress, piecesOf } from "./types";
import { buildDemoContent } from "./demo-content";
import { derivePieceStage, isPieceDone } from "./piece-status";
import type { ContentItem } from "./types";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}

/** ContentItem ขั้นต่ำ — เทสสนใจแค่ฟิลด์ที่ piecesOf อ่าน. */
function c(patch: Partial<ContentItem>): ContentItem {
  return { id: "c1", title: "แผน", links: [], createdAt: "", updatedAt: "", ...patch };
}

console.log("lib/marketing-planner/pieces");

// ── piecesOf: ประเภท → ช่องทาง (กลับด้านจาก platformContentTypeIds) ──────────
t("กลับด้าน platform→ประเภท ให้เป็น ประเภท→platforms (ตามภาพ owner)", () => {
  // เว็บ=บทความ+แบนเนอร์ · YT=คลิปยาว+คลิปสั้น · TikTok=คลิปสั้น
  const p = piecesOf(c({
    contentTypeIds: ["บทความ", "คลิปยาว", "คลิปสั้น", "แบนเนอร์"],
    platformIds: ["web", "yt", "tiktok"],
    platformContentTypeIds: { web: ["บทความ", "แบนเนอร์"], yt: ["คลิปยาว", "คลิปสั้น"], tiktok: ["คลิปสั้น"] },
  }));
  assert.equal(p.length, 4);
  assert.deepEqual(p.find((x) => x.contentTypeId === "คลิปสั้น")!.platformIds, ["yt", "tiktok"]);
  assert.deepEqual(p.find((x) => x.contentTypeId === "บทความ")!.platformIds, ["web"]);
  assert.deepEqual(p.find((x) => x.contentTypeId === "แบนเนอร์")!.platformIds, ["web"]);
});

t("เรียงตามลำดับที่ผู้ใช้เลือกใน contentTypeIds (ไม่ใช่ลำดับแพลตฟอร์ม)", () => {
  const p = piecesOf(c({
    contentTypeIds: ["บทความ", "คลิปยาว", "คลิปสั้น"],
    platformIds: ["tiktok", "web"],
    platformContentTypeIds: { tiktok: ["คลิปสั้น"], web: ["บทความ", "คลิปยาว"] },
  }));
  assert.deepEqual(p.map((x) => x.contentTypeId), ["บทความ", "คลิปยาว", "คลิปสั้น"]);
});

t("เลือกประเภทไว้แต่ยังไม่ผูกแพลตฟอร์ม → ยังต้องโชว์ (งานไม่หาย)", () => {
  const p = piecesOf(c({
    contentTypeIds: ["บทความ", "โฆษณา"],
    platformIds: ["web"],
    platformContentTypeIds: { web: ["บทความ"] },
  }));
  assert.equal(p.length, 2);
  assert.deepEqual(p.find((x) => x.contentTypeId === "โฆษณา")!.platformIds, []);
});

t("ไม่มี platformContentTypeIds → ทุกแพลตฟอร์มสืบทอดประเภทระดับคอนเทนต์", () => {
  const p = piecesOf(c({ contentTypeIds: ["คลิปสั้น"], platformIds: ["yt", "tiktok"] }));
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].platformIds, ["yt", "tiktok"]);
});

t("ข้อมูลเก่า single contentTypeId/platformId ยังอ่านได้ (back-compat)", () => {
  const p = piecesOf(c({ contentTypeId: "บทความ", platformId: "web" }));
  assert.deepEqual(p, [{ contentTypeId: "บทความ", platformIds: ["web"] }]);
});

t("แพลตฟอร์มที่ตั้งใจเว้นว่าง ([]) ไม่ดึงประเภทระดับคอนเทนต์มาใส่", () => {
  const p = piecesOf(c({
    contentTypeIds: ["บทความ"],
    platformIds: ["web", "yt"],
    platformContentTypeIds: { web: ["บทความ"], yt: [] },
  }));
  assert.deepEqual(p[0].platformIds, ["web"]); // yt ไม่ติดมา
});

t("ยังไม่เลือกอะไรเลย → ไม่มีชิ้นงาน", () => {
  assert.deepEqual(piecesOf(c({})), []);
});

// ── pieces: ฟิลด์ที่เก็บไว้ ถูก merge เข้ารายการที่ derive ──────────────────
t("ฟิลด์ที่พิมพ์เพิ่ม (รายละเอียด/กำหนด/สถานะ/ผู้รับผิดชอบ) merge เข้าชิ้นงาน", () => {
  const p = piecesOf(c({
    contentTypeIds: ["คลิปยาว"],
    platformIds: ["yt"],
    pieces: { "คลิปยาว": { detail: "16:9 · 6 นาที", dueTime: "12:00", statusId: "st-review", ownerId: "u1" } },
  }));
  assert.equal(p[0].detail, "16:9 · 6 นาที");
  assert.equal(p[0].dueTime, "12:00");
  assert.equal(p[0].statusId, "st-review");
  assert.equal(p[0].ownerId, "u1");
  assert.deepEqual(p[0].platformIds, ["yt"]); // รายการยัง derive — ไม่ถูก pieces ทับ
});

t("pieces ของประเภทที่ไม่ได้เลือกแล้ว ไม่โผล่กลับมา (ลบประเภท = ชิ้นงานหาย)", () => {
  const p = piecesOf(c({
    contentTypeIds: ["บทความ"],
    platformIds: ["web"],
    platformContentTypeIds: { web: ["บทความ"] },
    pieces: { "คลิปยาว": { detail: "ของเก่าที่เลิกใช้" } },
  }));
  assert.deepEqual(p.map((x) => x.contentTypeId), ["บทความ"]);
});

// ── pieceProgress ───────────────────────────────────────────────────────────
t("นับเสร็จจากสถานะที่คิดอัตโนมัติ = เผยแพร่แล้วเท่านั้น (isPieceDone)", () => {
  const pieces = piecesOf(c({
    contentTypeIds: ["a", "b", "c"],
    platformIds: ["web"],
    // a โพสต์แล้ว = เสร็จ · b แค่ตรวจผ่าน ยังไม่นับ · c ยังไม่เริ่ม
    pieces: { a: { postUrl: "https://x/1" }, b: { workUrl: "https://x/w", approvedAt: "2026-07-20T00:00:00Z" } },
  }));
  assert.deepEqual(pieceProgress(pieces, isPieceDone), { done: 1, total: 3 });
});

t("ไม่มีชิ้นงาน → 0/0 (ตัวหารเป็นศูนย์ ต้องไม่ระเบิด)", () => {
  assert.deepEqual(pieceProgress([], () => true), { done: 0, total: 0 });
});

// ── งานตัวอย่างเต็มระบบ (owner 2026-07-21) ──────────────────────────────────
// ล็อกไว้เพราะ demo อ้าง seed id เป็นสตริง — ถ้ามีคนเปลี่ยนชื่อ key ใน seed.ts
// ชิ้นงานจะหายเงียบๆ โดยไม่มีอะไรฟ้อง (tsc จับไม่ได้ เพราะเป็นแค่ string)
t("งานตัวอย่าง: 8 แพลตฟอร์ม · 15 ชิ้นงานย่อย · ครบทั้งบทความ/คลิป/ภาพ/Ads", () => {
  const demo = buildDemoContent("2026-07-21", "u-owner", ["u-a", "u-b"]);
  const p = piecesOf(demo);
  assert.equal(demo.platformIds?.length, 8);
  assert.equal(p.length, 15);
  assert.equal(demo.publishDate, "2026-07-21");
  // ทุกชิ้นต้องมีอย่างน้อย 1 ช่องทาง — ชิ้นที่ไม่มีช่องทาง = mapping พิมพ์ผิด
  for (const x of p) assert.ok(x.platformIds.length > 0, `${x.contentTypeId} ไม่มีช่องทาง`);
  // ทุกชิ้นต้องมีรายละเอียด+ผู้รับผิดชอบ (นี่คือ "ข้อมูลครบ" ที่ owner ขอ)
  for (const x of p) {
    assert.ok(x.detail, `${x.contentTypeId} ไม่มีรายละเอียด`);
    assert.equal(x.ownerId, "u-owner");
  }
});

t("งานตัวอย่าง: ครอบทุกขั้นของสถานะอัตโนมัติ (ไม่ใช่ 'วางแผน' หมดทุกชิ้น)", () => {
  // ตัวอย่างจะไร้ประโยชน์ทันทีถ้าทุกชิ้นตกไปขั้นเดียวกัน — ต้องเห็นบันไดครบถึงจะ
  // ประเมินได้ว่าตัวคำนวณสถานะทำงานจริง
  const stages = piecesOf(buildDemoContent("2026-07-21", "u1")).map((x) => derivePieceStage(x));
  for (const want of ["plan", "shoot", "review", "scheduled", "published"] as const) {
    assert.ok(stages.includes(want), `ตัวอย่างไม่มีชิ้นที่อยู่ขั้น "${want}"`);
  }
});

t("งานตัวอย่าง: ชิ้นที่ 'เผยแพร่' ต้องมีลิงก์โพสต์จริง (ไม่ใช่ยัดสถานะเข้าไปเฉยๆ)", () => {
  const p = piecesOf(buildDemoContent("2026-07-21", "u1"));
  const done = p.filter(isPieceDone);
  assert.ok(done.length > 0);
  for (const x of done) assert.ok(x.postUrl, `${x.contentTypeId} เผยแพร่แล้วแต่ไม่มีลิงก์โพสต์`);
});

t("งานตัวอย่าง: กรอกครบทั้ง 11 ช่องโครงคอนเทนต์ + ผลลัพธ์", () => {
  const d = buildDemoContent("2026-07-21");
  for (const k of ["hook", "painPoint", "context", "storyTelling", "proof", "authority", "visual", "organicSelling", "branding", "esg", "contact"] as const) {
    assert.ok(d[k], `ช่อง ${k} ว่าง`);
  }
  assert.ok(d.result?.reach && d.result.revenue && d.result.insight && d.result.nextAction);
  assert.equal(d.startDate, "2026-07-14"); // publishDate − 7 วัน
  assert.equal(d.deadline, "2026-07-20"); // publishDate − 1 วัน
});

t("งานตัวอย่าง: id คงที่ → กดซ้ำทับตัวเดิม ไม่งอกเป็นสิบอัน", () => {
  assert.equal(buildDemoContent("2026-07-21").id, buildDemoContent("2026-08-01").id);
});

console.log(`\n${pass} passed`);
