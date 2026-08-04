/**
 * ยิง TAMIT product-detail แบบ "ลองซ้ำเฉพาะที่ควรลองซ้ำ".
 *
 * อยู่แยกไฟล์ (ไม่มี `server-only`) เพื่อให้ยูนิตเทสรันด้วย tsx ได้ตรงๆ —
 * แพทเทินเดียวกับ `extract-product-id.ts` / `short-url-helpers.ts` ที่แยกออกมา
 * เพราะ `lib/china-search/index.ts` เป็น server-only แล้ว import ใน node ล้วนจะพัง.
 *
 * ── 🔴 บั๊กที่ปิดไป (owner 2026-08-04) ────────────────────────────────
 * *"ลิงก์สินค้าใช้ไม่ได้ คือไร ใช้กันมาทั้งวัน พอกดรายการถัดไปแล้วเพิ่มลิงก์
 * ดันใช้ได้เฉย"*
 *
 * เดิมยิง TAMIT **ครั้งเดียว timeout 8 วิ** แล้ว `catch {}` เงียบๆ → ตกไปเป็นการ์ด
 * demo → จอขึ้นแดง "ตรวจไม่พบสินค้า" ทั้งที่สินค้ามีอยู่จริง.
 *
 * TAMIT ต้องไปไล่ขูดหน้า Taobao **สดๆ** ตอนที่ยังไม่เคยแคชสินค้าตัวนั้น (วัดจริง
 * 2026-08-04: ไอดีที่ไม่มีในระบบยังใช้ 2.7-2.9 วิ · ตัวที่แคชแล้ว 0.19 วิ) — ตัวที่
 * ต้องขูดสดจึงชนเพดาน 8 วิ เป็นประจำ. พอลูกค้ากด "เพิ่มรายการ" แล้ววางลิงก์เดิม =
 * การลองใหม่นั่นเอง และคราวนี้ TAMIT ขูดเสร็จ+แคชไว้แล้ว เลยขึ้นทันที ⇒ อาการ
 * "เดี๋ยวได้เดี๋ยวไม่ได้" แบบสุ่มที่ไล่ไม่เจอ.
 *
 * ✅ ลองซ้ำ: timeout / เน็ตพัง / HTTP ไม่ 2xx — ยังไม่รู้คำตอบ + ครั้งถัดไปมักได้
 *    (ขยายเพดานขึ้นทุกครั้ง เพราะครั้งแรกคือครั้งที่แพงที่สุด = ครั้งที่ขูดสด)
 * ❌ ไม่ลองซ้ำ: `status: 204` = TAMIT ยืนยันว่าไม่มีสินค้านี้ (ยิงบ็อกไอดีได้ 204
 *    ทุกครั้ง) — ลองอีกก็ 204 เหมือนเดิม เสียเวลาลูกค้าฟรีๆ อีกเป็นสิบวินาที
 */

export const TAMIT_ATTEMPT_TIMEOUTS_MS = [8_000, 14_000, 20_000] as const;
export const TAMIT_RETRY_GAP_MS = 400;

export type TamitFetchResult =
  | { json: unknown }
  | { failure: "not_found" | "unreachable"; attempts: number };

/** ทำให้เทสไม่ต้องนั่งรอจริง — โปรดักชันไม่ส่ง จะได้ค่าจริงข้างบน */
export type TamitFetchDeps = {
  fetchImpl?: typeof fetch;
  timeoutsMs?: readonly number[];
  gapMs?: number;
};

export async function fetchTamitDetail(
  endpoint: string,
  deps: TamitFetchDeps = {},
): Promise<TamitFetchResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const timeouts = deps.timeoutsMs ?? TAMIT_ATTEMPT_TIMEOUTS_MS;
  const gapMs = deps.gapMs ?? TAMIT_RETRY_GAP_MS;

  let attempts = 0;
  for (const timeoutMs of timeouts) {
    if (attempts > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    attempts++;
    try {
      const res = await doFetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue; // 5xx/429 = ฝั่งเขาสะดุด → ลองใหม่
      const json = (await res.json()) as unknown;
      const status = String((json as { status?: number | string } | null)?.status ?? "");
      if (status === "200") return { json };
      // 204 = ไม่มีสินค้านี้จริง → หยุดทันที ไม่ผลาญเวลาลูกค้า
      if (status === "204") return { failure: "not_found", attempts };
      continue; // สถานะแปลกอื่นๆ = นับเป็นสะดุด ลองใหม่
    } catch {
      // timeout (AbortSignal) / DNS / socket — ลองใหม่ด้วยเพดานที่กว้างขึ้น
    }
  }
  return { failure: "unreachable", attempts };
}
