// netlify/functions/process-referral-reward.js
// Public POST called by the customer client right after a successful order whose
// coupon code starts with "REF-". Verifies the referral is legitimate (referrer ≠
// friend, friend's first order, coupon not already redeemed), mints a REWARD-XXXXXX
// for the referrer, sends a push (or returns a WhatsApp fallback URL), and pings the
// owner via Telegram.
//
// Required env: FB_URL, VAPID_*, TG_TOKEN, TG_CHAT (optional)

const { fbGet, fbSet, fbPatch } = require("../../marketing/lib/fb");
const { sendPushToCustomer, normalizePhone, whatsappLink } = require("../../marketing/lib/push");

function rand6() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function notifyOwner(text) {
  const { TG_TOKEN, TG_CHAT } = process.env;
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text })
    });
  } catch {}
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const referralCode = String(body.referralCode || "").toUpperCase();
  const newPhone = normalizePhone(body.newCustomerPhone);
  const newName = String(body.newCustomerName || "").trim().slice(0, 60) || "לקוח חדש";
  const orderKey = String(body.orderKey || "");
  // Strict shape so the code is safe as a Firebase path segment.
  if (!/^REF-[A-Z0-9]+$/.test(referralCode) || !newPhone) {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad referralCode or phone" }) };
  }

  const coupon = await fbGet("coupons/" + referralCode);
  if (!coupon || coupon.type !== "percent" || coupon.source !== "referral") {
    await notifyOwner("⚠️ Referral נכשל: הקוד " + referralCode + " לא נמצא או לא תקין (טלפון מממש: " + newPhone + ").");
    return { statusCode: 404, body: JSON.stringify({ error: "Referral code not found" }) };
  }
  if (coupon.redeemedBy) {
    await notifyOwner("⚠️ Referral " + referralCode + ' כבר מומש קודם ע"י ' + coupon.redeemedBy + " — המימוש הנוכחי (" + newPhone + ") לא יקבל תגמול.");
    return { statusCode: 409, body: JSON.stringify({ error: "Already redeemed" }) };
  }
  const referrerPhone = normalizePhone(coupon.referrerPhone);
  const referrerName = coupon.referrerName || "חבר";
  if (referrerPhone === newPhone) {
    await notifyOwner("⚠️ Referral " + referralCode + " — מימוש עצמי (אותו טלפון " + newPhone + " הזמין את הקוד ומימש אותו). לא יוקנה תגמול.");
    return { statusCode: 403, body: JSON.stringify({ error: "Self-referral not allowed" }) };
  }

  // Gate on first-order only — loyalty was just updated by the client; totalOrders === 1 here.
  const friend = await fbGet("loyalty/" + newPhone);
  if (!friend || (friend.totalOrders || 0) > 1) {
    await notifyOwner("⚠️ Referral " + referralCode + " — החבר " + newPhone +
      " הוא לקוח קיים (totalOrders=" + ((friend && friend.totalOrders) || 0) +
      "). התגמול ניתן רק על הזמנה ראשונה של חבר חדש.");
    return { statusCode: 412, body: JSON.stringify({ error: "Reward fires only on friend's first order" }) };
  }

  const rewardCode = "REWARD-" + rand6();
  const now = Date.now();
  const expiresAt = now + 7 * 86400000;
  try {
    // Claim the REF coupon FIRST (mark redeemed) so a concurrent call or a client
    // retry can't mint a second ₪20 reward off the same referral. All the
    // money-affecting writes are wrapped so a mid-sequence failure surfaces cleanly
    // instead of leaving an orphaned reward with no bookkeeping.
    await fbPatch("coupons/" + referralCode, {
      redeemedBy: newPhone, redeemedAt: now, rewardCouponCode: rewardCode, used: true
    });

    // Mint reward for the referrer
    await fbSet("coupons/" + rewardCode, {
      type: "fixed", value: 20, active: true,
      usedCount: 0, used: false, oneTime: true,
      wonByPhone: referrerPhone, source: "referral_reward",
      createdAt: now, expiresAt
    });

    // Append to referrer's pendingRewards
    const referrer = (await fbGet("loyalty/" + referrerPhone)) || {};
    const pending = (referrer.pendingRewards || []).concat([{
      couponCode: rewardCode, type: "referral_reward",
      discount: 20, discountType: "fixed",
      earnedFrom: newPhone, earnedFromName: newName,
      earnedAt: now, expiresAt, seen: false, redeemed: false
    }]);
    await fbPatch("loyalty/" + referrerPhone, { pendingRewards: pending });

    // Update referrals/{referrer} stats
    const refRec = await fbGet("referrals/" + referrerPhone);
    if (refRec) {
      const invites = (refRec.invites || []).map(i =>
        i.code === referralCode ? { ...i, redeemedBy: newPhone, redeemedAt: now, rewardCouponCode: rewardCode } : i
      );
      await fbPatch("referrals/" + referrerPhone, {
        invitesCompleted: (refRec.invitesCompleted || 0) + 1,
        rewardsEarned: (refRec.rewardsEarned || 0) + 1,
        invites
      });
    }
  } catch (e) {
    await notifyOwner("⚠️ Referral " + referralCode + " — שגיאה בעת הענקת התגמול (" + (e && e.message) + "). בדוק ידנית.");
    return { statusCode: 500, body: JSON.stringify({ error: "Reward bookkeeping failed" }) };
  }

  // Notify referrer — push first, WhatsApp fallback link returned to client/owner
  const waText = "היי " + referrerName + "! " + newName + " הזמין דרך הקוד שלך 🎉\n" +
                 "קופון ₪20 מחכה לך: " + rewardCode + " (תקף 7 ימים, באתר).";
  let pushResult = { sent: false, reason: "vapid_missing" };
  try {
    pushResult = await sendPushToCustomer(referrerPhone, {
      title: "🎁 הרווחת קופון חדש!",
      body: newName + " הזמין דרך הקוד שלך. קופון ₪20 מחכה לך באתר.",
      url: "/?reward=" + rewardCode, tag: "ref-" + rewardCode, requireInteraction: true
    }, { whatsappFallbackText: waText });
  } catch (e) {
    pushResult = { sent: false, reason: "send_error", error: e.message };
  }

  const fallbackUrl = (pushResult.fallback && pushResult.fallback.url) || whatsappLink(referrerPhone, waText);

  // Tell owner via Telegram (always — owner wants to know + can manually WhatsApp if push failed)
  await notifyOwner(
    "🎁 Referral הושלם\n" +
    newName + " (" + newPhone + ") הזמין דרך " + referrerName + " (" + referrerPhone + ").\n" +
    "תגמול: " + rewardCode + " (₪20, 7 ימים).\n" +
    (pushResult.sent ? "Push נשלח." : "Push לא נשלח (" + (pushResult.reason || "?") + "). WhatsApp ידני: " + fallbackUrl)
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, rewardCode,
      pushSent: !!pushResult.sent,
      whatsappFallbackUrl: pushResult.sent ? null : fallbackUrl
    })
  };
}

module.exports = { handler };
