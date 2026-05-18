/**
 * Notification types — shared between sender, queue worker, and reader.
 * See ADR-0001 (docs/decisions/0001-line-notify-replacement.md).
 */

export type NotifyCategory =
  | "order" | "payment" | "forwarder" | "yuan_payment"
  | "wallet" | "sales" | "system" | "promo"
  | "sales_digest"
  // IO-1 (0077) — platform-observability incident alerts.
  | "observability"
  // BK-1 (0079) — booking-flow submit notifications (admin + customer).
  | "booking"
  // IC-1 (0083) — internal staff chat: @mention + waiting-for set/cleared.
  | "work_chat";

export type NotifySeverity = "info" | "success" | "warning" | "error";

export type NotifyReferenceType =
  | "service_order" | "forwarder" | "yuan_payment"
  | "wallet_transaction" | "sales_commission" | "sales_payout"
  | "contact_message"
  // IO-1 (0077) — links an alert back to a platform_incidents row.
  | "platform_incident"
  // BK-1 (0079) — links a notification back to the bookings row.
  | "booking"
  // IC-1 (0083) — links a work_chat notification to the work_items row.
  | "work_item";

export type NotifyPayload = {
  category:  NotifyCategory;
  severity?: NotifySeverity;       // defaults to 'info'
  title:     string;
  body:      string;
  link_href?: string;              // deep-link inside the app
  reference_type?: NotifyReferenceType;
  reference_id?:   string;
};

/** What the reader UI uses (notifications table row + read flag). */
export type NotificationRow = {
  id:        string;
  category:  NotifyCategory;
  severity:  NotifySeverity;
  title:     string;
  body:      string;
  link_href: string | null;
  reference_type: NotifyReferenceType | null;
  reference_id:   string | null;
  delivered_line_at:  string | null;
  delivered_email_at: string | null;
  created_at: string;
  read_at:    string | null;        // joined from notification_reads
};
