/**
 * Integration test for the service-order placement flow (P-26).
 *
 * Hits real Supabase (admin client, bypasses RLS) and exercises the
 * cross-table INSERT chain that placeServiceOrder() in
 * actions/service-order.ts goes through:
 *
 *   create test profile
 *   → insert cart_items                 (verifies cart_items_cap trigger doesn't trip on tiny set)
 *   → insert service_orders             (verifies h_no auto-gen trigger fires + format O{YYMMDD}-{seq})
 *   → insert service_order_items
 *   → delete cart_items                 (placement clears placed items)
 *   → verify final state via admin reads
 *   → CLEANUP everything in reverse order, including auth.users
 *
 * DECISION (per §6 self-directed): can't directly invoke
 * placeServiceOrder() — that action calls createClient() which reads
 * Next.js cookies() for session, unavailable in a tsx script. We
 * replicate the same INSERT shape via admin client so the test still
 * exercises h_no trigger + FK constraints + cart cap (negatively
 * verified — we don't trip it). Pure-function logic (price calc) is
 * already covered by P-24's calc-price.test.ts.
 *
 * Run with:  pnpm tsx --env-file=.env.local lib/service-order/placement.test.ts
 * Or:        pnpm test  (chained after thai-number + calc-price)
 *
 * Skips gracefully (exit 0) if SUPABASE env vars are missing — so CI
 * without secrets doesn't fail.
 */

import { createClient } from "@supabase/supabase-js";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(label: string, condition: boolean, hint?: string) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}${hint ? `\n    ${hint}` : ""}`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("⏭  SUPABASE env vars unset — skipping integration test (this is OK for CI without secrets).");
    console.log("    Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local to run.");
    process.exit(0);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Generate unique test identifier so concurrent runs don't collide
  const runId   = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email   = `p26-test-${runId}@pacred-test.local`;
  const password = "Test123!secure";

  let userId:    string | null = null;
  let profileId: string | null = null;
  const cartIds:  string[] = [];
  let orderId:   string | null = null;
  let orderHNo:  string | null = null;

  // ── CLEANUP function — runs always (success or failure) ──
  async function cleanup() {
    console.log("\n🧹 cleanup");
    try {
      if (orderId) {
        await admin.from("service_order_items").delete().eq("service_order_id", orderId);
        await admin.from("service_orders").delete().eq("id", orderId);
      }
      if (cartIds.length > 0) {
        await admin.from("cart_items").delete().in("id", cartIds);
      }
      if (profileId) {
        // profiles.id FK to auth.users → cascades when we delete the auth user.
        // But also clean the profile row in case the cascade is partial.
        await admin.from("profiles").delete().eq("id", profileId);
      }
      if (userId) {
        await admin.auth.admin.deleteUser(userId);
      }
      console.log("  ✓ cleanup done");
    } catch (e) {
      console.error("  ✗ cleanup error (non-fatal):", e instanceof Error ? e.message : e);
    }
  }

  try {
    // ── STEP 1: create auth user + profile ──
    console.log("\nstep 1 — create test profile");
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`createUser failed: ${createErr?.message ?? "no user returned"}`);
    }
    userId = created.user.id;
    assertTrue("auth user created", typeof userId === "string" && userId.length > 0);

    const { error: profErr } = await admin.from("profiles").insert({
      id:           userId,
      account_type: "personal",
      first_name:   "P26",
      last_name:    `Test-${runId}`,
      phone:        `+66999${runId.slice(-7).padStart(7, "0")}`,
      status:       "active",
    });
    if (profErr) throw new Error(`profile insert failed: ${profErr.message}`);
    profileId = userId;
    assertTrue("profile row created with same id", profileId === userId);

    // ── STEP 2: insert cart_items ──
    console.log("\nstep 2 — insert 2 cart_items");
    const { data: cartRows, error: cartErr } = await admin
      .from("cart_items")
      .insert([
        {
          profile_id: profileId,
          provider:   "1688",
          shop_name:  "Test Shop A",
          url:        `https://detail.1688.com/offer/test-${runId}-1.html`,
          title:      "Widget A",
          price_cny:  10.5,
          amount:     2,
        },
        {
          profile_id: profileId,
          provider:   "taobao",
          shop_name:  "Test Shop B",
          url:        `https://item.taobao.com/item.htm?id=test-${runId}-2`,
          title:      "Gizmo B",
          price_cny:  25,
          amount:     1,
        },
      ])
      .select("id");
    if (cartErr || !cartRows) throw new Error(`cart insert failed: ${cartErr?.message ?? "no rows"}`);
    cartIds.push(...cartRows.map((r) => r.id as string));
    assertEq("inserted 2 cart items", cartRows.length, 2);

    // ── STEP 3: insert service_orders header (h_no trigger should auto-gen) ──
    console.log("\nstep 3 — insert service_orders header (h_no auto-gen)");
    const subtotal_cny = 10.5 * 2 + 25 * 1;       // 46
    const yuan_rate    = 5;
    const service_fee  = 50;
    const total_thb    = subtotal_cny * yuan_rate + service_fee;  // 280

    const { data: orderRow, error: orderErr } = await admin
      .from("service_orders")
      .insert({
        profile_id:        profileId,
        status:            "awaiting_payment",
        title:             `P26 Test ${runId}`,
        item_count:        2,
        warehouse_china:   "guangzhou",
        transport_type:    "truck",
        pay_method:        "origin",
        crate:             false,
        free_shipping:     false,
        yuan_rate_locked:  yuan_rate,
        subtotal_cny,
        service_fee,
        total_thb,
        ship_first_name:   "Test",
        ship_last_name:    "User",
        ship_phone:        "0812345678",
        ship_address_line: "123 Test Rd",
        ship_sub_district: "Test Subdist",
        ship_district:     "Test Dist",
        ship_province:     "Bangkok",
        ship_postal_code:  "10110",
        date_awaiting_payment: new Date().toISOString(),
        payment_due_at:        new Date(Date.now() + 24 * 3600_000).toISOString(),
      })
      .select("id, h_no, status, total_thb, item_count")
      .single<{ id: string; h_no: string; status: string; total_thb: number; item_count: number }>();
    if (orderErr || !orderRow) throw new Error(`order insert failed: ${orderErr?.message ?? "no row"}`);

    orderId  = orderRow.id;
    orderHNo = orderRow.h_no;

    assertTrue(
      `h_no auto-generated (got: ${orderHNo})`,
      typeof orderHNo === "string" && /^O\d{6}-\d+$/.test(orderHNo),
      "expected pattern O{YYMMDD}-{seq}",
    );
    assertEq("status = awaiting_payment", orderRow.status, "awaiting_payment");
    assertEq("item_count = 2", orderRow.item_count, 2);
    assertEq("total_thb = 280 (subtotal 46 × yuan 5 + svc 50)", Number(orderRow.total_thb), 280);

    // ── STEP 4: insert service_order_items snapshot ──
    console.log("\nstep 4 — insert service_order_items snapshot");
    const { error: itemsErr } = await admin
      .from("service_order_items")
      .insert([
        {
          service_order_id: orderId,
          provider:         "1688",
          shop_name:        "Test Shop A",
          title:            "Widget A",
          price_cny:        10.5,
          amount:           2,
        },
        {
          service_order_id: orderId,
          provider:         "taobao",
          shop_name:        "Test Shop B",
          title:            "Gizmo B",
          price_cny:        25,
          amount:           1,
        },
      ]);
    if (itemsErr) throw new Error(`items insert failed: ${itemsErr.message}`);

    const { count: itemCountActual } = await admin
      .from("service_order_items")
      .select("id", { count: "exact", head: true })
      .eq("service_order_id", orderId);
    assertEq("2 service_order_items rows present", itemCountActual, 2);

    // ── STEP 5: clear cart_items (placement clears them) ──
    console.log("\nstep 5 — clear cart_items (mimics placement)");
    const { error: delErr } = await admin.from("cart_items").delete().in("id", cartIds);
    if (delErr) throw new Error(`cart delete failed: ${delErr.message}`);

    const { count: cartLeft } = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    assertEq("cart empty for test profile after placement", cartLeft, 0);
    cartIds.length = 0;       // mark cleaned so cleanup() doesn't double-delete

    // ── STEP 6: verify the order is intact + readable ──
    console.log("\nstep 6 — verify order intact");
    const { data: fetched } = await admin
      .from("service_orders")
      .select("id, h_no, status, item_count, total_thb")
      .eq("id", orderId)
      .single<{ id: string; h_no: string; status: string; item_count: number; total_thb: number }>();
    assertTrue("order fetchable by id", !!fetched && fetched.id === orderId);
    assertEq("fetched h_no matches insert", fetched?.h_no, orderHNo);
    assertEq("fetched status still awaiting_payment", fetched?.status, "awaiting_payment");
  } catch (e) {
    fail++;
    console.error(`\n✗ test threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
