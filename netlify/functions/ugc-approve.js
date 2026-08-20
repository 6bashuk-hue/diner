// netlify/functions/ugc-approve.js
// Admin reviews a UGC submission. On approve it mints a single-use percentage coupon,
// promotes the photo into the marketingAssets library, and records the coupon on the
// submission so the customer can be told their code. On reject it just flips the status.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbGet, fbSet, fbPatch, fbPush, fbList } = require("../../marketing/lib/fb");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUPON_TTL_MS = 30 * 86400 * 1000;
const DEFAULT_PERCENT = 5;

function genCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return "UGC-" + s;
}

async function mintCoupon(percent, submissionId) {
  let code = null;
  for (let i = 0; i < 6; i++) {
    const candidate = genCode();
    if (!(await fbGet("coupons/" + candidate))) { code = candidate; break; }
  }
  if (!code) throw new Error("Could not allocate coupon code");

  await fbSet("coupons/" + code, {
    type: "percent", value: percent, active: true,
    usedCount: 0, used: false, oneTime: true,
    createdAt: Date.now(), expiresAt: Date.now() + COUPON_TTL_MS,
    source: "ugc", ugcSubmissionId: submissionId
  });
  return code;
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod === "GET") return listSubmissions(event);
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!verifyAdminAuth(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { id, action, couponPercent } = body;
  if (!id || !["approve", "reject"].includes(action)) {
    return { statusCode: 400, body: JSON.stringify({ error: "id and action (approve|reject) required" }) };
  }

  try {
    const submission = await fbGet("ugcSubmissions/" + id);
    if (!submission) return { statusCode: 404, body: JSON.stringify({ error: "Submission not found" }) };

    if (action === "reject") {
      await fbPatch("ugcSubmissions/" + id, { status: "rejected", reviewedAt: Date.now() });
      return { statusCode: 200, body: JSON.stringify({ id, status: "rejected", success: true }) };
    }

    // approve
    const percent = Number(couponPercent) > 0 ? Number(couponPercent) : DEFAULT_PERCENT;
    const code = submission.couponCode || await mintCoupon(percent, id);

    // Basic, deterministic tags from the linked order (no AI).
    const tags = ["ugc"];
    if (submission.orderKey) {
      const order = await fbGet("orders/" + submission.orderKey);
      (order && order.items || []).forEach(it => { if (it.name) tags.push("pizza-" + it.name); });
    }

    const assetId = await fbPush("marketingAssets", {
      type: "ugc",
      imageData: submission.imageData,
      customerName: submission.customerName,
      customerHandle: submission.customerHandle || null,
      consentTag: submission.consentTag === true,
      sourceSubmissionId: id,
      tags,
      createdAt: Date.now()
    });

    await fbPatch("ugcSubmissions/" + id, {
      status: "approved",
      reviewedAt: Date.now(),
      couponCode: code,
      couponPercent: percent,
      assetId
    });

    return { statusCode: 200, body: JSON.stringify({ id, status: "approved", couponCode: code, assetId, success: true }) };
  } catch (error) {
    console.error("ugc-approve error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

async function listSubmissions(event) {
  if (!verifyAdminAuth(event)) return unauthorized();
  try {
    const rows = await fbList("ugcSubmissions", { sortField: "submittedAt", limit: 200 });
    return { statusCode: 200, body: JSON.stringify({ items: rows }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
