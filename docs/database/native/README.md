# 🆕 Pacred-Native Tables

Pacred's own tables (snake_case): net-new features (freight/customs/MOMO/CRM/admin) + rebuilt twins (mostly empty). One file per table.

**115 tables.** Sorted by code-reference count.

## 🆕 Pacred-native

| Table | refs | Purpose |
|---|--:|---|
| [`profiles`](profiles.md) | 122 | Pacred-native customer/auth profile. |
| [`admins`](admins.md) | 58 | Unified-admin table (PM-6) — login + RBAC SOT (15-admin roster). |
| [`freight_shipments`](freight_shipments.md) | 29 | Active freight shipment + customs value-engineering fields (Form-E, VAT plan, duty). |
| [`freight_invoices`](freight_invoices.md) | 25 | Freight tax invoice (heavily snapshotted for legal fidelity). |
| [`freight_quotes`](freight_quotes.md) | 25 | Customer freight quote (FCL/LCL/AIR/truck). |
| [`withholding_tax_entries`](withholding_tax_entries.md) | 25 | WHT (หัก ณ ที่จ่าย) entries (1%/3%/5%). |
| [`customs_declarations`](customs_declarations.md) | 22 | Thai customs declaration (ใบขนสินค้า) for a freight shipment. |
| [`work_items`](work_items.md) | 21 | Work-board / task queue. |
| [`admin_contact_extras`](admin_contact_extras.md) | 20 | Sidecar bridging admins ↔ legacy admin codes + extra contact (legacy_admin_id bridge, Wave 22). |
| [`bookings`](bookings.md) | 20 | Booking flow (BK-1). |
| [`tax_invoices`](tax_invoices.md) | 20 | Tax invoices (RD Code 86). |
| [`otp_codes`](otp_codes.md) | 18 | Pacred-native OTP (sha256+pepper, TTL 5min). |
| [`csv_imports`](csv_imports.md) | 17 | CSV import jobs. |
| [`momo_import_tracks`](momo_import_tracks.md) | 17 | MOMO partner-sync main pull table — one row per MOMO tracking. |
| [`platform_incidents`](platform_incidents.md) | 15 | Incident tracker. |
| [`refund_requests`](refund_requests.md) | 15 | Customer refund requests. |
| [`broadcasts`](broadcasts.md) | 14 | Broadcast campaigns (LINE/SMS/in-app). |
| [`freight_invoice_lines`](freight_invoice_lines.md) | 14 | Freight invoice lines. |
| [`slips`](slips.md) | 14 | Slip storage references (signed-URL bucket). |
| [`admin_audit_log`](admin_audit_log.md) | 13 | Admin action audit trail. |
| [`notifications`](notifications.md) | 13 | Notification delivery records. |
| [`commission_withdrawals`](commission_withdrawals.md) | 12 | Commission withdrawal requests. |
| [`customs_declaration_lines`](customs_declaration_lines.md) | 11 | Per-HS-code customs declaration lines. |
| [`freight_invoice_payments`](freight_invoice_payments.md) | 11 | Payments against a freight invoice. |
| [`accounting_periods`](accounting_periods.md) | 10 | Accounting period definitions. |
| [`cart_items`](cart_items.md) | 10 | (auto) Table referenced 10× in code — purpose not yet documented. |
| [`freight_quote_items`](freight_quote_items.md) | 10 | Freight quote line items. |
| [`forwarder_cost_adjustments`](forwarder_cost_adjustments.md) | 9 | Forwarder cost adjustments. |
| [`freight_parties`](freight_parties.md) | 9 | Shipper/consignee party records. |
| [`org_contacts`](org_contacts.md) | 9 | Org contacts. |
| [`pcs_legacy_customers_staging`](pcs_legacy_customers_staging.md) | 9 | PCS migration staging. |
| [`sales_payouts`](sales_payouts.md) | 9 | Sales payout. |
| [`tos_versions`](tos_versions.md) | 9 | Terms-of-service versions. |
| [`work_item_messages`](work_item_messages.md) | 8 | Thread messages on a work item. |
| [`booking_options`](booking_options.md) | 7 | Booking options. |
| [`business_config`](business_config.md) | 7 | Key-value business config (promo banners etc. |
| [`lead_call_log`](lead_call_log.md) | 7 | Cold-lead call queue log (the callable cold-lead pool). |
| [`momo_container_closed`](momo_container_closed.md) | 7 | MOMO closed-container events. |
| [`commission_accruals`](commission_accruals.md) | 6 | Commission accrual entries. |
| [`contact_messages`](contact_messages.md) | 6 | Public /contact lead funnel submissions. |
| [`impersonation_sessions`](impersonation_sessions.md) | 6 | "View as customer" impersonation sessions. |
| [`sales_commissions`](sales_commissions.md) | 6 | Sales commission (repointed to live tb_user_sales*). |
| [`team_leaders`](team_leaders.md) | 6 | Team leaders. |
| [`commission_withdrawal_items`](commission_withdrawal_items.md) | 5 | Commission withdrawal items. |
| [`job_applicants`](job_applicants.md) | 5 | Job applicants (HR). |
| [`momo_raw_events`](momo_raw_events.md) | 5 | Raw MOMO API event payloads (audit). |
| [`momo_sack_infos`](momo_sack_infos.md) | 5 | MOMO sack (กระสอบ) info. |
| [`notification_reads`](notification_reads.md) | 5 | Notification read state. |
| [`partners`](partners.md) | 5 | External partner directory (migration 0136, PM-7) — logistics/business partners. |
| [`policies`](policies.md) | 5 | HR policies. |
| [`qa_inspections`](qa_inspections.md) | 5 | QA inspections. |
| [`tax_invoice_lines`](tax_invoice_lines.md) | 5 | Tax invoice lines. |
| [`work_item_message_mentions`](work_item_message_mentions.md) | 5 | @-mentions in work-item messages. |
| [`carriers`](carriers.md) | 4 | Carrier master (used by freight). |
| [`commission_tiers`](commission_tiers.md) | 4 | Commission tier config. |
| [`hs_codes`](hs_codes.md) | 4 | HS code master. |
| [`invoice_adjustments`](invoice_adjustments.md) | 4 | Credit-note / adjustment entries. |
| [`momo_container_closed_tracks`](momo_container_closed_tracks.md) | 4 | Tracking links for closed containers. |
| [`momo_container_details`](momo_container_details.md) | 4 | MOMO container detail snapshot. |
| [`momo_sack_tracks`](momo_sack_tracks.md) | 4 | MOMO sack ↔ tracking links. |
| [`momo_sync_logs`](momo_sync_logs.md) | 4 | MOMO sync run logs. |
| [`tas_holiday`](tas_holiday.md) | 4 | HR attendance — holidays. |
| [`tas_leave`](tas_leave.md) | 4 | HR attendance — leave. |
| [`training_courses`](training_courses.md) | 4 | Training courses (HR). |
| [`training_enrollments`](training_enrollments.md) | 4 | Training enrollments (HR). |
| [`booking_rates`](booking_rates.md) | 3 | Booking rate cards. |
| [`cron_invocations`](cron_invocations.md) | 3 | Cron run log. |
| [`employee_audit_entries`](employee_audit_entries.md) | 3 | HR employee audit. |
| [`momo_import_track_status_dates`](momo_import_track_status_dates.md) | 3 | Per-status date stamps for MOMO tracks. |
| [`momo_tracking_links`](momo_tracking_links.md) | 3 | MOMO tracking-number links. |
| [`momo_tracking_status_snapshots`](momo_tracking_status_snapshots.md) | 3 | MOMO tracking status snapshots. |
| [`period_close_event`](period_close_event.md) | 3 | Period-close audit events. |
| [`Podeng_customers_line`](Podeng_customers_line.md) | 2 | ปอน's Cloudflare-Worker capture of LINE customers (the live data /admin/line-inbox reads). |
| [`avatars`](avatars.md) | 2 | Avatar storage references. |
| [`freight_quote`](freight_quote.md) | 2 | Alternate/legacy single freight-quote reference. |
| [`line_webhook_events`](line_webhook_events.md) | 2 | LINE webhook event log (our 0131 schema, currently unused — Podeng_* is canonical). |
| [`momo_tracking_status_history`](momo_tracking_status_history.md) | 2 | MOMO tracking status history. |
| [`org_assignments`](org_assignments.md) | 2 | Org assignments (RBAC). |
| [`org_branches`](org_branches.md) | 2 | Org branches. |
| [`org_positions`](org_positions.md) | 2 | Org positions. |
| [`org_sections`](org_sections.md) | 2 | Org sections. |
| [`tos_acceptances`](tos_acceptances.md) | 2 | ToS acceptances. |
| [`v_pcs_migration_status`](v_pcs_migration_status.md) | 2 | View — PCS migration progress. |
| [`commissions`](commissions.md) | 1 | Commission records. |
| [`customer_groups`](customer_groups.md) | 1 | Customer segment groups. |
| [`freight_qa_inspections`](freight_qa_inspections.md) | 1 | QA inspection on a freight shipment. |
| [`line_messages`](line_messages.md) | 1 | LINE message store. |
| [`momo_sync_run_items`](momo_sync_run_items.md) | 1 | Per-item MOMO sync results. |
| [`policy_acknowledgments`](policy_acknowledgments.md) | 1 | Policy acknowledgments. |
| [`vw_sales_by_rep`](vw_sales_by_rep.md) | 1 | View — sales-by-rep rollup (migration 0094). |

## 💀 rebuilt twin (mostly empty — do not write here for live data)

| Table | refs | Purpose |
|---|--:|---|
| [`wallet_transactions`](wallet_transactions.md) | 45 | Rebuilt wallet ledger twin. |
| [`forwarders`](forwarders.md) | 38 | Rebuilt forwarder twin. |
| [`service_orders`](service_orders.md) | 19 | Rebuilt service-order twin. |
| [`yuan_payments`](yuan_payments.md) | 11 | Rebuilt yuan-payment twin. |
| [`container_hs_lines`](container_hs_lines.md) | 9 | Rebuilt container HS lines. |
| [`forwarder_driver`](forwarder_driver.md) | 9 | Rebuilt forwarder driver. |
| [`corporate`](corporate.md) | 8 | Rebuilt corporate twin. |
| [`customers_line`](customers_line.md) | 5 | Rebuilt LINE customer twin. |
| [`documents`](documents.md) | 5 | Rebuilt documents. |
| [`rate_custom_hs`](rate_custom_hs.md) | 5 | Rebuilt per-HS custom rate. |
| [`cargo_containers`](cargo_containers.md) | 4 | Rebuilt container model. |
| [`container_costs`](container_costs.md) | 4 | Rebuilt container costs. |
| [`rate_custom_user`](rate_custom_user.md) | 4 | Rebuilt per-user custom rate. |
| [`rate_general`](rate_general.md) | 4 | Rebuilt general rate. |
| [`rate_vip`](rate_vip.md) | 4 | Rebuilt VIP rate. |
| [`service_order_items`](service_order_items.md) | 4 | Rebuilt service-order items. |
| [`wallet`](wallet.md) | 4 | Rebuilt wallet twin. |
| [`cargo_shipments`](cargo_shipments.md) | 3 | Rebuilt shipment model. |
| [`cargo_shipment_tracking`](cargo_shipment_tracking.md) | 2 | Rebuilt shipment tracking. |
| [`forwarder_items`](forwarder_items.md) | 2 | Rebuilt forwarder items. |
| [`orders`](orders.md) | 2 | Rebuilt order twin. |
| [`settings`](settings.md) | 2 | Rebuilt settings twin. |
| [`cargo_container_status_history`](cargo_container_status_history.md) | 1 | Rebuilt container status history. |
| [`containers`](containers.md) | 1 | Rebuilt container table. |
| [`users`](users.md) | 1 | Rebuilt user twin. |

---

[← Database docs index](../README.md)
