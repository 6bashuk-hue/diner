// netlify/functions/get-order.js
// Public lookup used by the UGC upload page to confirm an order and personalize the page.
// Returns a sanitized subset only (no phone / address). Orders are already public-read in
// the existing Realtime DB rules; this endpoint just narrows what the client sees.
//
// Required env: FB_URL

const { fbGet } = require("../../marketing/lib/fb");

const MIN_INTERVAL_MS = 1000;
const ipLastHit = new Map();

function tooFrequent(ip) {
  const now = Date.now();
  const prev = ipLastHit.get(ip) || 0;
  ipLastHit.set(ip, now);
  if (ipLastHit.size > 500) {
    for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
  }
  return now - prev < MIN_INTERVAL_MS;
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const orderKey = String(body.orderKey || "").trim();
  if (!orderKey || !/^[A-Za-z0-9_-]+$/.test(orderKey)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid orderKey" }) };
  }

  try {
    const order = await fbGet("orders/" + orderKey);
    if (!order) return { statusCode: 404, body: JSON.stringify({ found: false }) };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        found: true,
        name: order.name || "",
        ts: order.ts || null,
        items: (order.items || []).map(it => ({ name: it.name, quantity: it.quantity || it.qty || 1 }))
      })
    };
  } catch (error) {
    console.error("get-order error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
