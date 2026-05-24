"use client";

/**
 * LINE Notify per-user OAuth panel — Sprint-2 P1.3.
 *
 * Lives at the bottom of /profile. Shows one of two states:
 *
 *   (a) NOT connected — "เชื่อมต่อ LINE Notify" button. Clicks call
 *       `getLineOAuthAuthorizeUrl` (server action) → window.location to
 *       LINE's authorize URL → callback at /api/linenotify/callback
 *       persists the token + redirects back to /profile?ln=connected
 *
 *   (b) CONNECTED — "เชื่อมต่อแล้วเมื่อ {date}" + Disconnect button +
 *       per-event channel toggles. Channel changes call
 *       `updateLineNotifyChannels`. Disconnect calls
 *       `disconnectLineNotify` (revoke + clear column).
 *
 * ⚠️ LINE Notify is EOL'd April 2025. This is the customer-visible
 * surface that keeps the existing connect/disconnect workflow alive
 * for migrated PCS customers during the transition. The long-term
 * replacement is LINE Messaging API per-user (ADR-0001 / D-1-LIFF).
 */

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getLineOAuthAuthorizeUrl,
  disconnectLineNotify,
  updateLineNotifyChannels,
  type LineNotifyChannelsInput,
} from "@/actions/line-notify";

/** Per-event subscription map. The dispatcher cron treats a missing
 *  key as opt-IN (matches the legacy behaviour where any event triggers
 *  the single token when set), so the UI defaults each toggle to true
 *  unless the customer explicitly opted out. */
const CHANNEL_KEYS = [
  { key: "order_created",       label: "ออเดอร์ใหม่" },
  { key: "payment_approved",    label: "ยืนยันชำระเงิน" },
  { key: "shipment_arrived",    label: "พัสดุถึงโกดัง" },
  { key: "shipment_delivered",  label: "พัสดุส่งสำเร็จ" },
  { key: "wallet_topup",        label: "เติมเงินสำเร็จ" },
  { key: "wallet_refund",       label: "คืนเงิน" },
  { key: "promo",               label: "โปรโมชัน + ข่าวสาร" },
] as const;

type Props = {
  /** When non-null → connected. ISO timestamp of when the OAuth
   *  exchange completed. */
  connectedAt: string | null;
  /** Per-event subscription map currently persisted on profile. */
  channels:    Record<string, boolean> | null;
};

export function LineNotifyPanel({ connectedAt, channels: initial }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [channels, setChannels]    = useState<Record<string, boolean>>(initial ?? {});
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(() => {
    // Hydrate a flash from the OAuth callback's ?ln=... query param.
    const ln = searchParams.get("ln");
    if (!ln) return null;
    switch (ln) {
      case "connected":      return { tone: "ok",  text: "เชื่อมต่อ LINE Notify สำเร็จ — รับการแจ้งเตือนได้แล้ว" };
      case "missing_params": return { tone: "err", text: "ไม่ได้รับ code จาก LINE — ลองอีกครั้ง" };
      case "invalid_state":  return { tone: "err", text: "หมดเวลายืนยัน (CSRF) — กดเชื่อมต่ออีกครั้ง" };
      case "persist_failed": return { tone: "err", text: "บันทึก token ไม่สำเร็จ — ลองอีกครั้ง" };
      case "access_denied":  return { tone: "err", text: "คุณยกเลิกการเชื่อมต่อ LINE Notify" };
      default:               return { tone: "err", text: `เชื่อมต่อไม่สำเร็จ: ${ln}` };
    }
  });

  const isConnected = Boolean(connectedAt);

  function handleConnect() {
    setMsg(null);
    startTransition(async () => {
      const res = await getLineOAuthAuthorizeUrl();
      if (!res.ok) {
        setMsg({
          tone: "err",
          text:
            res.error === "line_notify_unavailable"
              ? "บริการ LINE Notify ยังไม่พร้อม — ติดต่อทีมงาน"
              : `ไม่สามารถสร้างลิงก์เชื่อมต่อ: ${res.error}`,
        });
        return;
      }
      // Redirect off-domain to LINE's authorize endpoint; the callback
      // (app/api/linenotify/callback/route.ts) lands the user back on
      // /profile?ln=...
      window.location.href = res.data!.url;
    });
  }

  function handleDisconnect() {
    if (!window.confirm("ยกเลิกการเชื่อมต่อ LINE Notify? คุณจะไม่ได้รับการแจ้งเตือนทาง LINE อีก")) return;
    setMsg(null);
    startTransition(async () => {
      const res = await disconnectLineNotify();
      if (!res.ok) {
        setMsg({ tone: "err", text: `ยกเลิกไม่สำเร็จ: ${res.error}` });
        return;
      }
      setMsg({ tone: "ok", text: "ยกเลิกการเชื่อมต่อแล้ว" });
      router.refresh();
    });
  }

  function handleToggleChannel(key: string, next: boolean) {
    const updated: LineNotifyChannelsInput = { ...channels, [key]: next };
    setChannels(updated);  // optimistic
    startTransition(async () => {
      const res = await updateLineNotifyChannels(updated);
      if (!res.ok) {
        // Roll back local state on persistence failure.
        setChannels(channels);
        setMsg({ tone: "err", text: `บันทึกการตั้งค่าไม่สำเร็จ: ${res.error}` });
        return;
      }
      // Don't replace the optimistic state — it's already correct.
    });
  }

  return (
    <section
      className="mt-3"
      style={{
        background: "#fff",
        border: "1px solid #e9ecef",
        borderRadius: 8,
        padding: 20,
      }}
    >
      <h3
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#06c755",
          margin: 0,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 22,
            height: 22,
            background: "#06c755",
            color: "#fff",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 800,
            textAlign: "center",
            lineHeight: "22px",
          }}
        >
          LINE
        </span>
        การแจ้งเตือน LINE Notify
      </h3>
      <p style={{ fontSize: 13, color: "#6c757d", margin: "0 0 12px" }}>
        เชื่อมต่อ LINE ของคุณเพื่อรับการแจ้งเตือนทันทีเมื่อมีการอัพเดทออเดอร์ การชำระเงิน
        และพัสดุของคุณ
      </p>

      {isConnected ? (
        <>
          <div
            style={{
              padding: "8px 12px",
              background: "#e6f8ed",
              border: "1px solid #06c755",
              borderRadius: 6,
              fontSize: 14,
              color: "#0a5e30",
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span>
              ✓ เชื่อมต่อแล้วเมื่อ{" "}
              {connectedAt
                ? new Date(connectedAt).toLocaleString("th-TH", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })
                : "—"}
            </span>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={pending}
              style={{
                background: "#fff",
                border: "1px solid #dc3545",
                color: "#dc3545",
                padding: "4px 12px",
                borderRadius: 4,
                fontSize: 13,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              ยกเลิกการเชื่อมต่อ
            </button>
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              เลือกประเภทการแจ้งเตือนที่ต้องการรับ:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
              {CHANNEL_KEYS.map(({ key, label }) => {
                // Missing key = opt-in by default (matches dispatcher logic).
                const checked = channels[key] !== false;
                return (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      border: "1px solid #e9ecef",
                      borderRadius: 4,
                      fontSize: 13,
                      cursor: pending ? "wait" : "pointer",
                      background: checked ? "#f0fdf4" : "#fff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={(e) => handleToggleChannel(key, e.target.checked)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={pending}
          style={{
            background: "#06c755",
            color: "#fff",
            border: "none",
            padding: "10px 24px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {pending ? "กำลังเตรียม..." : "🔔 เชื่อมต่อ LINE Notify"}
        </button>
      )}

      {msg && (
        <div
          style={{
            marginTop: 10,
            padding: "6px 10px",
            background: msg.tone === "ok" ? "#e6f8ed" : "#fdecea",
            border: `1px solid ${msg.tone === "ok" ? "#06c755" : "#dc3545"}`,
            borderRadius: 4,
            fontSize: 13,
            color: msg.tone === "ok" ? "#0a5e30" : "#7d1c10",
          }}
        >
          {msg.text}
        </div>
      )}

      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12, marginBottom: 0 }}>
        ⚠️ LINE Notify จะถูกยกเลิกบริการในเดือนเมษายน 2025 — เรากำลังย้ายไปใช้ LINE Messaging API ที่จะส่งแจ้งเตือนผ่าน @pacred OA โดยตรง
      </p>
    </section>
  );
}
