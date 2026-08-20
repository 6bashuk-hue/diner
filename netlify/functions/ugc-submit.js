// netlify/functions/ugc-submit.js
// Public endpoint: a customer submits a photo (UGC) in exchange for a discount coupon.
// The image arrives as a compressed JPEG data URL (the upload page resizes client-side).
// Stored under ugcSubmissions/<id> with status "pending" for admin review.
//
// Required env: FB_URL

const { fbPush } = require("../../marketing/lib/fb");

const MAX_IMAGE_CHARS = 1200000;     // ~900 KB binary after base64; the page compresses below this
const MIN_INTERVAL_MS = 3000;
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

// Collapse whitespace/newlines to single spaces, trim, and cap length (single-line fields).
function sanitize(s, max) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const imageData = String(body.imageData || "");
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(imageData)) {
    return { statusCode: 400, body: JSON.stringify({ error: "imageData must be an image data URL" }) };
  }
  if (imageData.length > MAX_IMAGE_CHARS) {
    return { statusCode: 413, body: JSON.stringify({ error: "Image too large" }) };
  }

  const customerName = sanitize(body.customerName, 60);
  if (!customerName) return { statusCode: 400, body: JSON.stringify({ error: "customerName is required" }) };

  const record = {
    imageData,
    customerName,
    customerHandle: sanitize(body.customerHandle, 40).replace(/^@/, ""),
    consentTag: body.consentTag === true,
    orderKey: sanitize(body.orderKey, 60) || null,
    note: sanitize(body.note, 280),
    status: "pending",
    submittedAt: Date.now()
  };

  try {
    const id = await fbPush("ugcSubmissions", record);
    return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
  } catch (error) {
    console.error("ugc-submit error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
