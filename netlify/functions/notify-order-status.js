// netlify/functions/notify-order-status.js
// Fired from admin.html every time an order's status changes. Sends a push
// notification to the customer ("הזמנתך בהכנה!" / "הזמנתך מוכנה!"), with a
// WhatsApp fallback link returned in the response so the kitchen can send a
// manual message when the customer hasn't subscribed.
//
// Required env: FB_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

const { sendPushToCustomer, normalizePhone, whatsappLink } = require("../../marketing/lib/push");
const SITE_CONFIG = require("../../site.config.js");

function messageFor(status, type) {
  const isDelivery = type === "משלוח";
  const name = SITE_CONFIG.business.name;
  if (status === "inprog") {
    return {
      title: "🍔 ההזמנה שלך בהכנה!",
      body: "התחלנו להכין את ההזמנה שלך. זמן הכנה משוער: 25–35 דקות.",
      wa: "🍔 ההזמנה שלך ב" + name + " בהכנה! זמן הכנה משוער: 25–35 דקות."
    };
  }
  if (status === "done") {
    return isDelivery
      ? {
          title: "✅ ההזמנה שלך יוצאת לדרך!",
          body: "השליח יוצא אליך עכשיו. בתאבון! 🍔",
          wa: "✅ ההזמנה שלך מ" + name + " יוצאת אליך עכשיו! בתאבון 🍔"
        }
      : {
          title: "✅ ההזמנה שלך מוכנה לאיסוף!",
          body: "ההזמנה שלך מוכנה ומחכה לך. בתאבון! 🍔",
          wa: "✅ ההזמנה שלך מ" + name + " מוכנה לאיסוף! בתאבון 🍔"
        };
  }
  return null;
}

// netlify.toml's [[headers]] block for /.netlify/functions/* only applies to
// static-asset responses, never to a Function's own response — so CORS must
// be set here directly. Needed for the Capacitor kitchen app (admin.html
// wrapped as an Android app), whose WebView origin is https://localhost, not
// this site's real domain, making every call here cross-origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const phone = normalizePhone(body.phone);
  const status = String(body.status || "");
  const orderKey = String(body.orderKey || "");
  const type = String(body.type || "איסוף");
  if (!phone || !status) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "phone and status required" }) };
  }

  const msg = messageFor(status, type);
  if (!msg) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ skipped: true, reason: "no_message_for_status" }) };

  let result = { sent: false, reason: "vapid_missing" };
  try {
    result = await sendPushToCustomer(phone, {
      title: msg.title,
      body: msg.body,
      url: "/?track=" + encodeURIComponent(phone),
      tag: "order-" + (orderKey || status),
      requireInteraction: false
    }, { whatsappFallbackText: msg.wa });
  } catch (e) {
    result = { sent: false, reason: "send_error", error: e.message };
  }

  const fallbackUrl = (result.fallback && result.fallback.url) || whatsappLink(phone, msg.wa);
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      sent: !!result.sent,
      reason: result.reason || null,
      whatsappFallbackUrl: result.sent ? null : fallbackUrl
    })
  };
}

module.exports = { handler };
