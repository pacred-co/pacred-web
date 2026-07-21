import assert from "node:assert/strict";
import { derivePieceStage, explainStage, isBriefFlagged, isPieceDone, PIECE_STAGES, stageInfo, workUrlOf } from "./piece-status";
import type { ContentPieceFields } from "./types";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}

console.log("lib/marketing-planner/piece-status");

// ── ลำดับตามที่ owner กำหนด ────────────────────────────────────────────────
t("ลำดับ 5 ขั้น ตรงตาม owner (บรีฟงาน = ป้าย ไม่ใช่ขั้น)", () => {
  assert.deepEqual(PIECE_STAGES.map((s) => s.id), ["plan", "shoot", "review", "scheduled", "published"]);
  assert.deepEqual(PIECE_STAGES.map((s) => s.label), ["วางแผน", "รอถ่าย", "กำลังตรวจสอบ", "รอเผยแพร่", "เผยแพร่"]);
});

// ── ตัวขับสถานะ ────────────────────────────────────────────────────────────
t("ไม่มีอะไรเลย → วางแผน", () => {
  assert.equal(derivePieceStage({}), "plan");
  assert.equal(derivePieceStage(undefined), "plan");
});

t("ใส่วันถ่าย → รอถ่าย", () => {
  assert.equal(derivePieceStage({ shootDate: "2026-07-22" }), "shoot");
});

t("แนบไฟล์งาน → กำลังตรวจสอบ", () => {
  assert.equal(derivePieceStage({ workUrl: "https://x/work" }), "review");
});

t("ตรวจผ่าน → รอเผยแพร่", () => {
  assert.equal(derivePieceStage({ workUrl: "https://x/work", approvedAt: "2026-07-21T10:00:00Z" }), "scheduled");
});

t("แปะลิงก์โพสต์ → เผยแพร่ (owner: 'แปะลิงก์งานที่โพสต์แล้ว = เสร็จสิ้น')", () => {
  assert.equal(derivePieceStage({ postUrl: "https://fb.com/post/1" }), "published");
});

// ── สถานะปลายทางต้องกลบสถานะก่อนหน้าเสมอ ───────────────────────────────────
// นี่คือกับดักตัวจริง: ช่องวันถ่าย/ไฟล์งาน ยังมีค่าค้างอยู่หลังโพสต์ไปแล้วเสมอ
// ถ้าเรียงเช็คผิดทาง ชิ้นที่โพสต์แล้วจะเด้งกลับไปเป็น "รอถ่าย"
t("โพสต์แล้ว ไม่เด้งกลับเป็นรอถ่าย แม้วันถ่าย/ไฟล์งาน/ตรวจผ่าน จะยังมีค่าครบ", () => {
  const full: ContentPieceFields = {
    shootDate: "2026-07-18", workUrl: "https://x/work",
    approvedAt: "2026-07-20T09:00:00Z", postUrl: "https://tiktok.com/@a/video/1",
  };
  assert.equal(derivePieceStage(full), "published");
});

t("ตรวจผ่านแล้ว ไม่เด้งกลับเป็นกำลังตรวจสอบ แม้ยังมีไฟล์งาน", () => {
  assert.equal(derivePieceStage({ shootDate: "2026-07-18", workUrl: "https://x/w", approvedAt: "2026-07-20T09:00:00Z" }), "scheduled");
});

t("มีไฟล์งานแล้ว ไม่เด้งกลับเป็นรอถ่าย แม้ยังมีวันถ่าย", () => {
  assert.equal(derivePieceStage({ shootDate: "2026-07-18", workUrl: "https://x/w" }), "review");
});

// ── ค่าว่าง/ช่องว่าง ต้องไม่ถูกนับเป็น "มีค่า" ──────────────────────────────
t("สตริงว่าง / เว้นวรรคล้วน ไม่นับว่ากรอกแล้ว", () => {
  assert.equal(derivePieceStage({ postUrl: "" }), "plan");
  assert.equal(derivePieceStage({ postUrl: "   ", workUrl: "  ", shootDate: " " }), "plan");
  assert.equal(derivePieceStage({ approvedAt: "" }), "plan");
});

// ── back-compat: ข้อมูลเดิมที่ใช้ linkUrl ──────────────────────────────────
t("ข้อมูลเดิมที่คีย์ linkUrl ไว้ ยังนับเป็นไฟล์งาน (ไม่ตกกลับไปวางแผน)", () => {
  assert.equal(workUrlOf({ linkUrl: "https://old/file" }), "https://old/file");
  assert.equal(derivePieceStage({ linkUrl: "https://old/file" }), "review");
});

t("workUrl ชนะ linkUrl เมื่อมีทั้งคู่", () => {
  assert.equal(workUrlOf({ workUrl: "https://new", linkUrl: "https://old" }), "https://new");
});

// ── ความคืบหน้า ────────────────────────────────────────────────────────────
t("เสร็จ = เผยแพร่แล้วเท่านั้น (ตรวจผ่านยังไม่นับเสร็จ)", () => {
  assert.equal(isPieceDone({ postUrl: "https://x/1" }), true);
  assert.equal(isPieceDone({ approvedAt: "2026-07-21T00:00:00Z" }), false);
  assert.equal(isPieceDone({ workUrl: "https://x/w" }), false);
  assert.equal(isPieceDone({}), false);
});

// ── บรีฟงาน = ป้าย ไม่ใช่ขั้น ──────────────────────────────────────────────
t("ป้ายบรีฟงาน ไม่กลบสถานะจริง (owner: 'ป้ายกำกับ ซ้อนทับสถานะได้')", () => {
  const p: ContentPieceFields = { isBrief: true, postUrl: "https://x/1" };
  assert.equal(isBriefFlagged(p), true);
  assert.equal(derivePieceStage(p), "published"); // ยังเป็นเผยแพร่ ไม่กลายเป็น "บรีฟงาน"
  assert.equal(isBriefFlagged({}), false);
});

// ── ข้อความอธิบาย ──────────────────────────────────────────────────────────
t("tooltip บอกทั้งเหตุผลและสิ่งที่ต้องทำต่อ", () => {
  const s = explainStage({ workUrl: "https://x/w" });
  assert.ok(s.includes("มีไฟล์งานแล้ว"));
  assert.ok(s.includes("แก้มือไม่ได้"));
  assert.ok(s.includes(stageInfo("review").next));
});

console.log(`\n${pass} passed`);
