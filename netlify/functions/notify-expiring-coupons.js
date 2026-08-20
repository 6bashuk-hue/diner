// netlify/functions/notify-expiring-coupons.js
// Scheduled (daily 10:00 IL): push-notifies customers whose coupons expire in
// the next 2 days, marking them so they aren't notified twice. Push-only (no
// WhatsApp fallback — would spam the owner daily). Public endpoint that only
// does work when invoked by Netlify's scheduler.
//
// Required env: FB_URL, VAPID_*

const { fbGet, fbSet } = require("../../marketing/lib/fb");
const { sendPushToCustomer } = require("../../marketing/lib/push");

async function handler() {
  const now = Date.now();
  const cutoff = now + 2 * 86400000;

  const coupons = (await fbGet("coupons")) || {};
  let notified = 0;

  for (const [code, c] of Object.entries(coupons)) {
    if (!c || c.used || !c.expiresAt) continue;
    if (c.notifiedBeforeExpiry) continue;
    if (c.expiresAt < now || c.expiresAt > cutoff) continue;
    const phone = c.wonByPhone || c.customerPhone;
    if (!phone) continue;

    const daysLeft = Math.max(1, Math.ceil((c.expiresAt - now) / 86400000));
    // Wrap per-coupon so one failure (e.g. VAPID not configured) doesn't abort the
    // entire scheduled run and leave the rest un-notified.
    let result = { sent: false };
    try {
      result = await sendPushToCustomer(phone, {
        title: "⏰ קופון פג תוקף בקרוב",
        body: "הקופון " + code + " שלך פג בעוד " + daysLeft + " ימים. אל תפספס!",
        url: "/?coupon=" + code,
        tag: "expiring-" + code
      });
    } catch { /* skip this coupon, keep going */ }
    if (result.sent) {
      await fbSet("coupons/" + code + "/notifiedBeforeExpiry", true).catch(() => {});
      notified++;
    }
  }
  return { statusCode: 200, body: JSON.stringify({ notified }) };
}

module.exports = { handler };
