-- ════════════════════════════════════════════════════════════
-- 0082 · PCS Cargo legacy schema — indexes + sequence resync (D1 Phase A)
-- ════════════════════════════════════════════════════════════
-- Companion to 0081. Apply AFTER the 3.78M-row data load (runbook §6.5):
--   · the 18 UNIQUE indexes of the legacy schema. The legacy MySQL schema
--     carries no non-unique secondary indexes — none are added here
--     (faithful port; Phase-B perf indexes, if needed, land at 0087+).
--   · sequence resync — every *_id_seq is set past the loaded MAX(id) so
--     post-migration INSERTs never collide with a migrated row. Each
--     statement is data-driven, so it is correct whatever the load order.
-- ════════════════════════════════════════════════════════════

-- ── UNIQUE indexes (18) ──────────────────────────────────────



--
-- Name: idx_16467_adminemail; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16467_adminemail ON public.tb_admin USING btree (adminemail);



--
-- Name: idx_16467_adminid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16467_adminid ON public.tb_admin USING btree (adminid);



--
-- Name: idx_16467_admintel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16467_admintel ON public.tb_admin USING btree (admintel);



--
-- Name: idx_16495_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16495_fid ON public.tb_bill_item USING btree (fid);



--
-- Name: idx_16559_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16559_userid ON public.tb_corporate USING btree (userid);



--
-- Name: idx_16567_fcabinetnumber; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16567_fcabinetnumber ON public.tb_cost_container USING btree (fcabinetnumber);



--
-- Name: idx_16639_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16639_fid ON public.tb_forwarder_import2 USING btree (fid);



--
-- Name: idx_16673_hno; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16673_hno ON public.tb_header_order USING btree (hno);



--
-- Name: idx_16745_optionname; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16745_optionname ON public.tb_options USING btree (option_key);



--
-- Name: idx_16906_rid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16906_rid ON public.tb_receipt USING btree (rid);



--
-- Name: idx_16914_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16914_fid ON public.tb_receipt_item USING btree (fid);



--
-- Name: idx_16928_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16928_fid ON public.tb_sales_report USING btree (fid);



--
-- Name: idx_16978_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16978_userid ON public.tb_survey USING btree (userid);



--
-- Name: idx_16985_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16985_userid ON public.tb_survey202306 USING btree (userid);



--
-- Name: idx_16997_sm_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16997_sm_code ON public.tb_tmp_forwarder_cargothai USING btree (sm_code);



--
-- Name: idx_17018_sm_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_17018_sm_code ON public.tb_tmp_forwarder_momo USING btree (sm_code);



--
-- Name: idx_17047_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_17047_userid ON public.tb_users USING btree (userid);



--
-- Name: idx_17047_usertel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_17047_usertel ON public.tb_users USING btree (usertel);

-- ── Sequence resync — set every *_id_seq past MAX(id) ───────
-- Data-driven: GREATEST(MAX(id),1) as value, EXISTS(rows) as is_called
-- → next value = MAX(id)+1 for loaded tables, 1 for empty tables.

SELECT setval('public.reserve_meeting_room_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.reserve_meeting_room),0),1), EXISTS(SELECT 1 FROM public.reserve_meeting_room));
SELECT setval('public.tas_historydata_mobile_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_historydata_mobile),0),1), EXISTS(SELECT 1 FROM public.tas_historydata_mobile));
SELECT setval('public.tas_historydataold_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_historydataold),0),1), EXISTS(SELECT 1 FROM public.tas_historydataold));
SELECT setval('public.tas_historydataold_tmp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_historydataold_tmp),0),1), EXISTS(SELECT 1 FROM public.tas_historydataold_tmp));
SELECT setval('public.tas_holiday_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_holiday),0),1), EXISTS(SELECT 1 FROM public.tas_holiday));
SELECT setval('public.tas_holiday_maid_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_holiday_maid),0),1), EXISTS(SELECT 1 FROM public.tas_holiday_maid));
SELECT setval('public.tas_leave_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_leave),0),1), EXISTS(SELECT 1 FROM public.tas_leave));
SELECT setval('public.tb_account_pcs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_account_pcs),0),1), EXISTS(SELECT 1 FROM public.tb_account_pcs));
SELECT setval('public.tb_address_addressid_seq', GREATEST(COALESCE((SELECT MAX(addressid) FROM public.tb_address),0),1), EXISTS(SELECT 1 FROM public.tb_address));
SELECT setval('public.tb_address_main_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_address_main),0),1), EXISTS(SELECT 1 FROM public.tb_address_main));
SELECT setval('public.tb_address_maomao_free_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_address_maomao_free),0),1), EXISTS(SELECT 1 FROM public.tb_address_maomao_free));
SELECT setval('public.tb_admin_address_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_admin_address),0),1), EXISTS(SELECT 1 FROM public.tb_admin_address));
SELECT setval('public.tb_admin_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_admin),0),1), EXISTS(SELECT 1 FROM public.tb_admin));
SELECT setval('public.tb_api_china_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_api_china_hs),0),1), EXISTS(SELECT 1 FROM public.tb_api_china_hs));
SELECT setval('public.tb_bill_billid_seq', GREATEST(COALESCE((SELECT MAX(billid) FROM public.tb_bill),0),1), EXISTS(SELECT 1 FROM public.tb_bill));
SELECT setval('public.tb_bill_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_bill_item),0),1), EXISTS(SELECT 1 FROM public.tb_bill_item));
SELECT setval('public.tb_cart_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cart),0),1), EXISTS(SELECT 1 FROM public.tb_cart));
SELECT setval('public.tb_cash_back_hs_cbhid_seq', GREATEST(COALESCE((SELECT MAX(cbhid) FROM public.tb_cash_back_hs),0),1), EXISTS(SELECT 1 FROM public.tb_cash_back_hs));
SELECT setval('public.tb_check_forwarder_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_check_forwarder),0),1), EXISTS(SELECT 1 FROM public.tb_check_forwarder));
SELECT setval('public.tb_cnt_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt),0),1), EXISTS(SELECT 1 FROM public.tb_cnt));
SELECT setval('public.tb_cnt_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt_item),0),1), EXISTS(SELECT 1 FROM public.tb_cnt_item));
SELECT setval('public.tb_cnt_pay_idorco_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt_pay_idorco),0),1), EXISTS(SELECT 1 FROM public.tb_cnt_pay_idorco));
SELECT setval('public.tb_cnt_pay_trackingchn_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt_pay_trackingchn),0),1), EXISTS(SELECT 1 FROM public.tb_cnt_pay_trackingchn));
SELECT setval('public.tb_co_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_co),0),1), EXISTS(SELECT 1 FROM public.tb_co));
SELECT setval('public.tb_contact_outsider_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_contact_outsider),0),1), EXISTS(SELECT 1 FROM public.tb_contact_outsider));
SELECT setval('public.tb_corporate_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_corporate),0),1), EXISTS(SELECT 1 FROM public.tb_corporate));
SELECT setval('public.tb_cost_container_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cost_container),0),1), EXISTS(SELECT 1 FROM public.tb_cost_container));
SELECT setval('public.tb_customrate_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_customrate_hs),0),1), EXISTS(SELECT 1 FROM public.tb_customrate_hs));
SELECT setval('public.tb_education_background_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_education_background),0),1), EXISTS(SELECT 1 FROM public.tb_education_background));
SELECT setval('public.tb_farwarder_quotation_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_farwarder_quotation),0),1), EXISTS(SELECT 1 FROM public.tb_farwarder_quotation));
SELECT setval('public.tb_farwarder_quotation_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_farwarder_quotation_item),0),1), EXISTS(SELECT 1 FROM public.tb_farwarder_quotation_item));
SELECT setval('public.tb_forwarder_driver_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_driver),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_driver));
SELECT setval('public.tb_forwarder_driver_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_driver_item),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_driver_item));
SELECT setval('public.tb_forwarder_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder));
SELECT setval('public.tb_forwarder_img_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_img),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_img));
SELECT setval('public.tb_forwarder_import2_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_import2),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_import2));
SELECT setval('public.tb_forwarder_import_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_import),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_import));
SELECT setval('public.tb_forwarder_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_item),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_item));
SELECT setval('public.tb_forwarder_jmf_tmp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_jmf_tmp),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_jmf_tmp));
SELECT setval('public.tb_forwarder_prepare_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_prepare),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_prepare));
SELECT setval('public.tb_forwarder_tran_th_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_tran_th_h),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_tran_th_h));
SELECT setval('public.tb_forwarder_tran_th_sub_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_tran_th_sub),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_tran_th_sub));
SELECT setval('public.tb_header_order_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_header_order),0),1), EXISTS(SELECT 1 FROM public.tb_header_order));
SELECT setval('public.tb_history_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_history),0),1), EXISTS(SELECT 1 FROM public.tb_history));
SELECT setval('public.tb_history_key_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_history_key),0),1), EXISTS(SELECT 1 FROM public.tb_history_key));
SELECT setval('public.tb_hs_rate_custom_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_hs_rate_custom_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_hs_rate_custom_cbm));
SELECT setval('public.tb_hs_rate_custom_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_hs_rate_custom_kg),0),1), EXISTS(SELECT 1 FROM public.tb_hs_rate_custom_kg));
SELECT setval('public.tb_keyword_product_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_keyword_product),0),1), EXISTS(SELECT 1 FROM public.tb_keyword_product));
SELECT setval('public.tb_log_forwarder_status_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_log_forwarder_status),0),1), EXISTS(SELECT 1 FROM public.tb_log_forwarder_status));
SELECT setval('public.tb_notify_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify),0),1), EXISTS(SELECT 1 FROM public.tb_notify));
SELECT setval('public.tb_notify_read_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify_read),0),1), EXISTS(SELECT 1 FROM public.tb_notify_read));
SELECT setval('public.tb_notify_sheet_ctt_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify_sheet_ctt),0),1), EXISTS(SELECT 1 FROM public.tb_notify_sheet_ctt));
SELECT setval('public.tb_notify_wp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify_wp),0),1), EXISTS(SELECT 1 FROM public.tb_notify_wp));
SELECT setval('public.tb_options_option_id_seq', GREATEST(COALESCE((SELECT MAX(option_id) FROM public.tb_options),0),1), EXISTS(SELECT 1 FROM public.tb_options));
SELECT setval('public.tb_order_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_order),0),1), EXISTS(SELECT 1 FROM public.tb_order));
SELECT setval('public.tb_org_email_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_email_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_email_ships));
SELECT setval('public.tb_org_line_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_line_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_line_ships));
SELECT setval('public.tb_org_tell_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_tell_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_tell_ships));
SELECT setval('public.tb_org_wechat_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_wechat_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_wechat_ships));
SELECT setval('public.tb_organization_domainname_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_domainname),0),1), EXISTS(SELECT 1 FROM public.tb_organization_domainname));
SELECT setval('public.tb_organization_email_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_email),0),1), EXISTS(SELECT 1 FROM public.tb_organization_email));
SELECT setval('public.tb_organization_line_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_line),0),1), EXISTS(SELECT 1 FROM public.tb_organization_line));
SELECT setval('public.tb_organization_tell_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_tell),0),1), EXISTS(SELECT 1 FROM public.tb_organization_tell));
SELECT setval('public.tb_organization_wechat_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_wechat),0),1), EXISTS(SELECT 1 FROM public.tb_organization_wechat));
SELECT setval('public.tb_otp_check_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_otp_check),0),1), EXISTS(SELECT 1 FROM public.tb_otp_check));
SELECT setval('public.tb_page_name_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_page_name),0),1), EXISTS(SELECT 1 FROM public.tb_page_name));
SELECT setval('public.tb_payment_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_payment),0),1), EXISTS(SELECT 1 FROM public.tb_payment));
SELECT setval('public.tb_pcs_logged_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_pcs_logged),0),1), EXISTS(SELECT 1 FROM public.tb_pcs_logged));
SELECT setval('public.tb_post_job_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_post_job),0),1), EXISTS(SELECT 1 FROM public.tb_post_job));
SELECT setval('public.tb_product_category_pcid_seq', GREATEST(COALESCE((SELECT MAX(pcid) FROM public.tb_product_category),0),1), EXISTS(SELECT 1 FROM public.tb_product_category));
SELECT setval('public.tb_product_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_product),0),1), EXISTS(SELECT 1 FROM public.tb_product));
SELECT setval('public.tb_promotion_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_promotion),0),1), EXISTS(SELECT 1 FROM public.tb_promotion));
SELECT setval('public.tb_rate_custom_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_custom_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_rate_custom_cbm));
SELECT setval('public.tb_rate_custom_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_custom_kg),0),1), EXISTS(SELECT 1 FROM public.tb_rate_custom_kg));
SELECT setval('public.tb_rate_g_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_g_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_rate_g_cbm));
SELECT setval('public.tb_rate_g_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_g_kg),0),1), EXISTS(SELECT 1 FROM public.tb_rate_g_kg));
SELECT setval('public.tb_rate_vip_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_vip_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_rate_vip_cbm));
SELECT setval('public.tb_rate_vip_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_vip_kg),0),1), EXISTS(SELECT 1 FROM public.tb_rate_vip_kg));
SELECT setval('public.tb_receipt_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_receipt),0),1), EXISTS(SELECT 1 FROM public.tb_receipt));
SELECT setval('public.tb_receipt_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_receipt_item),0),1), EXISTS(SELECT 1 FROM public.tb_receipt_item));
SELECT setval('public.tb_register_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_register),0),1), EXISTS(SELECT 1 FROM public.tb_register));
SELECT setval('public.tb_sales_report_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sales_report),0),1), EXISTS(SELECT 1 FROM public.tb_sales_report));
SELECT setval('public.tb_set_comm_interpreter_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_set_comm_interpreter),0),1), EXISTS(SELECT 1 FROM public.tb_set_comm_interpreter));
SELECT setval('public.tb_settings_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_settings),0),1), EXISTS(SELECT 1 FROM public.tb_settings));
SELECT setval('public.tb_shop_pay_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_shop_pay_h),0),1), EXISTS(SELECT 1 FROM public.tb_shop_pay_h));
SELECT setval('public.tb_shop_pay_sub_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_shop_pay_sub),0),1), EXISTS(SELECT 1 FROM public.tb_shop_pay_sub));
SELECT setval('public.tb_sms_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sms_hs),0),1), EXISTS(SELECT 1 FROM public.tb_sms_hs));
SELECT setval('public.tb_sms_statistic9_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sms_statistic9),0),1), EXISTS(SELECT 1 FROM public.tb_sms_statistic9));
SELECT setval('public.tb_sms_statistic_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sms_statistic),0),1), EXISTS(SELECT 1 FROM public.tb_sms_statistic));
SELECT setval('public.tb_survey202306_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_survey202306),0),1), EXISTS(SELECT 1 FROM public.tb_survey202306));
SELECT setval('public.tb_survey_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_survey),0),1), EXISTS(SELECT 1 FROM public.tb_survey));
SELECT setval('public.tb_terms_service_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_terms_service),0),1), EXISTS(SELECT 1 FROM public.tb_terms_service));
SELECT setval('public.tb_tmp_forwarder_cargothai_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_cargothai),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_cargothai));
SELECT setval('public.tb_tmp_forwarder_item_cargothai_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_item_cargothai),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_item_cargothai));
SELECT setval('public.tb_tmp_forwarder_item_momo_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_item_momo),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_item_momo));
SELECT setval('public.tb_tmp_forwarder_momo_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_momo),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_momo));
SELECT setval('public.tb_tmp_profile_admin_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_profile_admin),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_profile_admin));
SELECT setval('public.tb_user_sales_admin_pay_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_user_sales_admin_pay),0),1), EXISTS(SELECT 1 FROM public.tb_user_sales_admin_pay));
SELECT setval('public.tb_user_sales_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_user_sales),0),1), EXISTS(SELECT 1 FROM public.tb_user_sales));
SELECT setval('public.tb_user_sales_pay_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_user_sales_pay),0),1), EXISTS(SELECT 1 FROM public.tb_user_sales_pay));
SELECT setval('public.tb_users_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_users),0),1), EXISTS(SELECT 1 FROM public.tb_users));
SELECT setval('public.tb_users_otp_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_users_otp_hs),0),1), EXISTS(SELECT 1 FROM public.tb_users_otp_hs));
SELECT setval('public.tb_users_otp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_users_otp),0),1), EXISTS(SELECT 1 FROM public.tb_users_otp));
SELECT setval('public.tb_wallet_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_wallet_hs),0),1), EXISTS(SELECT 1 FROM public.tb_wallet_hs));
SELECT setval('public.tb_wallet_paydeposit_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_wallet_paydeposit),0),1), EXISTS(SELECT 1 FROM public.tb_wallet_paydeposit));
SELECT setval('public.tb_web_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_web_hs),0),1), EXISTS(SELECT 1 FROM public.tb_web_hs));
SELECT setval('public.tb_withdraw_comm_interpreter_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_interpreter_h),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_interpreter_h));
SELECT setval('public.tb_withdraw_comm_interpreter_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_interpreter_item),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_interpreter_item));
SELECT setval('public.tb_withdraw_comm_sale_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_sale_h),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_sale_h));
SELECT setval('public.tb_withdraw_comm_sale_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_sale_item),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_sale_item));
SELECT setval('public.tb_youtude_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_youtude),0),1), EXISTS(SELECT 1 FROM public.tb_youtude));
