// netlify/functions/create-referral-code.js
// Public POST. Customer mints a REF-XXXXXX coupon (15% off, one-time, intended for
// first-time customers) and gets back a ready-to-share WhatsApp text. Capped at 5
// codes per phone per 30 days so it can't be abused.
//
// Required env: FB_URL

const { fbGet, fbSet, fbPatch } = require("../../marketing/lib/fb");
const { overDailyLimit } = require("../../marketing/lib/rate-guard");
const SITE_CONFIG = require("../../site.config.js");

const MAX_PER_IP_PER_DAY = 3;     // blocks fake-phone farming of 15% codes

function normalizePhone(p) { return String(p || "").replace(/\D/g, "").replace(/^972/, "0"); }
function rand6() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const ip = ((event.headers && event.headers["x-forwarded-for"]) || "").split(",")[0].trim() || "unknown";
  if (await overDailyLimit("refcode", ip, MAX_PER_IP_PER_DAY)) {
    return { statusCode: 429, body: JSON.stringify({ error: "הגעת למכסת הקודים היומית" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const phone = normalizePhone(body.phone);
  const name = String(body.name || "").trim().split(/\s+/)[0] || "חבר";
  if (!phone) return { statusCode: 400, body: JSON.stringify({ error: "Missing phone" }) };

  const refRecord = (await fbGet("referrals/" + phone)) || null;
  const monthAgo = Date.now() - 30 * 86400000;
  const activeCount = ((refRecord && refRecord.invites) || []).filter(i => i.createdAt > monthAgo).length;
  if (activeCount >= 5) {
    return { statusCode: 429, body: JSON.stringify({ error: "מקסימום 5 קודים בחודש" }) };
  }

  const code = "REF-" + rand6();
  const now = Date.now();
  await fbSet("coupons/" + code, {
    type: "percent", value: 15, active: true,
    usedCount: 0, used: false, oneTime: true,
    firstOrderOnly: true,
    referrerPhone: phone, referrerName: name,
    source: "referral", createdAt: now,
    expiresAt: now + 90 * 86400000
  });

  const invite = { code, createdAt: now, redeemedBy: null, redeemedAt: null, rewardCouponCode: null };
  if (!refRecord) {
    await fbSet("referrals/" + phone, {
      referrerPhone: phone, referrerName: name,
      createdAt: now, invitesSent: 1, invitesCompleted: 0, rewardsEarned: 0,
      invites: [invite]
    });
  } else {
    const invites = (refRecord.invites || []).concat([invite]);
    await fbPatch("referrals/" + phone, {
      invitesSent: (refRecord.invitesSent || 0) + 1, invites
    });
  }

  const shareText = "היי, " + name + " שלח לך הנחה ל" + SITE_CONFIG.business.name + " 🍔\nקוד אישי: " + code +
                    " — 15% בהזמנה ראשונה.\n" + SITE_CONFIG.business.canonicalUrl;

  return { statusCode: 200, body: JSON.stringify({ code, shareText }) };
}

module.exports = { handler };
