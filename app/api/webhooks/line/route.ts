/**
 * POST /api/webhooks/line — LINE OA inbound ingest (ปอน · InwPond007).
 *
 * รับ event จาก LINE Messaging API webhook → verify signature → เก็บลง
 * 4 table ใหม่ของระบบ LINE (migration 0125):
 *   • line_webhook_events  — raw payload ทุก event (debug/replay)
 *   • customers_line        — 1 row ต่อ 1 line_user_id + สถิติรวม
 *   • line_messages         — ทุกข้อความ (รอบนี้ inbound เท่านั้น)
 *   • line_lead_sources     — map add-friend URL → ช่องทาง (อ่านอย่างเดียว)
 *
 * รอบนี้ทำแค่ "เก็บข้อมูลขาเข้า" — ยังไม่มี Inbox UI / ปุ่มตอบกลับ /
 * FB-IG / AI auto-reply.
 *
 * SECURITY — LINE เซ็นทุก request ด้วย `x-line-signature`
 * (HMAC-SHA256 ของ raw body · key = Channel secret · base64). Route นี้
 * VERIFY signature ก่อนทำอะไรเสมอ → ปิดช่อง "open webhook" โดยสมบูรณ์.
 * Channel secret อ่านจาก env `LINE_CHANNEL_SECRET` (ห้าม hardcode).
 *
 * Inert until LINE_CHANNEL_SECRET is set — คืน 503 ให้ LINE retry
 * เมื่อ secret ลงแล้ว (แทนที่จะ 200-ack ลงถังขยะ).
 *
 * @see supabase/migrations/0125_line_oa_inbox.sql — schema
 * @see docs/runbook/line-webhook-setup.md          — setup + check queries
 */

import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Node runtime — ต้องใช้ crypto HMAC + raw request body.
export const runtime = "nodejs";
// Webhook ต้องประมวลผลทุก request ตอน runtime (ห้าม cache/prerender).
export const dynamic = "force-dynamic";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// ── LINE webhook payload shapes (อ่านแบบ defensive — partner schema) ──
type LineSource = {
  type?: string; // 'user' | 'group' | 'room'
  userId?: string;
  groupId?: string;
  roomId?: string;
};
type LineMessage = {
  id?: string;
  type?: string; // 'text' | 'image' | 'sticker' | 'file' | 'video' | …
  text?: string;
};
type LineEvent = {
  type?: string; // 'message' | 'follow' | 'unfollow' | …
  webhookEventId?: string;
  replyToken?: string;
  timestamp?: number; // epoch ms
  source?: LineSource;
  message?: LineMessage;
  deliveryContext?: { isRedelivery?: boolean };
};
type LineWebhookBody = { destination?: string; events?: LineEvent[] };

/** Verify LINE's HMAC-SHA256 (base64) signature against the raw body. */
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  // timingSafeEqual ต้องยาวเท่ากันก่อน — ไม่งั้น throw.
  if (sigBuf.length !== expBuf.length) return false;
  try {
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/** epoch-ms (LINE event.timestamp) → ISO string สำหรับ timestamptz. */
function isoFromEpoch(ms: number | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Best-effort LINE Profile fetch — populate display_name/picture_url.
 * Optional: ทำงานเฉพาะเมื่อมี LINE_CHANNEL_ACCESS_TOKEN. ไม่บล็อก flow —
 * fail เงียบ คืน null (rate-limit / network / token หมดอายุ ก็ไม่พัง).
 */
async function fetchLineProfile(
  userId: string,
): Promise<{ displayName?: string; pictureUrl?: string; statusMessage?: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { displayName?: string; pictureUrl?: string; statusMessage?: string };
  } catch {
    return null;
  }
}

type CustomerRow = {
  id: string;
  first_seen_at: string | null;
  first_follow_at: string | null;
  first_message_at: string | null;
  total_messages: number;
  total_inbound_messages: number;
  display_name: string | null;
};

const CUSTOMER_COLS =
  "id, first_seen_at, first_follow_at, first_message_at, total_messages, total_inbound_messages, display_name";

/**
 * Get-or-create the customers_line row for a line_user_id.
 * select → ไม่เจอค่อย insert → ถ้าชน 23505 (race) select ซ้ำ.
 * ดึงโปรไฟล์ best-effort ตอนสร้างใหม่เท่านั้น.
 */
async function getOrCreateCustomer(
  admin: SupabaseAdmin,
  userId: string,
  nowIso: string,
): Promise<CustomerRow | null> {
  const existing = await admin
    .from("customers_line")
    .select(CUSTOMER_COLS)
    .eq("line_user_id", userId)
    .maybeSingle();

  if (existing.error) {
    logger.error("line-webhook", "customer select failed", existing.error);
    return null;
  }
  if (existing.data) return existing.data as CustomerRow;

  const profile = await fetchLineProfile(userId);
  const insert = await admin
    .from("customers_line")
    .insert({
      line_user_id:  userId,
      first_seen_at: nowIso,
      display_name:  profile?.displayName ?? null,
      picture_url:   profile?.pictureUrl ?? null,
      raw_profile:   profile ?? null,
    })
    .select(CUSTOMER_COLS)
    .single();

  if (!insert.error && insert.data) return insert.data as CustomerRow;

  // race: อีก event แทรกระหว่างทาง → select ซ้ำ
  if (insert.error?.code === "23505") {
    const retry = await admin
      .from("customers_line")
      .select(CUSTOMER_COLS)
      .eq("line_user_id", userId)
      .maybeSingle();
    if (!retry.error && retry.data) return retry.data as CustomerRow;
  }

  logger.error("line-webhook", "customer insert failed", insert.error);
  return null;
}

/** follow event → บันทึกวันเพิ่มเพื่อนครั้งแรก. */
async function handleFollow(
  admin: SupabaseAdmin,
  customer: CustomerRow,
  nowIso: string,
): Promise<void> {
  await admin
    .from("customers_line")
    .update({
      first_follow_at:   customer.first_follow_at ?? nowIso,
      first_seen_at:     customer.first_seen_at ?? nowIso,
      status:            "active",
      last_message_text: "เพิ่มเพื่อน LINE OA",
    })
    .eq("id", customer.id);
}

/** message event → insert line_messages + อัปเดตสถิติ customers_line. */
async function handleMessage(
  admin: SupabaseAdmin,
  customer: CustomerRow,
  event: LineEvent,
  nowIso: string,
): Promise<void> {
  const msg = event.message ?? {};
  const sentAt = isoFromEpoch(event.timestamp);
  const messageText = msg.type === "text" ? (msg.text ?? null) : null;

  const inserted = await admin
    .from("line_messages")
    .insert({
      customer_line_id:   customer.id,
      line_user_id:       event.source?.userId ?? "",
      line_message_id:    msg.id ?? null,
      webhook_event_id:   event.webhookEventId ?? null,
      reply_token:        event.replyToken ?? null,
      direction:          "inbound",
      sender_type:        "customer",
      source_type:        event.source?.type ?? null,
      group_id:           event.source?.groupId ?? null,
      room_id:            event.source?.roomId ?? null,
      message_type:       msg.type ?? null,
      message_text:       messageText,
      send_status:        "received",
      is_from_redelivery: event.deliveryContext?.isRedelivery ?? false,
      sent_at:            sentAt,
      raw_json:           event,
    })
    .select("id")
    .single();

  // dup (LINE redelivery ของ message id เดิม) → ไม่นับสถิติซ้ำ
  if (inserted.error?.code === "23505") return;
  if (inserted.error) {
    logger.error("line-webhook", "message insert failed", inserted.error);
    throw inserted.error;
  }

  // นับสถิติ (read-modify-write — event ของคน ๆ เดียวมาเรียงกันอยู่แล้ว)
  await admin
    .from("customers_line")
    .update({
      first_message_at:        customer.first_message_at ?? nowIso,
      first_seen_at:           customer.first_seen_at ?? nowIso,
      last_message_at:         nowIso,
      last_inbound_message_at: nowIso,
      last_message_text:       messageText ?? `[${msg.type ?? "unknown"}]`,
      total_messages:          (customer.total_messages ?? 0) + 1,
      total_inbound_messages:  (customer.total_inbound_messages ?? 0) + 1,
    })
    .eq("id", customer.id);
}

/** Process one LINE event: store raw → resolve customer → dispatch. */
async function processEvent(admin: SupabaseAdmin, event: LineEvent): Promise<void> {
  const nowIso = new Date().toISOString();
  const userId = event.source?.userId ?? null;

  // 1. เก็บ raw event ก่อนเสมอ (debug/replay) — ได้ id กลับมา
  const stored = await admin
    .from("line_webhook_events")
    .insert({
      webhook_event_id: event.webhookEventId ?? null,
      line_user_id:     userId,
      event_type:       event.type ?? null,
      raw_payload:      event,
      processed_status: "received",
    })
    .select("id")
    .single();

  if (stored.error || !stored.data) {
    logger.error("line-webhook", "raw event insert failed", stored.error);
    return; // เก็บ raw ไม่ได้ → ข้าม (กันเขียนสถิติโดยไม่มี audit trail)
  }
  const eventRowId = stored.data.id as string;

  const markEvent = (status: string, errorMessage?: string) =>
    admin
      .from("line_webhook_events")
      .update({ processed_status: status, error_message: errorMessage ?? null, processed_at: new Date().toISOString() })
      .eq("id", eventRowId);

  try {
    // 2. ไม่มี userId (เช่น event ระดับ group บางชนิด) → ข้าม
    if (!userId) {
      await markEvent("skipped_no_user");
      return;
    }

    // 3. resolve customer
    const customer = await getOrCreateCustomer(admin, userId, nowIso);
    if (!customer) {
      await markEvent("error", "could not resolve customer");
      return;
    }

    // 4. dispatch ตามชนิด event
    if (event.type === "follow") {
      await handleFollow(admin, customer, nowIso);
    } else if (event.type === "message") {
      await handleMessage(admin, customer, event, nowIso);
    }
    // event อื่น (unfollow / join / postback …) — เก็บ raw ไว้เฉย ๆ รอบนี้

    await markEvent("processed");
  } catch (err) {
    logger.error("line-webhook", "event processing failed", err, { eventType: event.type });
    await markEvent("error", err instanceof Error ? err.message : String(err));
    // ไม่ throw ออก — event ถัดไปใน batch ต้องประมวลผลต่อ
  }
}

export async function POST(request: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;

  // Inert จนกว่าจะตั้ง secret — 503 ให้ LINE retry เมื่อ secret ลงแล้ว
  if (!secret) {
    logger.warn("line-webhook", "hit but LINE_CHANNEL_SECRET unset");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  // raw body — signature คำนวณจาก byte ที่ส่งมาเป๊ะ ๆ
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    logger.warn("line-webhook", "signature verification failed");
    return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  // LINE กดปุ่ม "Verify" ใน console = ส่ง events ว่าง → 200 ตามปกติ
  if (events.length === 0) {
    return Response.json({ ok: true, processed: 0 });
  }

  const admin = createAdminClient();
  // ประมวลผลทีละ event (event ของลูกค้าคนเดียวมาเรียงกัน — กัน race ของ counter)
  for (const event of events) {
    await processEvent(admin, event);
  }

  // ตอบ 200 เสมอเมื่อ signature ผ่าน — error ราย event ถูกบันทึกใน
  // line_webhook_events.error_message แล้ว (ไม่อยากให้ LINE retry ทั้ง batch)
  return Response.json({ ok: true, processed: events.length });
}
