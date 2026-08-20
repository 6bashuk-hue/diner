// netlify/functions/mint-comeback-coupon.js
// Public POST. Mints a one-time "we missed you" coupon (BACK-XXXXX, 10% off) for a
// lapsed customer, re-checking eligibility server-side from the loyalty record:
//   - has ordered before (lastOrderAt exists)
//   - 30+ days since the last order
//   - no comeback coupon issued in the past 60 days
// Replaces the old client-side mint so it keeps working after `coupons`/`loyalty`
// are locked (.write:false) — this writes via FB_SECRET through marketing/lib/fb.js.
//
// Required env: FB_URL (+ FB_SECRET once rules are locked)

const { fbGet, fbSet } = require("../../marketing/lib/fb");
const { overDailyLimit } = require("../../marketing/lib/rate-guard");

const MAX_PER_IP_PER_DAY = 5;     // blocks scanning public loyalty phones to farm 10% codes
const COMEBACK_DAYS = 30;
const COMEBACK_REWARD = 10;          // percent
const TTL_MS = 30 * 86400000;
const DAY = 86400000;

const MIN_INTERVAL_MS = 1000;
const ipLastHit = new Map();
function tooFrequent(ip) {
  const now = Date.now();
  const prev = ipLastHit.get(ip) || 0;
  ipLastHit.set(ip, now);
  if (ipLastHit.size > 500) for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
  return now - prev < MIN_INTERVAL_MS;
}
const normalizePhone = (p) => String(p || "").replace(/\D/g, "");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const ip = ((event.headers && event.headers["x-forwarded-for"]) || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  if (await overDailyLimit("comeback", ip, MAX_PER_IP_PER_DAY)) {
    return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  }
  if (!process.env.FB_URL) return { statusCode: 500, body: JSON.stringify({ error: "Missing FB_URL" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const phone = normalizePhone(body.phone);
  if (!/^0\d{8,9}$/.test(phone)) return { statusCode: 400, body: JSON.stringify({ error: "Invalid phone" }) };

  const data = await fbGet("loyalty/" + phone);
  if (!data || !data.lastOrderAt) return { statusCode: 200, body: JSON.stringify({ eligible: false }) };

  const now = Date.now();
  const daysSince = Math.floor((now - data.lastOrderAt) / DAY);
  const lastIssued = data.lastComebackAt ? Math.floor((now - data.lastComebackAt) / DAY) : 999;
  if (daysSince < COMEBACK_DAYS || lastIssued <= 60) {
    return { statusCode: 200, body: JSON.stringify({ eligible: false }) };
  }

  const code = "BACK-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  await fbSet("coupons/" + code, {
    type: "percent", value: COMEBACK_REWARD, active: true,
    usedCount: 0, used: false, oneTime: true,
    createdAt: now, expiresAt: now + TTL_MS,
    wonByPhone: phone, source: "comeback"
  });
  await fbSet("loyalty/" + phone + "/lastComebackAt", now);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eligible: true, code, daysSince, reward: COMEBACK_REWARD })
  };
};
