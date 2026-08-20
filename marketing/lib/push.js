// marketing/lib/push.js
// Server-side helper: sends a Web Push notification to a customer, with optional
// WhatsApp fallback for users without a subscription (iOS Safari).
//
// Required env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, FB_URL

const webpush = require("web-push");
const { fbGet, fbSet } = require("./fb");

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error("VAPID env vars missing (VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT)");
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").replace(/^972/, "0");
}

// Generate a wa.me click-to-WhatsApp link to phone with a prefilled message.
function whatsappLink(phone, text) {
  const digits = normalizePhone(phone).replace(/^0/, "972");
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(text || "");
}

// Send a push notification to one customer (by phone). Returns:
//   { sent: true }
//   { sent: false, reason, fallback?: { kind: "whatsapp", url, text } }
async function sendPushToCustomer(phone, payload, opts = {}) {
  ensureVapid();
  const norm = normalizePhone(phone);
  if (!norm) return { sent: false, reason: "no_phone" };

  const loyalty = await fbGet("loyalty/" + norm);
  const subscription = loyalty && loyalty.pushSubscription;

  if (!subscription) {
    if (opts.whatsappFallbackText) {
      return {
        sent: false, reason: "no_subscription",
        fallback: { kind: "whatsapp", url: whatsappLink(norm, opts.whatsappFallbackText), text: opts.whatsappFallbackText }
      };
    }
    return { sent: false, reason: "no_subscription" };
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { sent: true };
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      // Subscription expired — clean it up.
      await fbSet("loyalty/" + norm + "/pushSubscription", null).catch(() => {});
      if (opts.whatsappFallbackText) {
        return {
          sent: false, reason: "subscription_expired",
          fallback: { kind: "whatsapp", url: whatsappLink(norm, opts.whatsappFallbackText), text: opts.whatsappFallbackText }
        };
      }
      return { sent: false, reason: "subscription_expired" };
    }
    return { sent: false, reason: "send_failed", error: e.message };
  }
}

module.exports = { sendPushToCustomer, whatsappLink, normalizePhone };
