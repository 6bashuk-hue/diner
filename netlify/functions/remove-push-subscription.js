// netlify/functions/remove-push-subscription.js
// Removes a customer's push subscription. Public POST (customer's own browser).
//
// Required env: FB_URL

const { fbSet } = require("../../marketing/lib/fb");

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
  if (!phone) return { statusCode: 400, body: JSON.stringify({ error: "Missing phone" }) };

  try {
    await fbSet("loyalty/" + phone + "/pushSubscription", null);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

module.exports = { handler };
