// netlify/functions/admin-login.js
// משתני הסביבה מוגדרים ב-Netlify Dashboard > Site Settings > Environment Variables:
//   ADMIN_PASSWORD — הסיסמה של האדמין

const crypto = require("crypto");

// Constant-time compare (hash both sides so length differences don't throw / leak).
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Light per-IP brute-force throttle (in-memory, per warm instance). Not a full
// solution on a multi-instance platform, but it removes the "unlimited guesses,
// no friction" property.
const MIN_INTERVAL_MS = 600;
const ipLastHit = new Map();
function tooFrequent(ip) {
  const now = Date.now();
  const prev = ipLastHit.get(ip) || 0;
  ipLastHit.set(ip, now);
  if (ipLastHit.size > 500) for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
  return now - prev < MIN_INTERVAL_MS;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ip = ((event.headers && event.headers["x-forwarded-for"]) || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many attempts" }) };
  }

  const { ADMIN_PASSWORD } = process.env;
  if (!ADMIN_PASSWORD) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing env var" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { password } = body;
  if (typeof password === "string" && password.length > 0 && safeEqual(password, ADMIN_PASSWORD)) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } else {
    return { statusCode: 401, body: JSON.stringify({ ok: false }) };
  }
};
