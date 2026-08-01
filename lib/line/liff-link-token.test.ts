import assert from "node:assert/strict";

// ต้องตั้ง secret ก่อน import (โมดูลอ่าน env ตอนเรียกใช้ · ตั้งไว้ก่อนกันพลาด)
process.env.RECEIPT_TOKEN_SECRET = "test-secret-for-liff-link-token-only";

import { signLiffLinkToken, verifyLiffLinkToken, LIFF_LINK_TOKEN_TTL_MINUTES } from "./liff-link-token-core";

// owner 2026-07-30: "ลูกค้าแจ้งว่า เชื่อมต่อไม่ได้สักทีครับ ลองหลายครั้งแล้ว LINE"
// token นี้พาตัวตนข้ามเข้าไปในเบราว์เซอร์ของแอป LINE ที่ไม่มีคุกกี้ session
// → เป็น capability จริง ต้องล็อกพฤติกรรมความปลอดภัยไว้ให้แน่น

const UID = "3f2a1b4c-5d6e-4f70-8912-abcdef012345";
const UID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// ── happy path ──
const tok = signLiffLinkToken(UID);
assert.ok(tok, "ควรได้ token");
assert.equal(verifyLiffLinkToken(tok), UID);

// รูปแบบ: <uuid>.<expMinutes>.<hmac 32 hex>
const parts = String(tok).split(".");
assert.equal(parts.length, 3);
assert.equal(parts[0], UID);
assert.match(parts[2], /^[0-9a-f]{32}$/);
// อายุ = TTL ที่ประกาศไว้ (± 1 นาทีจากการปัดเศษ)
const expMin = Number(parts[1]);
const nowMin = Math.floor(Date.now() / 60_000);
assert.ok(expMin - nowMin <= LIFF_LINK_TOKEN_TTL_MINUTES && expMin - nowMin >= LIFF_LINK_TOKEN_TTL_MINUTES - 1);

// ── token ของคนละบัญชี ต้องไม่ชนกัน ──
assert.notEqual(signLiffLinkToken(UID), signLiffLinkToken(UID2));
assert.equal(verifyLiffLinkToken(signLiffLinkToken(UID2)), UID2);

// ── ปลอม/แก้ค่า = ต้องปฏิเสธทุกกรณี ──
assert.equal(verifyLiffLinkToken(`${UID2}.${expMin}.${parts[2]}`), null, "สลับ uuid ต้องไม่ผ่าน");
assert.equal(verifyLiffLinkToken(`${UID}.${expMin + 10_000}.${parts[2]}`), null, "ยืดอายุเองต้องไม่ผ่าน");
assert.equal(verifyLiffLinkToken(`${UID}.${expMin}.${"0".repeat(32)}`), null, "ลายเซ็นมั่วต้องไม่ผ่าน");

// ── หมดอายุแล้ว = ปฏิเสธ (เซ็นด้วย exp ในอดีต โดยใช้ทางเดียวกับของจริง) ──
{
  // สร้าง token ที่หมดอายุ: ย้อนเวลาเครื่องชั่วคราวตอนเซ็น
  const realNow = Date.now;
  Date.now = () => realNow() - (LIFF_LINK_TOKEN_TTL_MINUTES + 5) * 60_000;
  const expiredTok = signLiffLinkToken(UID);
  Date.now = realNow;
  assert.ok(expiredTok);
  assert.equal(verifyLiffLinkToken(expiredTok), null, "token หมดอายุต้องไม่ผ่าน");
}

// ── input ขยะ = null ไม่ throw (หน้าเว็บต้องไม่ล้ม) ──
for (const bad of [
  null, undefined, "", "   ", "abc", UID, `${UID}.x.y`,
  `${UID}.${expMin}`, `${UID}.${expMin}.SHORT`,
  `${UID}.${expMin}.${parts[2].toUpperCase()}`,          // hex ตัวใหญ่ = ไม่รับ
  `not-a-uuid.${expMin}.${parts[2]}`,
  `${UID}.-5.${parts[2]}`,
]) {
  assert.equal(verifyLiffLinkToken(bad as string), null, `ควรปฏิเสธ: ${String(bad)}`);
}

// ── profileId ที่ไม่ใช่ uuid = ไม่เซ็นให้ (คืน null ไม่ throw) ──
assert.equal(signLiffLinkToken("PR628"), null);
assert.equal(signLiffLinkToken(""), null);
assert.equal(signLiffLinkToken("3f2a1b4c-5d6e-4f70-8912-abcdef01234"), null); // สั้นไป 1 ตัว

// ── uppercase uuid ที่ส่งเข้ามา ต้อง normalize แล้วยังใช้ได้ ──
{
  const t = signLiffLinkToken(UID.toUpperCase());
  assert.equal(verifyLiffLinkToken(t), UID, "uuid ตัวใหญ่ต้อง normalize เป็นตัวเล็ก");
}

console.log("liff-link-token: OK");
