import "server-only";

/**
 * LIFF link token — ด่าน `server-only` ของ `liff-link-token-core.ts`.
 *
 * ตรรกะ เหตุผล และขอบเขตอำนาจของ token ทั้งหมดอยู่ใน `-core` (PURE · มีเทส).
 * ไฟล์นี้มีไว้อย่างเดียว: กันไม่ให้กุญแจเซ็น (RECEIPT_TOKEN_SECRET /
 * SUPABASE_SERVICE_ROLE_KEY) หลุดเข้า client bundle — โค้ดแอปต้อง import จากที่นี่.
 */
export {
  LIFF_LINK_TOKEN_TTL_MINUTES,
  signLiffLinkToken,
  verifyLiffLinkToken,
} from "./liff-link-token-core";
