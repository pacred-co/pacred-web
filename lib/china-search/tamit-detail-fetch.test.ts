/**
 * ล็อกพฤติกรรม "ลองซ้ำ TAMIT" ไว้ — บั๊ก owner 2026-08-04
 * *"ลิงก์สินค้าใช้ไม่ได้ ... พอกดรายการถัดไปแล้วเพิ่มลิงก์ดันใช้ได้เฉย"*
 *
 * สิ่งที่เทสนี้กันไม่ให้หลุดกลับมา:
 *   1. ล้มชั่วคราวแล้วต้อง **ลองใหม่** (ไม่ใช่ยิงครั้งเดียวแล้วขึ้นแดง)
 *   2. `status: 204` (ไม่มีสินค้าจริง) ต้อง **ไม่** ลองซ้ำ — ไม่งั้นลูกค้ารอฟรี ~40 วิ
 *   3. แยก not_found ↔ unreachable ให้ชัด (จอใช้ตัวนี้ตัดสินว่าจะโชว์ปุ่ม "ลองอีกครั้ง")
 *
 * รัน: tsx lib/china-search/tamit-detail-fetch.test.ts
 */
import assert from "node:assert/strict";
import { fetchTamitDetail } from "./tamit-detail-fetch";

const URL_ = "https://tamit-cloud.example/get/taobao/?id=123456";
/** เทสต้องไม่ไปรอเพดานจริง 8/14/20 วิ — คุมเวลาผ่าน deps */
const FAST = { timeoutsMs: [50, 50, 50] as const, gapMs: 0 };

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { passed++; },
    (e) => { console.error(`✗ ${name}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1; },
  );
}

async function main() {
  // ── 1. ทางปกติ ────────────────────────────────────────────────
  await check("status 200 → คืน json ทันที ยิงครั้งเดียว", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => { calls++; return jsonRes({ status: 200, data: { title: "x" } }); },
    });
    assert.ok("json" in res, "ควรได้ json");
    assert.equal(calls, 1, "ของที่ได้ตั้งแต่ครั้งแรก ห้ามยิงซ้ำ");
  });

  // ── 2. หัวใจของบั๊ก: ล้มครั้งแรก แล้วครั้งถัดไปได้ ─────────────
  await check("🔴 timeout ครั้งแรก แล้วครั้งที่ 2 ได้ → ต้องคืนสินค้า ไม่ใช่การ์ดแดง", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
        return jsonRes({ status: 200, data: { title: "ของจริง" } });
      },
    });
    assert.ok("json" in res, "ครั้งที่ 2 ได้ของ → ต้องคืนของ (นี่คือบั๊กที่ลูกค้าเจอ)");
    assert.equal(calls, 2);
  });

  await check("HTTP 5xx ครั้งแรก แล้วครั้งที่ 2 ได้ → คืนสินค้า", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => {
        calls++;
        return calls === 1 ? jsonRes(null, false, 503) : jsonRes({ status: 200, data: {} });
      },
    });
    assert.ok("json" in res);
    assert.equal(calls, 2);
  });

  // ── 3. ล้มทุกครั้ง → unreachable + ครบจำนวนครั้ง ───────────────
  await check("timeout ทุกครั้ง → unreachable + ยิงครบ 3", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => { calls++; throw new Error("ECONNREFUSED"); },
    });
    assert.deepEqual(res, { failure: "unreachable", attempts: 3 });
    assert.equal(calls, 3, "ต้องลองครบทุกเพดาน ไม่ใช่ยอมแพ้ตั้งแต่ครั้งแรก");
  });

  // ── 4. 204 = ไม่มีของจริง → ห้ามลองซ้ำ ─────────────────────────
  await check("status 204 → not_found ทันที ห้ามยิงซ้ำ", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => { calls++; return jsonRes({ status: 204, data: {} }); },
    });
    assert.deepEqual(res, { failure: "not_found", attempts: 1 });
    assert.equal(calls, 1, "ของไม่มีจริง ลองอีกก็ 204 — ห้ามผลาญเวลาลูกค้า");
  });

  await check("สะดุดก่อน แล้วเจอ 204 → not_found (นับครั้งที่ยิงจริง)", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return jsonRes({ status: 204, data: {} });
      },
    });
    assert.deepEqual(res, { failure: "not_found", attempts: 2 });
  });

  // ── 5. สถานะแปลกๆ = นับเป็นสะดุด ───────────────────────────────
  await check("status แปลก (500) → ลองซ้ำ แล้วจบเป็น unreachable", async () => {
    let calls = 0;
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => { calls++; return jsonRes({ status: 500 }); },
    });
    assert.deepEqual(res, { failure: "unreachable", attempts: 3 });
    assert.equal(calls, 3);
  });

  await check("json พัง → ไม่ throw ออกไป คืน unreachable", async () => {
    const res = await fetchTamitDetail(URL_, {
      ...FAST,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }) as unknown as Response,
    });
    assert.deepEqual(res, { failure: "unreachable", attempts: 3 });
  });

  if (process.exitCode) console.error(`\n${passed} passed, มีข้อที่ตก`);
  else console.log(`✓ tamit-detail-fetch — ${passed} assertions ผ่านหมด`);
}

void main();
