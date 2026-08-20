// netlify/functions/send-order.js
// משתני הסביבה מוגדרים ב-Netlify Dashboard > Site Settings > Environment Variables:
//   TG_TOKEN  — טוקן הבוט של טלגרם
//   TG_CHAT   — מזהה הצ'אט של טלגרם

const MAX_MSG_LEN = 4000;            // Telegram message limit is 4096; leave headroom
const MIN_INTERVAL_MS = 1500;        // Per-IP soft rate limit (in-memory)
const ipLastHit = new Map();         // Lives for the lifetime of the function instance

function tooFrequent(ip) {
  const now = Date.now();
  const prev = ipLastHit.get(ip) || 0;
  ipLastHit.set(ip, now);
  // Trim map occasionally to avoid unbounded growth
  if (ipLastHit.size > 500) {
    for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
  }
  return now - prev < MIN_INTERVAL_MS;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  }

  const { TG_TOKEN, TG_CHAT } = process.env;
  if (!TG_TOKEN || !TG_CHAT) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing env vars" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { message } = body;
  if (!message || typeof message !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing message" }) };
  }
  if (message.length > MAX_MSG_LEN) {
    return { statusCode: 413, body: JSON.stringify({ error: "Message too long" }) };
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text: message, parse_mode: "Markdown" }),
  });

  if (!tgRes.ok) {
    const err = await tgRes.text();
    return { statusCode: 502, body: JSON.stringify({ error: "Telegram error", detail: err }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
