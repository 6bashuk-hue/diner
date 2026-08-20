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

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const phone = normalizePhone(body.phone);
  const status = String(body.status || "");
  const orderKey = String(body.orderKey || "");
  const type = String(body.type || "איסוף");
  if (!phone || !status) {
    return { statusCode: 400, body: JSON.stringify({ error: "phone and status required" }) };
  }

  const msg = messageFor(status, type);
  if (!msg) return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "no_message_for_status" }) };

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
    body: JSON.stringify({
      sent: !!result.sent,
      reason: result.reason || null,
      whatsappFallbackUrl: result.sent ? null : fallbackUrl
    })
  };
}

module.exports = { handler };
