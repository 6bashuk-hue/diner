// netlify/functions/push-broadcast.js
// Admin-only: broadcast a push notification to all subscribed customers, optionally
// filtered by audience (all / vip / inactive). For customers without a subscription
// (iOS Safari), returns a list of WhatsApp click-to-send fallback links so the owner
// can hand-send.
//
// Required env: FB_URL, ADMIN_PASSWORD, VAPID_*

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbList } = require("../../marketing/lib/fb");
const { sendPushToCustomer, whatsappLink } = require("../../marketing/lib/push");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!verifyAdminAuth(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { audience = "all", title, body: msgBody, url = "/", waFallback = true } = body;
  if (!title || !msgBody) return { statusCode: 400, body: JSON.stringify({ error: "title and body are required" }) };

  let customers = await fbList("loyalty");
  const now = Date.now();
  if (audience === "vip") {
    customers = customers.filter(c => (c.tags || []).includes("vip"));
  } else if (audience === "inactive") {
    customers = customers.filter(c => c.lastOrderAt && (now - c.lastOrderAt) / 86400000 > 30);
  }

  let sent = 0;
  const fallbacks = [];
  const fallbackText = msgBody + "\n" + (url && url !== "/" ? url : "");

  for (const c of customers) {
    const phone = c.id;
    const result = await sendPushToCustomer(phone, {
      title, body: msgBody, url, tag: "broadcast"
    }, waFallback ? { whatsappFallbackText: fallbackText } : {});
    if (result.sent) sent++;
    else if (result.fallback) {
      fallbacks.push({ phone, name: c.fullName || c.firstName || "", url: result.fallback.url });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: customers.length, sent,
      fallbackCount: fallbacks.length,
      fallbacks: fallbacks.slice(0, 200)
    })
  };
}

module.exports = { handler };
