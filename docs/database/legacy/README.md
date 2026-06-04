# 🗄 Legacy `tb_*` Tables

The ported legacy PCS Cargo schema — **where the real ~8,898 customers, orders, money and containers live.** One file per table.

**84 tables.** Sorted by code-reference count.

## ✅ canonical / live

| Table | refs | Purpose |
|---|--:|---|
| [`tb_forwarder`](tb_forwarder.md) | 267 | ฝากนำเข้า / import orders — the ~47k-row revenue spine. |
| [`tb_users`](tb_users.md) | 218 | Customer master (PR-coded). |
| [`tb_wallet_hs`](tb_wallet_hs.md) | 137 | Wallet ledger / history — every credit/debit movement (append-only). |
| [`tb_header_order`](tb_header_order.md) | 116 | ฝากสั่งซื้อ / shop orders — order header (hno is the key). |
| [`tb_wallet`](tb_wallet.md) | 100 | Wallet balance — current balance per customer. |
| [`tb_corporate`](tb_corporate.md) | 60 | Juristic customers — company profile for juristic accounts (tb_users. |
| [`tb_payment`](tb_payment.md) | 59 | ฝากโอน / yuan transfer payments — customer pays a China supplier in CNY through Pacred (Alipay/yuan). |
| [`tb_address`](tb_address.md) | 52 | Customer shipping addresses (multiple per customer). |
| [`tb_admin`](tb_admin.md) | 49 | Staff / sales-attribution SOT (legacy). |
| [`tb_address_main`](tb_address_main.md) | 32 | Customer primary/default address (same shape as tb_address). |
| [`tb_receipt`](tb_receipt.md) | 26 | Receipts minted on payment-land. |
| [`tb_settings`](tb_settings.md) | 26 | Rate + default config. |
| [`tb_cart`](tb_cart.md) | 24 | Shopping cart rows (pre-order). |
| [`tb_cash_back`](tb_cash_back.md) | 23 | Cashback ledger (ADR-0025). |
| [`tb_forwarder_driver_item`](tb_forwarder_driver_item.md) | 22 | Driver-assignment line items (delivery). |
| [`tb_user_sales_admin_pay`](tb_user_sales_admin_pay.md) | 22 | Admin pay-out of sales commission — status 2→3 + slip (AND status=2 double-pay guard). |
| [`tb_forwarder_driver`](tb_forwarder_driver.md) | 17 | Driver delivery batches. |
| [`tb_receipt_item`](tb_receipt_item.md) | 17 | Receipt line items. |
| [`tb_forwarder_import2`](tb_forwarder_import2.md) | 16 | Forwarder secondary / import-2 records. |
| [`tb_order`](tb_order.md) | 15 | Legacy order rows. |
| [`tb_user_sales`](tb_user_sales.md) | 15 | Sales commission earn-trigger ledger (4 agent codes on forwarder delivery). |
| [`tb_wallet_paydeposit`](tb_wallet_paydeposit.md) | 14 | Partner/deposit slip join for wallet. |
| [`tb_rate_custom_cbm`](tb_rate_custom_cbm.md) | 13 | Per-customer custom rate (CBM) + history. |
| [`tb_bill_item`](tb_bill_item.md) | 12 | Bill line items. |
| [`tb_cnt`](tb_cnt.md) | 12 | Containers / ตู้ — container ledger (payment/cost per container). |
| [`tb_credit`](tb_credit.md) | 11 | Customer credit line (ADR-0023). |
| [`tb_promotion`](tb_promotion.md) | 10 | Promo carry on orders. |
| [`tb_bill`](tb_bill.md) | 9 | Billing header. |
| [`tb_user_sales_pay`](tb_user_sales_pay.md) | 9 | Commission pay history. |
| [`tb_cash_back_hs`](tb_cash_back_hs.md) | 8 | Cashback history (same shape as tb_cash_back). |
| [`tb_cnt_item`](tb_cnt_item.md) | 8 | Container ↔ forwarder-order link (by cabinet number). |
| [`tb_organization_tell`](tb_organization_tell.md) | 8 | Org contact directory — phones. |
| [`tb_tmp_forwarder_cargothai`](tb_tmp_forwarder_cargothai.md) | 8 | CargoThai staging temp (forwarder). |
| [`tb_check_forwarder`](tb_check_forwarder.md) | 7 | Bulk-bill check queue (forwarder-check). |
| [`tb_organization_domainname`](tb_organization_domainname.md) | 7 | Org contact directory — domains. |
| [`tb_organization_email`](tb_organization_email.md) | 7 | Org contact directory — emails. |
| [`tb_organization_line`](tb_organization_line.md) | 7 | Org contact directory — LINE. |
| [`tb_organization_wechat`](tb_organization_wechat.md) | 7 | Org contact directory — WeChat. |
| [`tb_sales_report`](tb_sales_report.md) | 7 | Monthly sales report rollup. |
| [`tb_shop_transactions`](tb_shop_transactions.md) | 7 | Shop transaction log. |
| [`tb_tmp_forwarder_item_cargothai`](tb_tmp_forwarder_item_cargothai.md) | 7 | CargoThai staging temp (items). |
| [`tb_forwarder_tax_invoice`](tb_forwarder_tax_invoice.md) | 6 | Forwarder tax invoice (ADR-0027 World-B SOT). |
| [`tb_cost_container`](tb_cost_container.md) | 5 | Per-container cost matrix (144-cell editor). |
| [`tb_notify`](tb_notify.md) | 5 | In-app notifications (broadcast + login-popup). |
| [`tb_notify_read`](tb_notify_read.md) | 5 | Notification read receipts. |
| [`tb_post_job`](tb_post_job.md) | 5 | HR job posts. |
| [`tb_rate_custom_kg`](tb_rate_custom_kg.md) | 5 | Per-customer custom rate (weight) + history. |
| [`tb_rate_g_cbm`](tb_rate_g_cbm.md) | 5 | General rate table (CBM) — the live rate engine. |
| [`tb_rate_g_kg`](tb_rate_g_kg.md) | 5 | General rate table (weight) — the live rate engine. |
| [`tb_rate_vip_cbm`](tb_rate_vip_cbm.md) | 5 | VIP rate (CBM). |
| [`tb_rate_vip_kg`](tb_rate_vip_kg.md) | 5 | VIP rate (weight). |
| [`tb_account_pcs`](tb_account_pcs.md) | 4 | Legacy bank/account info. |
| [`tb_customrate_hs`](tb_customrate_hs.md) | 4 | HS-code rate map. |
| [`tb_forwarder_tran_th_sub`](tb_forwarder_tran_th_sub.md) | 4 | TH-transport batch sub-lines. |
| [`tb_forwarder_wht_entry`](tb_forwarder_wht_entry.md) | 4 | Withholding-tax entries on forwarder. |
| [`tb_hs_rate_custom_cbm`](tb_hs_rate_custom_cbm.md) | 4 | Per-HS-code custom rate (CBM). |
| [`tb_hs_rate_custom_kg`](tb_hs_rate_custom_kg.md) | 4 | Per-HS-code custom rate (weight). |
| [`tb_pro_valentine`](tb_pro_valentine.md) | 4 | Seasonal Valentine promo (legacy). |
| [`tb_promotion33`](tb_promotion33.md) | 4 | Seasonal promo (legacy "33"). |
| [`tb_search_history`](tb_search_history.md) | 4 | China product-search history. |
| [`tb_shop_pay_h`](tb_shop_pay_h.md) | 4 | Shop pay-out header (admin-push disbursement). |
| [`tb_cnt_pay_idorco`](tb_cnt_pay_idorco.md) | 3 | Container-payment pivot (by order/corporate). |
| [`tb_cnt_pay_trackingchn`](tb_cnt_pay_trackingchn.md) | 3 | Container-payment pivot (by China tracking). |
| [`tb_co`](tb_co.md) | 3 | Corporate/company master. |
| [`tb_forwarder_tax_invoice_item`](tb_forwarder_tax_invoice_item.md) | 3 | Forwarder tax-invoice line items. |
| [`tb_forwarder_tran_th_h`](tb_forwarder_tran_th_h.md) | 3 | TH-transport batch header (domestic leg). |
| [`tb_set_comm_interpreter`](tb_set_comm_interpreter.md) | 3 | Interpreter commission settings. |
| [`tb_admin_address`](tb_admin_address.md) | 2 | (auto) Table referenced 2× in code — purpose not yet documented. |
| [`tb_education_background`](tb_education_background.md) | 2 | Applicant education background (HR). |
| [`tb_forwarder_item`](tb_forwarder_item.md) | 2 | Forwarder order line items. |
| [`tb_log_forwarder_status`](tb_log_forwarder_status.md) | 2 | Forwarder status-change audit log. |
| [`tb_product`](tb_product.md) | 2 | Product catalog. |
| [`tb_shop_pay_sub`](tb_shop_pay_sub.md) | 2 | Shop pay-out sub-lines. |
| [`tb_tmp_forwarder_item_momo`](tb_tmp_forwarder_item_momo.md) | 2 | MOMO staging temp (items). |
| [`tb_users_otp`](tb_users_otp.md) | 2 | OTP codes (legacy). |
| [`tb_keyword_product`](tb_keyword_product.md) | 1 | Keyword → product catalog (77k categories). |
| [`tb_notify_sheet_ctt`](tb_notify_sheet_ctt.md) | 1 | CTT sheet notify. |
| [`tb_org_tell_ships`](tb_org_tell_ships.md) | 1 | Org phone ↔ ship mapping. |
| [`tb_page_name`](tb_page_name.md) | 1 | Legacy CMS page names. |
| [`tb_shop`](tb_shop.md) | 1 | Shop master. |
| [`tb_sms_hs`](tb_sms_hs.md) | 1 | SMS send history. |
| [`tb_users_otp_hs`](tb_users_otp_hs.md) | 1 | OTP history. |
| [`tb_wallet_shop`](tb_wallet_shop.md) | 1 | Shop wallet. |
| [`tb_web_hs`](tb_web_hs.md) | 1 | Web activity history log. |

---

[← Database docs index](../README.md)
