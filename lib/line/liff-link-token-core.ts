import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LIFF link token — พาตัวตนลูกค้าข้ามเข้าไปในเบราว์เซอร์ของแอป LINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 owner 2026-07-30: *"ลูกค้าแจ้งว่า เชื่อมต่อไม่ได้สักทีครับ ลองหลายครั้งแล้ว LINE"*
 *
 * ── ทำไมเชื่อมไม่ได้ (พิสูจน์แล้วบน prod: 0 จาก 9,465 profiles เคยเชื่อมสำเร็จ) ──
 * ปุ่ม "เชื่อมต่อ LINE" พาไป `https://liff.line.me/<LIFF_ID>` → LINE เปิดหน้า
 * `/liff/link` ใน **เบราว์เซอร์ของแอป LINE** ซึ่งเป็นคนละ browser context กับที่
 * ลูกค้าล็อกอิน Pacred ไว้ ⇒ **ไม่มีคุกกี้ session ติดไปด้วย** → `requireAuth()`
 * เด้งไป `/login` → ลูกค้าเห็นหน้าเข้าสู่ระบบใน LINE แล้ววนไม่จบ
 * (ฟีเจอร์นี้จึงไม่เคยทำงานเลยตั้งแต่เปิดมา ไม่ใช่ลูกค้ารายเดียว)
 *
 * ── วิธีแก้: พาตัวตนไปกับลิงก์ ไม่พึ่งคุกกี้ ──
 * ตอนลูกค้า (ที่ล็อกอินอยู่แล้วบนเว็บ) กดปุ่ม เราแนบ token ที่เซ็นด้วยกุญแจฝั่ง
 * server ไปกับ LIFF URL — LINE ส่ง query ต่อไปยัง endpoint → หน้า `/liff/link`
 * ตรวจ token แล้วรู้ว่าเป็นบัญชีไหน โดยไม่ต้องมีคุกกี้.
 *
 * ── ขอบเขตอำนาจของ token (ตั้งใจให้แคบที่สุด) ──
 *   • ทำได้อย่างเดียว: ผูก LINE userId เข้ากับ **profile ที่ระบุใน token เท่านั้น**
 *   • อ่านข้อมูลอะไรไม่ได้เลย · เปลี่ยนรหัสผ่าน/ยอดเงิน/ออเดอร์ไม่ได้
 *   • **หมดอายุใน 30 นาที** (ต่างจาก receipt token ที่อยู่ถาวรเพราะพิมพ์ลง QR)
 *   • ยังโดนกฎ "1 LINE ต่อ 1 บัญชี" เหมือนเดิม (unique partial index)
 *   • domain-separated hmac (`liff-link:`) → เอา token ของระบบอื่นมาใช้ไม่ได้
 *
 * รูปแบบ: `<profileId>.<expUnixMinutes>.<hmac 32 hex>`
 * กุญแจ: `RECEIPT_TOKEN_SECRET` → fallback `SUPABASE_SERVICE_ROLE_KEY`
 * (ตัวเดียวกับ receipt-token · server-only ทั้งคู่ · ไม่หลุดไป client bundle)
 *
 * PURE crypto — ไม่มี DB access · ไม่มี `server-only` เพื่อให้เทสรันตรงได้
 * (ตัว `liff-link-token.ts` เป็นด่าน server-only ที่ re-export ไฟล์นี้ — import จากตัวนั้น).
 */

/** อายุ token (นาที) — สั้นพอที่ลิงก์หลุดแล้วใช้ไม่ได้ แต่ยาวพอให้กดเพิ่มเพื่อน LINE ก่อน */
export const LIFF_LINK_TOKEN_TTL_MINUTES = 30;

function tokenSecret(): string {
  const s = process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "liff-link-token: neither RECEIPT_TOKEN_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set",
    );
  }
  return s;
}

/** UUID v4 ของ profiles.id — รูปแบบเข้มเพื่อไม่ให้ token แปลกๆ ผ่านเข้ามา */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hmacFor(profileId: string, expMinutes: number): string {
  return createHmac("sha256", tokenSecret())
    .update(`liff-link:${profileId}:${expMinutes}`)
    .digest("hex")
    .slice(0, 32);
}

/** นาที Unix ปัจจุบัน — ใช้หน่วยนาทีเพื่อให้ token สั้น (ไม่ต้องพก ms) */
function nowMinutes(): number {
  return Math.floor(Date.now() / 60_000);
}

/**
 * สร้าง token ให้ profile นี้ (เรียกตอน render ปุ่ม "เชื่อมต่อ LINE" ฝั่ง server
 * ขณะที่ลูกค้ายังมี session อยู่).
 *
 * @param profileId `profiles.id` (uuid)
 * @returns token หรือ `null` ถ้า profileId ไม่ใช่ uuid (ไม่ throw — ปุ่มยังกดได้
 *          แค่ตกไปใช้เส้นทางคุกกี้เดิม)
 */
export function signLiffLinkToken(profileId: string): string | null {
  const id = String(profileId ?? "").trim().toLowerCase();
  if (!UUID_RE.test(id)) return null;
  const exp = nowMinutes() + LIFF_LINK_TOKEN_TTL_MINUTES;
  return `${id}.${exp}.${hmacFor(id, exp)}`;
}

/**
 * ตรวจ token → คืน profileId เมื่อลายเซ็นถูกและยังไม่หมดอายุ · คืน `null` ทุกกรณีอื่น
 * (รูปแบบผิด · ลายเซ็นปลอม · แก้ค่า exp · หมดอายุ).
 *
 * เทียบลายเซ็นแบบ constant-time — กัน timing side-channel เดาลายเซ็นทีละไบต์.
 */
export function verifyLiffLinkToken(token: string | null | undefined): string | null {
  const raw = String(token ?? "").trim();
  const m = /^([0-9a-f-]{36})\.(\d{1,12})\.([0-9a-f]{32})$/.exec(raw);
  if (!m) return null;
  const [, id, expRaw, sig] = m;
  if (!UUID_RE.test(id)) return null;

  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= 0) return null;
  // หมดอายุ → ปฏิเสธ (เช็คก่อนคำนวณ hmac ก็ได้ แต่คำนวณทีหลังเพื่อให้เวลาตอบคงที่กว่า)
  const expired = exp < nowMinutes();

  const expected = Buffer.from(hmacFor(id, exp), "hex");
  const given = Buffer.from(sig, "hex");
  if (expected.length !== given.length) return null;
  if (!timingSafeEqual(expected, given)) return null;

  return expired ? null : id;
}
