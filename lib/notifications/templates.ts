/**
 * Notification template builders (P-21).
 *
 * Replaces inline NotifyPayload literals scattered across actions/* with
 * typed, single-source builders. Each template returns a NotifyPayload
 * ready to pass to sendNotification(profileId, payload).
 *
 * Why:
 *   • Title/body wording stays consistent across triggers
 *   • Severity logic (status → info/success/warning/error) lives once
 *   • i18n later: replace one place per template, every caller benefits
 *   • Reference type/id wired centrally — no easy way to drift
 *
 * Convention: each builder is `notify.<verbInDomain>(opts)`. Add a new
 * builder when (a) a wording exists in 2+ places, OR (b) the wording
 * is critical/customer-facing and worth normalising even if used once.
 */

import type { NotifyPayload } from "./types";

// ── shared helpers ──
function thb(n: number): string {
  return "฿" + Math.abs(Number(n)).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const WALLET_KIND_LABEL: Record<string, string> = {
  deposit:        "เติมเงิน",
  withdraw:       "ถอนเงิน",
  refund:         "คืนเงิน",
  adjustment:     "ปรับยอด",
  order_payment:  "ชำระฝากสั่ง",
  order_top_up:   "เติม+ชำระฝากสั่ง",
  import_payment: "ชำระฝากนำเข้า",
  import_top_up:  "เติม+ชำระฝากนำเข้า",
  yuan_payment:   "ชำระฝากโอนหยวน",
  cashback_earn:  "ได้รับ cashback",
  cashback_redeem:"ใช้ cashback",
};

const WALLET_STATUS_LABEL: Record<string, string> = {
  pending:   "รอดำเนินการ",
  completed: "สำเร็จ",
  failed:    "ไม่สำเร็จ",
  cancelled: "ยกเลิก",
};

const FORWARDER_STATUS_LABEL: Record<string, string> = {
  pending_payment:   "รอชำระเงิน",
  shipped_china:    "ออกจากจีนแล้ว",
  in_transit:        "กำลังขนส่ง",
  arrived_thailand:  "ถึงไทยแล้ว",
  out_for_delivery:  "กำลังส่งให้ลูกค้า",
  delivered:         "ส่งแล้ว",
  cancelled:         "ยกเลิก",
};

// ── customer lifecycle ──
export const notify = {
  customerApproved(opts: { memberCode: string | null }): NotifyPayload {
    return {
      category: "system",
      severity: "success",
      title:    "บัญชีของคุณได้รับการอนุมัติแล้ว",
      body:     opts.memberCode
        ? `ยินดีต้อนรับ! รหัสสมาชิก: ${opts.memberCode}`
        : "ยินดีต้อนรับเข้าใช้งาน Pacred",
      link_href: "/dashboard",
    };
  },

  customerSuspended(): NotifyPayload {
    return {
      category: "system",
      severity: "warning",
      title:    "บัญชีของคุณถูกระงับการใช้งาน",
      body:     "กรุณาติดต่อเจ้าหน้าที่หากต้องการสอบถามเพิ่มเติม",
    };
  },

  customerConvertedToJuristic(opts: { displayName: string; companyName: string }): NotifyPayload {
    return {
      category: "system",
      severity: "success",
      title:    "บัญชีของท่านถูกอัพเกรดเป็นนิติบุคคล",
      body:     `${opts.displayName} — ใบเสร็จและใบกำกับภาษีในระบบจะออกในชื่อ "${opts.companyName}" นับจากนี้`,
      link_href: "/profile",
    };
  },

  // ── sales rep transfer (3 templates — old rep / new rep / customer side) ──
  salesRepTransferOutgoing(opts: { customerLabel: string; reason: string; customerId: string }): NotifyPayload {
    return {
      category:  "sales",
      severity:  "info",
      title:     "ลูกค้าถูกย้ายออกจากทีม",
      body:      `${opts.customerLabel} ถูกย้ายไปทีมอื่น — เหตุผล: ${opts.reason}`,
      link_href: `/admin/customers/${opts.customerId}`,
    };
  },

  salesRepTransferIncoming(opts: { customerLabel: string; reason: string; customerId: string }): NotifyPayload {
    return {
      category:  "sales",
      severity:  "info",
      title:     "ลูกค้าถูกย้ายเข้าทีมท่าน",
      body:      `${opts.customerLabel} ถูกย้ายมาดูแลในทีมท่าน — เหตุผล: ${opts.reason}`,
      link_href: `/admin/customers/${opts.customerId}`,
    };
  },

  salesRepReassignedCustomerNotice(): NotifyPayload {
    return {
      category: "system",
      severity: "info",
      title:    "ทีมเซลล์ที่ดูแลถูกเปลี่ยน",
      body:     "ทีม Pacred ได้มอบหมายเซลล์ใหม่ให้ดูแลบัญชีของท่าน",
    };
  },

  // ── wallet ──
  walletTxStatusChanged(opts: {
    kind:   string;
    status: string;
    amount: number;
    note?:  string | null;
    txId:   string;
  }): NotifyPayload {
    const kindLabel   = WALLET_KIND_LABEL[opts.kind]   ?? opts.kind;
    const statusLabel = WALLET_STATUS_LABEL[opts.status] ?? opts.status;
    const severity =
      opts.status === "completed" ? "success" :
      opts.status === "failed" || opts.status === "cancelled" ? "warning" :
      "info";
    return {
      category:       "wallet",
      severity,
      title:          `${kindLabel} — ${statusLabel}`,
      body:           `จำนวน ${thb(opts.amount)}${opts.note ? `\n${opts.note}` : ""}`,
      link_href:      "/wallet/history",
      reference_type: "wallet_transaction",
      reference_id:   opts.txId,
    };
  },

  walletDepositRequested(opts: { amount: number; txId: string }): NotifyPayload {
    return {
      category:       "wallet",
      severity:       "info",
      title:          "ส่งคำขอเติมเงิน",
      body:           `จำนวน ${thb(opts.amount)} — รอเจ้าหน้าที่ตรวจสอบสลิป`,
      link_href:      "/wallet/history",
      reference_type: "wallet_transaction",
      reference_id:   opts.txId,
    };
  },

  walletWithdrawRequested(opts: { amount: number; txId: string }): NotifyPayload {
    return {
      category:       "wallet",
      severity:       "info",
      title:          "ส่งคำขอถอนเงิน",
      body:           `จำนวน ${thb(opts.amount)} — รอเจ้าหน้าที่โอนภายใน 1-2 วันทำการ`,
      link_href:      "/wallet/history",
      reference_type: "wallet_transaction",
      reference_id:   opts.txId,
    };
  },

  // ── forwarder ──
  forwarderStatusChanged(opts: { fNo: string; status: string; forwarderId: string }): NotifyPayload {
    const statusLabel = FORWARDER_STATUS_LABEL[opts.status] ?? opts.status;
    return {
      category:       "forwarder",
      severity:       opts.status === "cancelled" ? "warning" : "info",
      title:          `ฝากนำเข้า ${opts.fNo} อัพเดทแล้ว`,
      body:           `สถานะ: ${statusLabel}`,
      link_href:      `/service-import/${opts.fNo}`,
      reference_type: "forwarder",
      reference_id:   opts.forwarderId,
    };
  },

  forwarderCreated(opts: { fNo: string; forwarderId: string }): NotifyPayload {
    return {
      category:       "forwarder",
      severity:       "success",
      title:          `สร้างฝากนำเข้า ${opts.fNo} แล้ว`,
      body:           "รอเจ้าหน้าที่ตรวจสอบและอัพเดทสถานะ",
      link_href:      `/service-import/${opts.fNo}`,
      reference_type: "forwarder",
      reference_id:   opts.forwarderId,
    };
  },

  // ── service order ──
  serviceOrderStatusChanged(opts: { hNo: string; status: string; orderId: string }): NotifyPayload {
    return {
      category:       "order",
      severity:       opts.status === "cancelled" ? "warning" : "info",
      title:          `ออเดอร์ ${opts.hNo} อัพเดทแล้ว`,
      body:           `สถานะ: ${opts.status}`,
      link_href:      `/service-order/${opts.hNo}`,
      reference_type: "service_order",
      reference_id:   opts.orderId,
    };
  },

  serviceOrderPlaced(opts: { hNo: string; orderId: string; itemCount: number; totalThb: number }): NotifyPayload {
    return {
      category:       "order",
      severity:       "success",
      title:          `วางออเดอร์ ${opts.hNo} เรียบร้อย`,
      body:           `${opts.itemCount} รายการ · ยอด ${thb(opts.totalThb)} — ชำระเงินภายใน 24 ชม.`,
      link_href:      `/service-order/${opts.hNo}`,
      reference_type: "service_order",
      reference_id:   opts.orderId,
    };
  },

  // ── yuan payment ──
  yuanPaymentStatusChanged(opts: { status: string; thbAmount: number; paymentId: string }): NotifyPayload {
    const label =
      opts.status === "completed" ? "โอนหยวนสำเร็จ" :
      opts.status === "rejected"  ? "โอนหยวนไม่สำเร็จ" :
      `โอนหยวน — ${opts.status}`;
    return {
      category:       "yuan_payment",
      severity:       opts.status === "completed" ? "success" : opts.status === "rejected" ? "warning" : "info",
      title:          label,
      body:           `จำนวน ${thb(opts.thbAmount)}`,
      link_href:      "/service-payment",
      reference_type: "yuan_payment",
      reference_id:   opts.paymentId,
    };
  },

  yuanPaymentRequested(opts: { thbAmount: number; paymentId: string }): NotifyPayload {
    return {
      category:       "yuan_payment",
      severity:       "info",
      title:          "ส่งคำขอโอนหยวน",
      body:           `จำนวน ${thb(opts.thbAmount)} — รอเจ้าหน้าที่ตรวจสอบ`,
      link_href:      "/service-payment",
      reference_type: "yuan_payment",
      reference_id:   opts.paymentId,
    };
  },

  // ── sales payout / claim ──
  salesPayoutRequested(opts: { amountTotal: number; payoutId: string }): NotifyPayload {
    return {
      category:       "sales",
      severity:       "info",
      title:          "ส่งคำขอเบิกค่าคอมแล้ว",
      body:           `ยอด ${thb(opts.amountTotal)} — รอแอดมินตรวจสอบ`,
      link_href:      "/sales/history",
      reference_type: "sales_payout",
      reference_id:   opts.payoutId,
    };
  },

  // ── contact (admin-side) ──
  contactMessageReceived(opts: {
    name:        string;
    contact:     string;
    messagePreview: string;
    messageId:   string;
  }): NotifyPayload {
    const truncated = opts.messagePreview.length > 120
      ? opts.messagePreview.slice(0, 120) + "..."
      : opts.messagePreview;
    return {
      category:       "system",
      severity:       "info",
      title:          "ข้อความใหม่จากฟอร์มติดต่อ",
      body:           `${opts.name} (${opts.contact}): ${truncated}`,
      link_href:      "/admin/contact-messages",
      reference_type: "contact_message",
      reference_id:   opts.messageId,
    };
  },

  // ── sales daily digest (cron — admin recipients) ──
  salesDigest(opts: { yyyymmdd: string; message: string }): NotifyPayload {
    return {
      category: "sales_digest",
      severity: "info",
      title:    `ยอด Pacred ${opts.yyyymmdd}`,
      body:     opts.message,
    };
  },

  // ── SMS balance low alert (cron — admin recipients opted-in via
  //    notify_channels.sms_balance_alert). Closes chat audit L-3 silent
  //    SMS credit depletion. Severity 'warning' bumps urgency on LINE push. ──
  smsBalanceLow(opts: { balance: number; unit: string; threshold: number }): NotifyPayload {
    return {
      category: "system",
      severity: "warning",
      title:    "⚠️ SMS credit ใกล้หมด — เติมก่อน OTP ใช้ไม่ได้",
      body:     `ยอดคงเหลือ ${opts.balance.toLocaleString("th-TH")} ${opts.unit} (เกณฑ์เตือน: ${opts.threshold}) — เติมที่ ThaiBulkSMS Console ก่อนลูกค้าสมัครไม่ได้`,
      link_href: "/admin/dashboard",
    };
  },

  // ── Tax invoice requested by customer (admin-recipient notification).
  //    Fires when customer clicks "ขอใบกำกับภาษี" on receipt page.
  //    super + accounting admins review at /admin/tax-invoices/[id] and
  //    issue via adminIssueTaxInvoice action (ภูม T-P4 G2c). ──
  taxInvoiceRequested(opts: { taxInvoiceId: string; buyerName: string; parentLabel: string }): NotifyPayload {
    return {
      category:       "system",
      severity:       "info",
      title:          "📄 ลูกค้าขอใบกำกับภาษี",
      body:           `${opts.buyerName} ขอใบกำกับภาษีสำหรับ ${opts.parentLabel} — กรุณาตรวจสอบและออกใบ`,
      link_href:      `/admin/tax-invoices/${opts.taxInvoiceId}`,
      reference_type: "contact_message",
      reference_id:   opts.taxInvoiceId,
    };
  },

  // ── Tax invoice issued (customer-recipient).
  //    Fires when admin issues via adminIssueTaxInvoice. Customer can
  //    download from receipt page once status='issued'. ──
  taxInvoiceIssued(opts: { taxInvoiceId: string; serialNo: string; receiptPath: string }): NotifyPayload {
    return {
      category:       "order",
      severity:       "success",
      title:          `📄 ออกใบกำกับภาษี ${opts.serialNo} เรียบร้อย`,
      body:           "ดาวน์โหลดใบกำกับภาษีได้จากหน้าใบเสร็จ",
      link_href:      opts.receiptPath,
      reference_type: "contact_message",
      reference_id:   opts.taxInvoiceId,
    };
  },
};
