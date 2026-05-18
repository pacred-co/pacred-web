-- ════════════════════════════════════════════════════════════
-- 0078 · Warehouse cascade RPC — P1-5 atomicity fix
-- ════════════════════════════════════════════════════════════
-- Per review-u1-u2-2026-05-18.md §P1-5:
--
-- The container → cargo_shipments → forwarders / service_orders status
-- cascade in `actions/admin/warehouse.ts::cascadeContainerToShipments`
-- was best-effort and non-atomic: each hop was wrapped in try/catch and
-- "logged + continued" on failure. A mid-cascade failure left a
-- container 'arrived' while child forwarders stayed 'in_transit' —
-- billing-gate.ts then read divergent state and let a wallet debit
-- through on a stale CBM estimate (the exact ~31% gap U1-3 exists to
-- prevent).
--
-- ── The fix ──
-- Move the entire cascade into a single SECURITY DEFINER Postgres
-- function. Postgres runs each function call in its own transaction
-- (or inside the caller's TX) — so all writes commit or none do. If
-- ANY hop raises, every prior write in the same call is rolled back.
-- No partial state. The action layer keeps its same return shape; only
-- the cascade internals move to SQL.
--
-- ── What's preserved ──
--  * Forward-only lifecycle (never regress a row already past target).
--  * Per-status date_* column stamp (matches the manual flip actions —
--    forwarders.ts::STATUS_DATE_COL + service-orders.ts::STATUS_DATE_COL).
--  * U1-5 delivered → completed auto-close hook for service_orders.
--  * Distinct audit-action names ('container.cascade_shipment_status' /
--    'shipment.cascade_forwarder_status' / 'shipment.cascade_service_
--    order_status' / 'service_order.auto_close_on_delivery').
--  * The same admin_id_update fingerprint on every flipped row.
--
-- ── What's different ──
--  * Atomicity. A failed forwarder UPDATE rolls back the prior shipment
--    UPDATE in the same call, instead of being logged + skipped.
--  * Return value: jsonb summarising counts (shipments_updated /
--    forwarders_updated / service_orders_updated / auto_closed_orders)
--    so the action can surface "3 of 12 children updated" in the UI.
--  * Audit-log rows are inserted by the function itself (mirrors what
--    the TS cascade did via logAdminAction); on rollback they roll back
--    with the rest — keeping the audit trail honest.
--
-- ── Atomicity guarantee ──
-- This function is the SINGLE source of cascade truth. The action
-- layer (`adminSetContainerStatus`) used to call the cascade AFTER
-- the parent container update — that pattern is preserved: the
-- container's own status flip + history row land first (separate TX
-- via dbSetContainerStatus); this function then atomically cascades
-- to all children. The two-phase shape (parent first, then atomic
-- children) is intentional — a failed cascade leaves the container
-- updated and an admin can retry, but never leaves children half-done.
--
-- ── Security ──
-- SECURITY DEFINER so the function runs with the migration runner's
-- privileges (same pattern as is_admin, wallet_assert_no_overdraw).
-- EXECUTE is REVOKED from public/anon/authenticated and GRANTED only
-- to service_role — only the server-side action can call it. RLS on
-- the underlying tables is bypassed (intentional — the action layer
-- has already gated on withAdmin(['super','ops','warehouse'])).
--
-- Idempotent (create or replace). Zero data migration. Safe to apply.
-- ════════════════════════════════════════════════════════════

create or replace function public.cascade_container_status(
  p_container_id    uuid,
  p_container_status text,
  p_admin_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Status maps — mirror the TS constants in actions/admin/warehouse.ts.
  -- Kept in-function (not as separate tables) to keep the maps + cascade
  -- atomic and reviewable in one place.
  v_shipment_target          text;
  v_forwarder_target         text;
  v_service_order_target     text;

  -- Per-row scratch
  v_shipment                 record;
  v_forwarder                record;
  v_service_order            record;
  v_fwd_date_col             text;
  v_so_date_col              text;
  v_now                      timestamptz := now();

  -- Counters returned in the result jsonb
  v_shipments_total          int := 0;
  v_shipments_updated        int := 0;
  v_shipments_skipped_ahead  int := 0;
  v_forwarders_updated       int := 0;
  v_forwarders_skipped_ahead int := 0;
  v_service_orders_updated   int := 0;
  v_service_orders_skipped_ahead int := 0;
  v_auto_closed_orders       int := 0;

  -- Lifecycle order arrays for the forward-only "don't regress" check.
  -- Match the TS SHIPMENT_ORDER / FORWARDER_STATUS_ORDER /
  -- SERVICE_ORDER_STATUS_ORDER constants. Index lookups via array_position.
  v_shipment_order text[] := array[
    'received_cn', 'packed_cn', 'sealed_in_container', 'in_transit',
    'arrived_th', 'unloaded', 'out_for_delivery', 'delivered'
  ];
  v_forwarder_order text[] := array[
    'pending_payment', 'shipped_china', 'in_transit',
    'arrived_thailand', 'out_for_delivery', 'delivered'
  ];
  v_service_order_order text[] := array[
    'pending', 'awaiting_payment', 'ordered',
    'awaiting_chn_dispatch', 'completed'
  ];

  v_ci int;   -- current index
  v_ti int;   -- target index
begin
  -- ── Container → shipment target ──
  -- Mirrors TS CONTAINER_TO_SHIPMENT map. 'packing'/'closed' = no cascade.
  v_shipment_target := case p_container_status
    when 'sealed'     then 'sealed_in_container'
    when 'in_transit' then 'in_transit'
    when 'arrived'    then 'arrived_th'
    when 'unloading'  then 'unloaded'
    else null
  end;

  if v_shipment_target is null then
    -- No-op cascade for packing / closed. Return early with zero counts.
    return jsonb_build_object(
      'shipments_total',           0,
      'shipments_updated',         0,
      'shipments_skipped_ahead',   0,
      'forwarders_updated',        0,
      'forwarders_skipped_ahead',  0,
      'service_orders_updated',    0,
      'service_orders_skipped_ahead', 0,
      'auto_closed_orders',        0,
      'cascade_reason',            'no_cascade_for_status'
    );
  end if;

  -- ── Loop every shipment attached to the container ──
  for v_shipment in
    select id, status, forwarder_f_no, service_order_h_no
      from public.cargo_shipments
     where cargo_container_id = p_container_id
     for update
  loop
    v_shipments_total := v_shipments_total + 1;

    -- Forward-only check: skip if already at or past the target.
    -- Unknown current status (e.g. cancelled, legacy) is treated as
    -- "ahead" so we never auto-overwrite it. Matches isAtOrPast() in TS.
    v_ci := array_position(v_shipment_order, v_shipment.status);
    v_ti := array_position(v_shipment_order, v_shipment_target);
    if v_ci is null or (v_ti is not null and v_ci >= v_ti) then
      v_shipments_skipped_ahead := v_shipments_skipped_ahead + 1;
    else
      -- Flip shipment + stamp completion timestamp on delivered/received
      -- (matches lib/warehouse/shipments.ts::setShipmentStatus).
      update public.cargo_shipments
         set status          = v_shipment_target,
             received_at_cn  = case when v_shipment_target = 'received_cn'
                                       and received_at_cn is null
                                    then v_now else received_at_cn end,
             delivered_at_th = case when v_shipment_target = 'delivered'
                                       and delivered_at_th is null
                                    then v_now else delivered_at_th end
       where id = v_shipment.id;
      v_shipments_updated := v_shipments_updated + 1;

      -- Audit — admin_audit_log.target_id is text so cast UUID to text.
      insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
      values (
        p_admin_id,
        'container.cascade_shipment_status',
        'shipment',
        v_shipment.id::text,
        jsonb_build_object(
          'cargo_container_id', p_container_id,
          'container_status',   p_container_status,
          'from_status',        v_shipment.status,
          'to_status',          v_shipment_target
        )
      );
    end if;

    -- ── Hop 2: shipment → forwarder OR service_order ──
    -- Use the *target* shipment status (post-cascade) so a freshly-
    -- bumped shipment cascades immediately. The TS code does the same.

    -- Forwarder hop (only for shipment statuses that map onward)
    v_forwarder_target := case v_shipment_target
      when 'sealed_in_container' then 'shipped_china'
      when 'in_transit'          then 'in_transit'
      when 'arrived_th'          then 'arrived_thailand'
      when 'out_for_delivery'    then 'out_for_delivery'
      when 'delivered'           then 'delivered'
      else null
    end;

    if v_forwarder_target is not null and v_shipment.forwarder_f_no is not null then
      select id, status
        into v_forwarder
        from public.forwarders
       where f_no = v_shipment.forwarder_f_no
       for update;

      if found then
        v_ci := array_position(v_forwarder_order, v_forwarder.status);
        v_ti := array_position(v_forwarder_order, v_forwarder_target);
        if v_ci is null or (v_ti is not null and v_ci >= v_ti) then
          v_forwarders_skipped_ahead := v_forwarders_skipped_ahead + 1;
        else
          v_fwd_date_col := case v_forwarder_target
            when 'shipped_china'    then 'date_shipped_china'
            when 'in_transit'       then 'date_in_transit'
            when 'arrived_thailand' then 'date_arrived_thailand'
            when 'out_for_delivery' then 'date_out_for_delivery'
            when 'delivered'        then 'date_delivered'
            else null
          end;

          -- Build dynamic UPDATE so we can conditionally stamp the right
          -- date_* column. format()/EXECUTE is the cleanest way; alternative
          -- would be a 5-arm CASE on every column (uglier, same result).
          execute format(
            'update public.forwarders
                set status = $1,
                    admin_id_update = $2,
                    %I = coalesce(%I, $3)
              where id = $4',
            v_fwd_date_col, v_fwd_date_col
          )
          using v_forwarder_target, p_admin_id::text, v_now, v_forwarder.id;

          v_forwarders_updated := v_forwarders_updated + 1;

          insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
          values (
            p_admin_id,
            'shipment.cascade_forwarder_status',
            'forwarder',
            v_forwarder.id::text,
            jsonb_build_object(
              'cargo_shipment_id', v_shipment.id,
              'shipment_status',   v_shipment_target,
              'from_status',       v_forwarder.status,
              'to_status',         v_forwarder_target
            )
          );
        end if;
      end if;
    end if;

    -- Service-order hop (only on shipment 'delivered' → service_order
    -- 'completed' per the SHIPMENT_TO_SERVICE_ORDER map).
    v_service_order_target := case v_shipment_target
      when 'delivered' then 'completed'
      else null
    end;

    if v_service_order_target is not null and v_shipment.service_order_h_no is not null then
      select id, status
        into v_service_order
        from public.service_orders
       where h_no = v_shipment.service_order_h_no
       for update;

      if found then
        v_ci := array_position(v_service_order_order, v_service_order.status);
        v_ti := array_position(v_service_order_order, v_service_order_target);
        if v_ci is null or (v_ti is not null and v_ci >= v_ti) then
          v_service_orders_skipped_ahead := v_service_orders_skipped_ahead + 1;
        else
          v_so_date_col := case v_service_order_target
            when 'awaiting_payment'      then 'date_awaiting_payment'
            when 'ordered'               then 'date_ordered'
            when 'awaiting_chn_dispatch' then 'date_dispatched'
            when 'completed'             then 'date_completed'
            else null
          end;

          execute format(
            'update public.service_orders
                set status = $1,
                    admin_id_update = $2,
                    %I = coalesce(%I, $3)
              where id = $4',
            v_so_date_col, v_so_date_col
          )
          using v_service_order_target, p_admin_id::text, v_now, v_service_order.id;

          v_service_orders_updated := v_service_orders_updated + 1;

          -- U1-5: distinct audit-action for the delivered → completed
          -- auto-close hop. Keeps the existing reporting query
          -- ('service_order.auto_close_on_delivery') wired.
          if v_shipment_target = 'delivered' and v_service_order_target = 'completed' then
            v_auto_closed_orders := v_auto_closed_orders + 1;
            insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
            values (
              p_admin_id,
              'service_order.auto_close_on_delivery',
              'service_order',
              v_service_order.id::text,
              jsonb_build_object(
                'cargo_shipment_id', v_shipment.id,
                'shipment_status',   v_shipment_target,
                'from_status',       v_service_order.status,
                'to_status',         v_service_order_target
              )
            );
          else
            insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
            values (
              p_admin_id,
              'shipment.cascade_service_order_status',
              'service_order',
              v_service_order.id::text,
              jsonb_build_object(
                'cargo_shipment_id', v_shipment.id,
                'shipment_status',   v_shipment_target,
                'from_status',       v_service_order.status,
                'to_status',         v_service_order_target
              )
            );
          end if;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'shipments_total',              v_shipments_total,
    'shipments_updated',            v_shipments_updated,
    'shipments_skipped_ahead',      v_shipments_skipped_ahead,
    'forwarders_updated',           v_forwarders_updated,
    'forwarders_skipped_ahead',     v_forwarders_skipped_ahead,
    'service_orders_updated',       v_service_orders_updated,
    'service_orders_skipped_ahead', v_service_orders_skipped_ahead,
    'auto_closed_orders',           v_auto_closed_orders,
    'cascade_reason',               'ok'
  );
end;
$$;

comment on function public.cascade_container_status(uuid, text, uuid) is
  '0078 P1-5 — atomic cascade of a container status change down to its child shipments and onward to the parent forwarders / service_orders. All writes (status updates + admin_audit_log rows) happen in a single TX: any hop raising rolls back the entire cascade, so children can never be left half-updated. Mirrors the TS map constants in actions/admin/warehouse.ts (CONTAINER_TO_SHIPMENT / SHIPMENT_TO_FORWARDER / SHIPMENT_TO_SERVICE_ORDER) and preserves forward-only lifecycle (never regress a row already past the target). Returns a jsonb counter summary so callers can surface "N of M children updated" in the UI. Trigger-internal — execute revoked from client roles; only the service_role (server actions) may call.';

-- ── Locked-down grants — service_role only ──
revoke all on function public.cascade_container_status(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cascade_container_status(uuid, text, uuid)
  to service_role;
