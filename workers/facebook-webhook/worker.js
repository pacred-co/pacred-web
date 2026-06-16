/**
 * Cloudflare Worker — Facebook (Meta) Messenger webhook → Supabase
 * เก็บข้อมูล "ขาเข้า" (inbound) ลงตาราง Podeng_fb_* / Podeng_meta_ads
 *
 * ENV (ตั้งผ่าน `wrangler secret put <NAME>` เท่านั้น — ห้ามใส่ wrangler.toml/commit):
 *   META_VERIFY_TOKEN          — token ที่ตั้งเองตอน setup webhook ใน Meta
 *   META_APP_SECRET            — App Secret (verify ลายเซ็น x-hub-signature-256)
 *   SUPABASE_URL               — https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (bypass RLS · server-only)
 *
 * แก้จากเวอร์ชันเดิม:
 *   🔴 บังคับ verify ลายเซ็นเสมอ (fail-closed): ไม่มี secret = 503 · ลายเซ็นผิด = 403
 *   🟠 ห่อ try/catch ราย event — event เดียวพังไม่ทำให้ทั้ง batch ตาย
 *   🟠 raw-event store + ad upsert + touchpoint มี try/catch แยก — core (customer+message) ไม่ล้ม
 *   🟢 ข้าม message_echoes (ข้อความที่เพจส่งออก) — รอบนี้เก็บ inbound อย่างเดียว
 *   🟢 GET handshake ต้องมี META_VERIFY_TOKEN จริง ๆ ถึงจะผ่าน
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const allowedPaths = ["/", "/api/webhooks/facebook"];
    if (!allowedPaths.includes(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    // ── Meta Webhook Verification (GET) ──
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      // ต้องมี META_VERIFY_TOKEN จริง + ตรงกัน ถึงจะ echo challenge
      if (mode === "subscribe" && env.META_VERIFY_TOKEN && token === env.META_VERIFY_TOKEN) {
        return new Response(challenge || "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    // ── Webhook events (POST) ──
    if (request.method === "POST") {
      // 🔴 fail-closed: ไม่มี secret = ไม่รับ (กัน open webhook)
      if (!env.META_APP_SECRET) {
        return new Response("Not configured", { status: 503 });
      }

      const rawBody = await request.text();
      const signature = request.headers.get("x-hub-signature-256");

      // 🔴 verify ลายเซ็นเสมอ
      if (!(await verifyMetaSignature(rawBody, signature, env.META_APP_SECRET))) {
        return new Response("Invalid signature", { status: 403 });
      }

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      // ตอบ Meta เร็ว แล้วค่อยเขียน DB ใน background
      ctx.waitUntil(processMetaPayload(payload, env));
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};

async function processMetaPayload(payload, env) {
  const objectType = payload.object || "unknown";
  const entries = payload.entry || [];

  for (const entry of entries) {
    const pageId = entry.id || null;
    const messagingEvents = entry.messaging || [];

    for (const event of messagingEvents) {
      // 🟠 event เดียวพัง → log แล้วไปต่อ (ไม่ให้ทั้ง batch ตาย)
      try {
        await processMessagingEvent({ objectType, pageId, event, env });
      } catch (err) {
        console.log("processMessagingEvent failed:", err?.message || err);
      }
    }
  }
}

async function processMessagingEvent({ objectType, pageId, event, env }) {
  // 🟢 echo = ข้อความที่ "เพจ" ส่งออก (sender.id = page id ไม่ใช่ลูกค้า)
  // รอบนี้เก็บ inbound อย่างเดียว → เก็บ raw ไว้เฉย ๆ แล้วจบ ไม่สร้าง customer
  if (event.message?.is_echo) {
    await safeStoreRawEvent(env, {
      objectType,
      pageId: event.recipient?.id || pageId || null,
      eventType: "echo",
      fbPsid: null,
      messageMid: event.message?.mid || null,
      event,
    });
    return;
  }

  const fbPsid = event.sender?.id || null;
  const recipientPageId = event.recipient?.id || pageId || null;
  const sentAt = toIsoTime(event.timestamp);
  const eventType = detectEventType(event);

  const referral =
    event.referral || event.message?.referral || event.postback?.referral || null;

  const adId = extractAdId(referral);
  const referralRef = referral?.ref || null;
  const referralSource = referral?.source || null;
  const referralType = referral?.type || null;

  const messageMid = event.message?.mid || null;
  const messageText = event.message?.text || null;
  const attachments = event.message?.attachments || null;
  const quickReplyPayload = event.message?.quick_reply?.payload || null;
  const postbackPayload = event.postback?.payload || null;

  // 1) เก็บ raw event ทุกครั้ง (มี try/catch ในตัว — ล้มก็ไปต่อได้)
  await safeStoreRawEvent(env, {
    objectType,
    pageId: recipientPageId,
    eventType,
    fbPsid,
    messageMid,
    event,
  });

  if (!fbPsid) return;

  // 2) ad master upsert (aux — ห่อ try/catch ไม่ให้บล็อก customer/message)
  if (adId) {
    try {
      await supabaseRequest(env, "Podeng_meta_ads", {
        method: "POST",
        query: "?on_conflict=ad_id",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: cleanObject({
          ad_id: adId,
          raw_ad: { source: "webhook_referral", referral },
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.log("upsert meta_ads failed:", err?.message || err);
    }
  }

  // 3) สร้าง customer ถ้ายังไม่มี (ignore-duplicates = ไม่ทับ first_* ของเดิม)
  await supabaseRequest(env, "Podeng_fb_customers", {
    method: "POST",
    query: "?on_conflict=fb_psid",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: cleanObject({
      fb_psid: fbPsid,
      page_id: recipientPageId,
      lead_source_key: adId ? "facebook_ads" : referralRef ? "facebook_m_me" : "facebook_unknown",
      referral_ref: referralRef,
      first_message_at: eventType === "message" ? sentAt : null,
      last_message_at: eventType === "message" ? sentAt : null,
      total_messages: 0,
      first_ad_id: adId,
      first_referral_ref: referralRef,
      first_referral_at: referral ? sentAt : null,
      last_ad_id: adId,
      last_referral_ref: referralRef,
      last_referral_at: referral ? sentAt : null,
      raw_profile: null,
    }),
  }).catch((err) => console.log("insert customer failed:", err?.message || err));

  // 4) ดึง customer id + สถิติ กลับมา
  const customers = await supabaseRequest(env, "Podeng_fb_customers", {
    method: "GET",
    query: `?fb_psid=eq.${encodeURIComponent(fbPsid)}&select=id,total_messages,first_message_at,first_ad_id,first_referral_ref,lead_source_key`,
  }).catch(() => null);

  const customer = Array.isArray(customers) ? customers[0] : null;
  const customerId = customer?.id || null;

  // 5) อัปเดต customer ล่าสุด
  // หมายเหตุ: total_messages เป็น read-modify-write — ถ้า Meta ส่ง POST พร้อมกัน
  // ของ PSID เดียว อาจนับขาดเล็กน้อย. ถ้าต้องการเป๊ะ 100% ค่อยย้ายไปใช้
  // Postgres RPC (atomic +1) ทีหลัง — รอบเก็บข้อมูลนี้ยอมรับได้.
  if (customerId) {
    const patch = { page_id: recipientPageId, updated_at: new Date().toISOString() };

    if (eventType === "message") {
      patch.last_message_at = sentAt;
      patch.total_messages = Number(customer.total_messages || 0) + 1;
      if (!customer.first_message_at) patch.first_message_at = sentAt; // เผื่อทักครั้งแรกหลัง follow/ad
    }

    if (adId) {
      patch.lead_source_key = "facebook_ads";
      patch.last_ad_id = adId;
      patch.last_referral_ref = referralRef;
      patch.last_referral_at = sentAt;
      if (!customer.first_ad_id) {
        patch.first_ad_id = adId;
        patch.first_referral_ref = referralRef;
        patch.first_referral_at = sentAt;
      }
    }

    await supabaseRequest(env, "Podeng_fb_customers", {
      method: "PATCH",
      query: `?id=eq.${customerId}`,
      body: cleanObject(patch),
    }).catch((err) => console.log("patch customer failed:", err?.message || err));
  }

  // 6) เก็บข้อความ (เฉพาะ message/postback/referral)
  let savedMessageId = null;

  if (["message", "postback", "referral"].includes(eventType)) {
    const inserted = await supabaseRequest(env, "Podeng_fb_messages", {
      method: "POST",
      query: messageMid ? "?on_conflict=fb_message_mid" : "",
      prefer: messageMid
        ? "resolution=ignore-duplicates,return=representation"
        : "return=representation",
      body: cleanObject({
        fb_message_mid: messageMid,
        fb_psid: fbPsid,
        customer_id: customerId,
        page_id: recipientPageId,
        event_type: eventType,
        message_type: attachments ? "attachment" : messageText ? "text" : eventType,
        message_text: messageText,
        attachments,
        quick_reply_payload: quickReplyPayload,
        postback_payload: postbackPayload,
        ad_id: adId,
        referral_ref: referralRef,
        referral_source: referralSource,
        referral_type: referralType,
        raw_referral: referral,
        raw_event: event,
        sent_at: sentAt,
      }),
    }).catch((err) => {
      console.log("insert message failed:", err?.message || err);
      return null;
    });

    if (Array.isArray(inserted) && inserted[0]?.id) {
      savedMessageId = inserted[0].id;
    }
  }

  // 7) touchpoint จาก ads/referral (aux — ห่อ try/catch)
  if (adId || referralRef) {
    try {
      await supabaseRequest(env, "Podeng_fb_ad_touchpoints", {
        method: "POST",
        body: cleanObject({
          fb_psid: fbPsid,
          customer_id: customerId,
          page_id: recipientPageId,
          ad_id: adId,
          referral_ref: referralRef,
          referral_source: referralSource,
          referral_type: referralType,
          message_id: savedMessageId,
          raw_referral: referral,
          raw_event: event,
          touched_at: sentAt,
        }),
      });
    } catch (err) {
      console.log("insert touchpoint failed:", err?.message || err);
    }
  }
}

// ── helper: เก็บ raw event แบบไม่ throw (audit trail ต้องไม่ทำให้ flow ตาย) ──
async function safeStoreRawEvent(env, { objectType, pageId, eventType, fbPsid, messageMid, event }) {
  try {
    await supabaseRequest(env, "Podeng_fb_webhook_events", {
      method: "POST",
      body: cleanObject({
        object_type: objectType,
        page_id: pageId,
        event_type: eventType,
        fb_psid: fbPsid,
        fb_message_mid: messageMid,
        raw_event: event,
      }),
    });
  } catch (err) {
    console.log("store raw event failed:", err?.message || err);
  }
}

function detectEventType(event) {
  if (event.message) return "message";
  if (event.postback) return "postback";
  if (event.referral) return "referral";
  if (event.delivery) return "delivery";
  if (event.read) return "read";
  if (event.optin) return "optin";
  return "unknown";
}

function extractAdId(referral) {
  if (!referral) return null;
  return (
    referral.ad_id ||
    referral.ads_context_data?.ad_id ||
    referral.ad?.id ||
    referral.source_id ||
    null
  );
}

function toIsoTime(timestamp) {
  if (!timestamp) return new Date().toISOString();
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return new Date().toISOString();
  return new Date(n).toISOString();
}

async function supabaseRequest(env, table, options = {}) {
  const method = options.method || "GET";
  const query = options.query || "";
  const prefer = options.prefer || "return=minimal";

  const baseUrl = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}${query}`;

  const res = await fetch(url, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${table} failed ${res.status}: ${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function cleanObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected =
    "sha256=" +
    [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return timingSafeEqual(expected, signatureHeader);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
