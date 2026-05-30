# V3 / Phase-C wishlist — deferred enhancement ideas

> Per AGENTS.md §2 + §4: genuine improvement ideas that are **not** in legacy PCS get
> recorded here instead of being smuggled into a faithful-port diff. Nothing here ships
> until the faithful port works (Phase B done). This is a parking lot, not a backlog.

---

## Customer "confirm receipt on delivery" (delivery-acknowledgement)

**Removed from the faithful port 2026-05-30** (เดฟ, on the gap-audit owner directive).

- **What it was:** a green "ยืนยันรับสินค้าครบถ้วน" card on the order/forwarder detail page that
  let the customer self-stamp `acknowledged_at` + an optional note when an order reached the
  terminal delivered status.
- **Why removed:** legacy PCS has **no** customer-acknowledge-on-delivery concept. Verified from
  source (`/Users/dev/Desktop/pcs-realshit/.../member/`): the customer shop-order handler set is
  only `calPrice.php` / `cancelOrder.php` / `getList.php`; `hStatus='5'` (สำเร็จ) is written
  **admin-side only** (`pcs-admin/.../shops/update/update5.php`). The customer never confirms
  receipt. The Pacred feature wrote the **rebuilt empty `service_orders` table** → a silent
  dead-write (the "Potemkin" pattern: green toast, 0 real rows changed) for all 8,898 migrated
  customers. `tb_header_order` has no `acknowledged_at`/`acknowledged_note` columns.
- **Faithful-first call:** option (b) — delete the orphan flow + its UI, rather than option (a)
  add Pacred-original columns to the legacy `tb_header_order` schema (which would diverge the
  legacy schema and smuggle a Phase-C feature into the port). The service-order side is gone;
  the forwarder-side twin (`customerAcknowledgeForwarderDelivery` + `/service-import/[fNo]`
  mount + the now-forwarder-only `components/delivery-ack-panel.tsx`) is the SAME Potemkin and is
  flagged for the same removal once `actions/forwarder.ts` is collision-free.
- **If revived in Phase C:** design a real "customer confirms receipt + rates / reports damage"
  loop on `tb_header_order` (e.g. a dedicated `tb_*` ack table or a status sub-state), wired to
  the LINE/SMS notify path, with admin visibility — not a column bolted onto the legacy header.
