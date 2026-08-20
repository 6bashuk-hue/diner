// netlify/functions/save-push-subscription.js
// Stores a customer's Web Push subscription under loyalty/{phone}/pushSubscription.
// Public POST (customer's own browser calls it); the subscription endpoint URL is
// effectively a per-device token, so we don't gate this with the admin password.
//
// Required env: FB_URL

const { fbPatch } = require("../../marketing/lib/fb");

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").replace(/^972/, "0");
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const phone = normalizePhone(body.phone);
  const subscription = body.subscription;
  if (!phone || !subscription || !subscription.endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing phone or subscription" }) };
  }

  try {
    await fbPatch("loyalty/" + phone, {
      pushSubscription: { ...subscription, subscribedAt: Date.now() }
    });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

module.exports = { handler };
