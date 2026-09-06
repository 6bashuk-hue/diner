// netlify/functions/delivery-send.js
// POST /api/delivery/send  { business_id, order_id, resend? }
// Called from admin.html's "🚗 שלח לשליח" button. Sends (or re-sends) a Telegram
// message to the shared courier so a delivery order can be dispatched without
// opening Telegram on the KDS machine. Admin-only (x-admin-token header, checked
// against ADMIN_PASSWORD — the same secret already used by admin-login.js).
//
// Required env: TELEGRAM_BOT_TOKEN, TELEGRAM_COURIER_CHAT_ID, ADMIN_PASSWORD, FB_URL (+FB_SECRET)

const crypto = require("crypto");
const { fbGet, fbSet } = require("../../marketing/lib/fb");
const SITE_CONFIG = require("../../site.config.js");
const { getProvider } = require("./lib/delivery/provider");
const { buildDeliveryText, buildKeyboard } = require("./lib/delivery/message");

const BUSINESS_ID = SITE_CONFIG.business.id;
const BUSINESS_META = { name: SITE_CONFIG.business.name, emoji: SITE_CONFIG.business.emoji || "🍽️" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token"
};

// Constant-time compare (same technique as admin-login.js) so a failed check can't
// leak the admin password's length or contents via response timing.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function json(statusCode, body) {
  return { statusCode, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const { ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_COURIER_CHAT_ID } = process.env;
  if (!ADMIN_PASSWORD || !TELEGRAM_BOT_TOKEN || !TELEGRAM_COURIER_CHAT_ID) {
    console.error("[delivery-send] missing required env vars (ADMIN_PASSWORD / TELEGRAM_BOT_TOKEN / TELEGRAM_COURIER_CHAT_ID)");
    return json(500, { error: "Server misconfigured" });
  }

  const headers = event.headers || {};
  const adminToken = headers["x-admin-token"] || headers["X-Admin-Token"];
  if (!adminToken || !safeEqual(adminToken, ADMIN_PASSWORD)) {
    console.warn("[delivery-send] rejected: missing/invalid admin token");
    return json(401, { error: "Unauthorized" });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Invalid JSON" }); }

  const businessId = String(body.business_id || "");
  const orderId = String(body.order_id || "");
  const resend = body.resend === true;

  if (businessId !== BUSINESS_ID) {
    console.warn(`[delivery-send] business_id mismatch: got "${businessId}", this site is "${BUSINESS_ID}"`);
    return json(403, { error: "business_id mismatch" });
  }
  if (!orderId || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return json(400, { error: "Invalid order_id" });
  }

  let order;
  try { order = await fbGet("orders/" + orderId); }
  catch (e) {
    console.error(`[delivery-send] fbGet(orders/${orderId}) failed:`, e.message);
    return json(502, { error: "DB read failed" });
  }
  if (!order) return json(404, { error: "Order not found" });
  if (order.type !== "משלוח") return json(400, { error: "Order is not a delivery order" });

  // Idempotency: never double-send unless the caller explicitly asked for a resend.
  if (order.delivery && order.delivery.status && !resend) {
    console.log(`[delivery-send] ${orderId} already sent (status=${order.delivery.status}) — skipping duplicate send`);
    return json(200, { ok: true, alreadySent: true, delivery: order.delivery });
  }

  // Chat id isn't a secret (it's just an addressing token); logging it here makes
  // future "did the config actually reach the function" questions self-service.
  console.log(`[delivery-send] using courier chat id ${TELEGRAM_COURIER_CHAT_ID}`);

  const text = buildDeliveryText(BUSINESS_META, order, orderId);
  const keyboard = buildKeyboard("sent", BUSINESS_ID, orderId, order);

  let provider;
  try { provider = getProvider(); }
  catch (e) {
    console.error("[delivery-send] provider init failed:", e.message);
    return json(500, { error: "Provider misconfigured" });
  }

  let sendResult;
  try {
    sendResult = await provider.send(TELEGRAM_COURIER_CHAT_ID, text, keyboard);
  } catch (e) {
    console.error(`[delivery-send] ${orderId} send to courier failed:`, e.message);
    return json(502, { error: "Failed to notify courier" });
  }

  const now = Date.now();
  const delivery = {
    businessId: BUSINESS_ID,
    status: "sent",
    telegramChatId: sendResult.chatId,
    telegramMessageId: sendResult.externalMessageId,
    sentAt: now,
    updatedAt: now
  };

  try {
    await fbSet("orders/" + orderId + "/delivery", delivery);
  } catch (e) {
    // The courier already has the message at this point — surfacing failure here
    // would make the kitchen retry and double-send. Log loudly instead.
    console.error(`[delivery-send] ${orderId} sent to Telegram but DB write failed:`, e.message);
    return json(200, { ok: true, delivery, warning: "sent_but_db_write_failed" });
  }

  console.log(`[delivery-send] ${orderId} sent to courier (business=${BUSINESS_ID}, messageId=${sendResult.externalMessageId}, resend=${resend})`);
  return json(200, { ok: true, delivery });
};
