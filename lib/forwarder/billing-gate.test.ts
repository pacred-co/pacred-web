/**
 * U1-3 — arrival→billing gate unit tests.
 *
 * `getCargoBillingGate` reads two tables (forwarders, cargo_containers) and
 * decides whether a post-arrival wallet debit is blocked until the linked
 * cargo_container is `closed`. A regression here either lets staff bill off
 * a stale order-time CBM estimate (datanew L-3: ~31% gap), or wrongly
 * blocks a legitimate pre-arrival deposit.
 *
 * The boundary mocked here is the Supabase client. We hand the function a
 * tiny fake whose `.from(table)` returns a builder resolving to a
 * caller-supplied `{ data, error }` — exactly the shape `.maybeSingle()`
 * yields. No DB / network / file IO.
 *
 * Coverage:
 *   1. defensive — empty / non-string f_no → { blocked: false }
 *   2. pre-arrival statuses (pending_payment / shipped_china / in_transit)
 *      → not gated
 *   3. terminal statuses (delivered / cancelled) → not gated
 *   4. gated status + no container link → blocked 'no_container_linked'
 *   5. gated status + container not closed → blocked 'awaiting_container_close'
 *      (+ container_status echoed back)
 *   6. gated status + container closed → { blocked: false }
 *   7. fail-OPEN on a forwarders read error → { blocked: false }
 *      (caller's own not_found guard handles a missing forwarder; a
 *      hard outage surfaces in the downstream wallet-tx insert)
 *   8. fail-CLOSED on a cargo_containers read error → blocked
 *      'db_read_error' (P1-3 fix — billing must NOT proceed on the
 *      stale order-time CBM estimate when we cannot verify the
 *      container is `closed`; datanew L-3 ~31% gap)
 *   9. unknown forwarder (no row) → { blocked: false }
 *  10. linked container row vanished → blocked 'no_container_linked'
 *      (data-integrity fail-closed)
 *
 * NOTE on `server-only`: billing-gate.ts opens with `import "server-only"`,
 * a build-time marker the Next.js bundler resolves but which is NOT an
 * installed npm package. This test is run via `tsx --tsconfig
 * tsconfig.test.json`, whose `paths` mapping resolves `server-only` to an
 * empty local stub so the real gate module loads under `tsx`. The whole
 * test runs inside a `main()` wrapper because the tsx harness transpiles
 * `.ts` to CJS, where top-level `await` is unsupported.
 *
 * Run: pnpm tsx --tsconfig tsconfig.test.json lib/forwarder/billing-gate.test.ts
 *      (the `test:unit` script wires this in).
 */

import { getCargoBillingGate } from "./billing-gate";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

// ────────────────────────────────────────────────────────────
// Fake Supabase client
// ────────────────────────────────────────────────────────────
// Builds a client whose `.from(table)` → builder → `.maybeSingle()` resolves
// to the row registered for that table. `forwarders` / `cargo_containers`
// values are `{ data, error }` envelopes — the exact shape PostgREST returns.
type Envelope = { data: unknown; error: unknown };
type Rows = { forwarders?: Envelope; cargo_containers?: Envelope };

type GateClient = Parameters<typeof getCargoBillingGate>[0];

function makeClient(rows: Rows): GateClient {
  const client = {
    from(table: string) {
      const envelope: Envelope =
        (rows as Record<string, Envelope>)[table] ?? { data: null, error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => envelope,
      };
      return builder;
    },
  };
  return client as unknown as GateClient;
}

async function main(): Promise<void> {
  console.log("billing-gate (U1-3)");

  // ──────────────────────────────────────────────────────────
  // (a) defensive — bad f_no
  // ──────────────────────────────────────────────────────────
  console.log("  (a) defensive — bad f_no never throws");
  {
    const empty = await getCargoBillingGate(makeClient({}), "");
    assert("empty f_no → not blocked", empty.blocked === false);
    const notString = await getCargoBillingGate(
      makeClient({}),
      12345 as unknown as string,
    );
    assert("non-string f_no → not blocked", notString.blocked === false);
  }

  // ──────────────────────────────────────────────────────────
  // (b) pre-arrival statuses are NOT gated
  // ──────────────────────────────────────────────────────────
  console.log("  (b) pre-arrival / in-flight statuses → not gated");
  for (const status of ["pending_payment", "shipped_china", "in_transit"]) {
    const gate = await getCargoBillingGate(
      makeClient({ forwarders: { data: { status, cargo_container_id: null }, error: null } }),
      "F26050001",
    );
    assert(`${status} → not blocked`, gate.blocked === false);
  }

  // ──────────────────────────────────────────────────────────
  // (c) terminal statuses are NOT gated
  // ──────────────────────────────────────────────────────────
  console.log("  (c) terminal statuses → not gated (caller's own guard wins)");
  for (const status of ["delivered", "cancelled"]) {
    const gate = await getCargoBillingGate(
      makeClient({ forwarders: { data: { status, cargo_container_id: null }, error: null } }),
      "F26050001",
    );
    assert(`${status} → not blocked`, gate.blocked === false);
  }

  // ──────────────────────────────────────────────────────────
  // (d) gated status + no container link → no_container_linked
  // ──────────────────────────────────────────────────────────
  console.log("  (d) gated status, no container link → blocked");
  for (const status of ["arrived_thailand", "out_for_delivery"]) {
    const gate = await getCargoBillingGate(
      makeClient({ forwarders: { data: { status, cargo_container_id: null }, error: null } }),
      "F26050001",
    );
    assert(`${status} + null container → blocked`, gate.blocked === true);
    assert(
      `${status} → reason no_container_linked`,
      gate.blocked === true && gate.reason === "no_container_linked",
    );
  }

  // ──────────────────────────────────────────────────────────
  // (e) gated status + container not closed → awaiting_container_close
  // ──────────────────────────────────────────────────────────
  console.log("  (e) gated status, container not closed → blocked");
  {
    const gate = await getCargoBillingGate(
      makeClient({
        forwarders:       { data: { status: "arrived_thailand", cargo_container_id: "c-1" }, error: null },
        cargo_containers: { data: { status: "receiving" }, error: null },
      }),
      "F26050001",
    );
    assert("non-closed container → blocked", gate.blocked === true);
    assert(
      "reason is awaiting_container_close",
      gate.blocked === true && gate.reason === "awaiting_container_close",
    );
    assert(
      "container_status echoed back",
      gate.blocked === true && gate.container_status === "receiving",
    );
  }

  // ──────────────────────────────────────────────────────────
  // (f) gated status + container closed → not blocked
  // ──────────────────────────────────────────────────────────
  console.log("  (f) gated status, container CLOSED → not blocked");
  {
    const gate = await getCargoBillingGate(
      makeClient({
        forwarders:       { data: { status: "out_for_delivery", cargo_container_id: "c-1" }, error: null },
        cargo_containers: { data: { status: "closed" }, error: null },
      }),
      "F26050001",
    );
    assert("closed container → not blocked", gate.blocked === false);
  }

  // ──────────────────────────────────────────────────────────
  // (g) split fail policy on DB read error (P1-3)
  //     - forwarders read error → fail-OPEN
  //     - cargo_containers read error → fail-CLOSED with 'db_read_error'
  // ──────────────────────────────────────────────────────────
  console.log("  (g) split fail policy on DB read error");
  {
    const fwdErr = await getCargoBillingGate(
      makeClient({ forwarders: { data: null, error: { message: "boom" } } }),
      "F26050001",
    );
    assert("forwarders read error → not blocked (fail-open)", fwdErr.blocked === false);

    const contErr = await getCargoBillingGate(
      makeClient({
        forwarders:       { data: { status: "arrived_thailand", cargo_container_id: "c-1" }, error: null },
        cargo_containers: { data: null, error: { message: "boom" } },
      }),
      "F26050001",
    );
    assert(
      "cargo_containers read error → blocked (fail-closed)",
      contErr.blocked === true,
    );
    assert(
      "cargo_containers read error → reason db_read_error",
      contErr.blocked === true && contErr.reason === "db_read_error",
    );
    assert(
      "cargo_containers read error → container_status undefined (no row to read from)",
      contErr.blocked === true && contErr.container_status === undefined,
    );
  }

  // ──────────────────────────────────────────────────────────
  // (h) unknown forwarder (no row) → not blocked
  // ──────────────────────────────────────────────────────────
  console.log("  (h) unknown forwarder → not blocked");
  {
    const gate = await getCargoBillingGate(
      makeClient({ forwarders: { data: null, error: null } }),
      "F-DOES-NOT-EXIST",
    );
    assert("missing forwarder row → not blocked", gate.blocked === false);
  }

  // ──────────────────────────────────────────────────────────
  // (i) linked container row vanished → fail-CLOSED
  // ──────────────────────────────────────────────────────────
  console.log("  (i) linked container row vanished → fail-closed");
  {
    const gate = await getCargoBillingGate(
      makeClient({
        forwarders:       { data: { status: "arrived_thailand", cargo_container_id: "c-gone" }, error: null },
        cargo_containers: { data: null, error: null },
      }),
      "F26050001",
    );
    assert("vanished container → blocked", gate.blocked === true);
    assert(
      "vanished container → reason no_container_linked",
      gate.blocked === true && gate.reason === "no_container_linked",
    );
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
