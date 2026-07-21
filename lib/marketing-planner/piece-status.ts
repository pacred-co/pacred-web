/**
 * สถานะการตลาดของชิ้นงาน — **คำนวณอัตโนมัติ ห้ามแก้มือ**
 * (owner 2026-07-21 "เรื่องสถานะ ต้องแก้ ให้ไม่สามารถแก้มือได้ ต้องทำให้เป็นอัตโนมัติ
 *  ตาม logic เช่น การแปะลิงก์งานที่โพสต์แล้ว = เสร็จสิ้น").
 *
 * 🔑 ทำไมถึงไม่ใช่ SettingItem(group="status") เหมือนสถานะระดับแผน:
 * ลำดับนี้เป็น **กฎการทำงาน** ไม่ใช่ตัวเลือกที่ใครไปเปลี่ยนชื่อเล่นๆ ได้ — ถ้าผูกกับ
 * settings ที่แก้ได้ วันหนึ่งมีคนเปลี่ยนชื่อ/ลบสถานะ ตัวคำนวณจะชี้ไปที่ว่าง แล้วงาน
 * ทั้งระบบสถานะเพี้ยนเงียบๆ โดยไม่มีอะไรฟ้อง. ตรงนี้จึง fix ไว้ในโค้ด + ล็อกด้วยเทส.
 *
 * 🔑 ทำไมตัดการแก้มือได้โดยไม่ต้องมีปุ่ม override:
 * ทุกสถานะมี "ตัวขับ" ที่กรอกได้เองอยู่แล้ว — สถานะไม่ตรงความจริง = ยังไม่ได้กรอก
 * ตัวขับ (เช่น โพสต์แล้วแต่ยังไม่แปะลิงก์) วิธีแก้คือกรอกให้ครบ ไม่ใช่ไปฝืนสถานะ
 * → self-correcting, ไม่มีทางค้างผิดถาวร.
 *
 * ลำดับ (owner): วางแผน → รอถ่าย → กำลังตรวจสอบ → รอเผยแพร่ → เผยแพร่ (ไฟนอล)
 * "บรีฟงาน" = **ป้ายกำกับ ไม่ใช่ขั้น** (owner เคาะ) — งานแทรก/บรีฟพิเศษ ซ้อนทับสถานะได้
 */
import type { ContentPieceFields } from "./types";

export type PieceStage = "plan" | "shoot" | "review" | "scheduled" | "published";

export const PIECE_STAGES: { id: PieceStage; label: string; color: string; /** ทำอะไรถึงจะขยับไปขั้นถัดไป */ next: string }[] = [
  { id: "plan", label: "วางแผน", color: "#94a3b8", next: "ใส่วันถ่าย (ถ้าต้องถ่าย) หรือแนบไฟล์งาน" },
  { id: "shoot", label: "รอถ่าย", color: "#f59e0b", next: "ถ่ายเสร็จแล้วแนบไฟล์งาน" },
  { id: "review", label: "กำลังตรวจสอบ", color: "#3b82f6", next: "ตรวจผ่าน → ติ๊กช่องตรวจผ่าน" },
  { id: "scheduled", label: "รอเผยแพร่", color: "#06b6d4", next: "โพสต์แล้วแปะลิงก์โพสต์" },
  { id: "published", label: "เผยแพร่", color: "#22c55e", next: "จบแล้ว" },
];

const BY_ID = new Map(PIECE_STAGES.map((s) => [s.id, s]));
export function stageInfo(id: PieceStage) {
  return BY_ID.get(id) ?? PIECE_STAGES[0];
}

/** ไฟล์งานของชิ้นนี้ — รองรับ `linkUrl` ของข้อมูลเดิม (ก่อนแยกไฟล์งาน/ลิงก์โพสต์). */
export function workUrlOf(p: ContentPieceFields): string {
  return (p.workUrl || p.linkUrl || "").trim();
}

/**
 * สถานะของชิ้นงาน — ตัดสินจาก "หลักฐานที่กรอกไว้" ล้วนๆ ไม่มี state ซ่อน.
 *
 * เช็คจากปลายทางย้อนกลับมา (โพสต์แล้ว → ตรวจผ่าน → มีงาน → นัดถ่าย) เพราะสถานะ
 * ที่ไกลกว่าย่อมกลบสถานะก่อนหน้าเสมอ — โพสต์ไปแล้วไม่มีทางกลับไปเป็น "รอถ่าย"
 * แม้ช่องวันถ่ายจะยังมีค่าค้างอยู่.
 */
export function derivePieceStage(p: ContentPieceFields | undefined): PieceStage {
  if (!p) return "plan";
  if (p.postUrl?.trim()) return "published";
  if (p.approvedAt?.trim()) return "scheduled";
  if (workUrlOf(p)) return "review";
  if (p.shootDate?.trim()) return "shoot";
  return "plan";
}

/** เสร็จจริง = เผยแพร่แล้วเท่านั้น (ใช้กับแถบความคืบหน้า). */
export function isPieceDone(p: ContentPieceFields | undefined): boolean {
  return derivePieceStage(p) === "published";
}

/** "งานแทรก / มีบรีฟพิเศษ" — ป้ายกำกับ ซ้อนทับสถานะ ไม่ได้แทนที่ (owner เคาะ). */
export function isBriefFlagged(p: ContentPieceFields | undefined): boolean {
  return p?.isBrief === true;
}

/** ข้อความอธิบายว่าทำไมถึงได้สถานะนี้ + ต้องทำอะไรต่อ (โชว์เป็น tooltip). */
export function explainStage(p: ContentPieceFields | undefined): string {
  const stage = derivePieceStage(p);
  const why =
    stage === "published" ? "มีลิงก์โพสต์แล้ว"
    : stage === "scheduled" ? "ตรวจผ่านแล้ว รอโพสต์"
    : stage === "review" ? "มีไฟล์งานแล้ว รอตรวจ"
    : stage === "shoot" ? "นัดวันถ่ายแล้ว ยังไม่มีไฟล์งาน"
    : "ยังไม่ได้ใส่วันถ่าย/ไฟล์งาน";
  return `${why} · สถานะคิดอัตโนมัติ แก้มือไม่ได้ — ${stageInfo(stage).next}`;
}
