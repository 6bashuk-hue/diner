// netlify/functions/place-order.js
// Authoritative, server-side order placement. The browser sends only the cart
// (item names + chosen extras) and customer details — NEVER prices or totals.
// This function re-prices everything against the live `menu` / `siteSettings/extras`
// nodes, validates and atomically redeems the coupon, records loyalty, writes the
// order, and pings Telegram. With this in place the `coupons` / `loyalty` / `orders`
// totals can no longer be forged from the client.
//
// All Firebase writes go through marketing/lib/fb.js, which appends ?auth=FB_SECRET
// when that env var is set — so this keeps working after the security rules are
// locked down (.write:false), while the public REST endpoint can no longer write.
//
// Required env: FB_URL  (+ FB_SECRET once rules are locked)
// Optional env: TG_TOKEN, TG_CHAT  (Telegram kitchen ping)

const { fbGet, fbSet, fbPush } = require("../../marketing/lib/fb");
const SITE_CONFIG = require("../../site.config.js");
const {
  PricingError, flattenPrices, flattenGuestPrices, flattenGuestExtraPrices,
  priceCart, findDeliveryZone
} = require("./lib/pricing");

const MIN_DELIVERY = 60;
const LOYALTY_GOAL = 10;
const LOYALTY_REWARD = 30;
const DEFAULT_THRESHOLD = {
  enabled: true,
  thresholdAmount: 95,
  rewardItem: { name: "צ'יפס אמריקאי", description: "צ'יפס דיינר פריך ומוזהב", menuPrice: 25, actualCost: 4 }
};

// ── per-IP soft rate limit (in-memory, per warm instance) ──
const MIN_INTERVAL_MS = 1200;
const ipLastHit = new Map();
function tooFrequent(ip) {
  const now = Date.now();
  const prev = ipLastHit.get(ip) || 0;
  ipLastHit.set(ip, now);
  if (ipLastHit.size > 500) for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
  return now - prev < MIN_INTERVAL_MS;
}

const normalizePhone = (p) => String(p || "").replace(/\D/g, "");
const validPhone = (p) => /^0\d{8,9}$/.test(p);

function computeTags({ totalOrders, daysActive, avgOrderValue, lastOrderAt }) {
  const tags = [];
  if (totalOrders === 1) tags.push("new");
  else if (totalOrders >= 10) tags.push("vip");
  else if (totalOrders >= 5) tags.push("regular");
  else tags.push("active");
  if (avgOrderValue >= 120) tags.push("high_value");
  const day = new Date(lastOrderAt).getDay();
  if (day === 5 || day === 6) tags.push("weekend_orderer");
  if (daysActive >= 60 && totalOrders >= 3) tags.push("loyal");
  return tags;
}
function computeTier(totalOrders, totalRevenue) {
  if (totalOrders >= 20 || totalRevenue >= 1500) return "vip";
  if (totalOrders >= 10) return "regular";
  if (totalOrders >= 3) return "active";
  return "new";
}

async function sendTelegram(message) {
  const { TG_TOKEN, TG_CHAT } = process.env;
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text: message, parse_mode: "Markdown" })
    });
  } catch { /* order is already saved; kitchen sees it on the board */ }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const ip = ((event.headers && event.headers["x-forwarded-for"]) || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) return { statusCode: 429, body: JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד רגע" }) };

  if (!process.env.FB_URL) return { statusCode: 500, body: JSON.stringify({ error: "Missing FB_URL" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const name = String(body.name || "").trim().slice(0, 80);
  const phone = normalizePhone(body.phone);
  const type = body.type === "משלוח" ? "משלוח" : "איסוף עצמי";
  const address = String(body.address || "").trim().slice(0, 200);
  const courierNotes = String(body.courierNotes || "").trim().slice(0, 280);
  const payment = body.payment === "cash" ? "cash" : "credit";
  const couponCode = String(body.couponCode || "").trim().toUpperCase();
  const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];

  // ── Delivery zone (only relevant for type === "משלוח") ──
  let zone = null;
  if (type === "משלוח") {
    zone = findDeliveryZone(String(body.deliveryZone || ""));
    if (!zone) return { statusCode: 400, body: JSON.stringify({ error: "נא לבחור אזור משלוח" }) };
    if (zone.requiresAddress && !address) {
      return { statusCode: 400, body: JSON.stringify({ error: "חסרה כתובת למשלוח" }) };
    }
  }

  if (!name) return { statusCode: 400, body: JSON.stringify({ error: "חסר שם" }) };
  if (!validPhone(phone)) return { statusCode: 400, body: JSON.stringify({ error: "מספר טלפון לא תקין" }) };
  if (!items.length) return { statusCode: 400, body: JSON.stringify({ error: "העגלה ריקה" }) };
  if (couponCode && !/^[A-Z0-9-]{3,40}$/.test(couponCode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "קוד קופון לא תקין" }) };
  }

  // ── Re-price every line against the live menu (the only trusted source) ──
  const [menuNode, extrasNode, adminState] = await Promise.all([
    fbGet("menu"), fbGet("siteSettings/extras"), fbGet("admin_state")
  ]);
  const menuPrices = flattenPrices(menuNode);
  const extraPrices = flattenPrices(extrasNode);
  const guestPrices = flattenGuestPrices(SITE_CONFIG.guestMenus);
  const guestExtraPrices = flattenGuestExtraPrices(SITE_CONFIG.guestMenus);
  const soldOut = new Set((adminState && Array.isArray(adminState.soldOut)) ? adminState.soldOut : []);

  // If the menu can't be read at all, fall back to trusting client basePrice rather
  // than rejecting every order (availability over strictness on infra failure).
  const menuLoaded = menuPrices.size > 0;

  let orderItems, itemsTotal, ownItemsTotal;
  try {
    ({ orderItems, itemsTotal, ownItemsTotal } = priceCart(items, {
      menuPrices, extraPrices, guestPrices, guestExtraPrices, soldOut, menuLoaded
    }));
  } catch (e) {
    if (e instanceof PricingError) return { statusCode: e.statusCode, body: JSON.stringify({ error: e.message }) };
    throw e;
  }
  if (!orderItems.length) return { statusCode: 400, body: JSON.stringify({ error: "העגלה ריקה" }) };

  if (type === "משלוח" && itemsTotal < MIN_DELIVERY) {
    return { statusCode: 400, body: JSON.stringify({ error: `מינימום הזמנה למשלוח: ${MIN_DELIVERY} ₪` }) };
  }

  // ── Coupon: validate against the authoritative record, compute discount ──
  let discount = 0;
  let couponRecord = null;
  if (couponCode) {
    const c = await fbGet("coupons/" + couponCode);
    if (!c) return { statusCode: 400, body: JSON.stringify({ error: "קוד קופון לא תקף" }) };
    if (c.active === false) return { statusCode: 400, body: JSON.stringify({ error: "הקופון כבר לא פעיל" }) };
    if (c.used === true) return { statusCode: 400, body: JSON.stringify({ error: "הקופון כבר מומש" }) };
    if (c.expiresAt && Date.now() > c.expiresAt) return { statusCode: 400, body: JSON.stringify({ error: "פג תוקפו של הקופון" }) };
    const value = Number(c.value) || 0;
    discount = c.type === "percent" ? Math.round(itemsTotal * value / 100) : Math.min(value, itemsTotal);
    couponRecord = c;
  }

  // ── Threshold free item (computed server-side from config) ──
  let thresholdCfg = await fbGet("marketingConfig/thresholdNudge");
  if (!thresholdCfg || typeof thresholdCfg !== "object") thresholdCfg = DEFAULT_THRESHOLD;
  let thresholdReward = null;
  const rewardedThreshold = thresholdCfg.enabled && ownItemsTotal >= Number(thresholdCfg.thresholdAmount || 0);
  if (rewardedThreshold) {
    const r = thresholdCfg.rewardItem || DEFAULT_THRESHOLD.rewardItem;
    orderItems.push({ name: r.name, basePrice: 0, extras: [], notes: r.description || "", total: 0, isThresholdReward: true });
    thresholdReward = {
      rewarded: true, orderTotal: ownItemsTotal,
      threshold: Number(thresholdCfg.thresholdAmount || 0),
      rewardItem: r.name, rewardCost: r.actualCost || 0
    };
  }

  const fee = type === "משלוח" ? zone.fee : 0;
  const total = Math.max(0, itemsTotal + fee - discount);
  const paymentLabel = payment === "cash" ? "💵 מזומן" : "💳 אשראי טלפוני";
  const now = Date.now();

  // ── Write the order (FB_SECRET-authed once rules are locked) ──
  const orderKey = await fbPush("orders", {
    name, phone, type,
    address: type === "משלוח" ? address : null,
    deliveryZone: type === "משלוח" ? { key: zone.key, label: zone.label, fee: zone.fee } : null,
    courierNotes: courierNotes || null,
    payment, paymentLabel,
    items: orderItems,
    couponCode: couponCode || null,
    discount, total, thresholdReward,
    ts: now,
    date: new Date(now).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })
  });
  if (!orderKey) return { statusCode: 502, body: JSON.stringify({ error: "שמירת ההזמנה נכשלה" }) };

  // ── Redeem the coupon (after the order exists, so a failure can't grant a free order) ──
  if (couponRecord) {
    const updates = { usedCount: (couponRecord.usedCount || 0) + 1 };
    if (couponRecord.oneTime) { updates.used = true; updates.usedAt = now; updates.usedByOrderId = orderKey; }
    await fbSet("coupons/" + couponCode, { ...couponRecord, ...updates }).catch(() => {});

    // A redeemed referral reward (REWARD-) should stop showing on the owner's
    // loyalty card — flag the matching pendingRewards entry. (REF- codes are handled
    // by process-referral-reward, which the client still calls.)
    if (couponCode.startsWith("REWARD-")) {
      try {
        const owner = await fbGet("loyalty/" + phone);
        if (owner && Array.isArray(owner.pendingRewards)) {
          const pendingRewards = owner.pendingRewards.map(r =>
            r.couponCode === couponCode ? { ...r, redeemed: true, redeemedAt: now } : r
          );
          await fbSet("loyalty/" + phone + "/pendingRewards", pendingRewards);
        }
      } catch { /* best-effort */ }
    }
  }

  // ── Loyalty (server-authoritative; mints the LOYAL- reward at the goal) ──
  let loyaltyOut = null;
  try { loyaltyOut = await recordLoyalty(phone, orderKey, { name, phone, type, address, payment, items: orderItems, total }); }
  catch { /* loyalty is best-effort; never block a paid order on it */ }

  // ── Item stats (best-effort, mirrors the client recordItemStats) ──
  try {
    const names = [...new Set(orderItems.filter(i => !i.isThresholdReward).map(i => i.name))];
    await Promise.all(names.map(async n => {
      const key = "itemStats/" + encodeURIComponent(n);
      const cur = (await fbGet(key)) || { count: 0 };
      await fbSet(key, { count: (cur.count || 0) + 1, lastOrdered: now });
    }));
  } catch { /* ignore */ }

  // ── Telegram kitchen ping ──
  let itemsText = "";
  orderItems.forEach(i => {
    itemsText += "• " + (i.guestSource ? "🏪 " : "") + i.name + (i.guestSource ? " (" + i.guestSource + ")" : "") + (i.choice ? " — " + i.choice : "") + " -- " + i.basePrice + " ₪";
    if (i.extras && i.extras.length) itemsText += "\n  ↳ " + i.extras.map(e => e.name + (e.qty > 1 ? " x" + e.qty : "") + (e.choice ? " — " + e.choice : "") + " (+" + (e.qty * e.price) + "₪)").join(", ");
    if (i.notes) itemsText += "\n  📝 " + i.notes;
    itemsText += "\n  סה\"כ: " + i.total + " ₪\n";
  });
  // Delivery fee shown as its own line item — always visible in the breakdown,
  // not just in the summary header, so it's never missed on the printed ticket.
  if (type === "משלוח") itemsText += "• 🛵 משלוח (" + zone.label + ") -- " + fee + " ₪\n";
  let msg = "🍔 *הזמנה חדשה -- " + SITE_CONFIG.business.name + "*\n━━━━━━━━━━━━━━━━━\n";
  msg += "👤 *שם:* " + name + "\n📞 *טלפון:* " + phone + "\n🚲 *סוג:* " + type + "\n";
  msg += "💰 *תשלום:* " + paymentLabel + (payment === "credit" ? " — ⚠️ להתקשר" : "") + "\n";
  if (type === "משלוח") {
    // Address always shown for a delivery — the real street address for ערד, or the
    // zone name itself (בא"ח/נבטים) when no free-text address applies.
    msg += "📍 *כתובת:* " + (address || zone.label) + "\n";
    msg += "🗺️ *אזור משלוח:* " + zone.label + "\n";
    msg += "💵 דמי משלוח: " + fee + " ₪\n";
  }
  if (courierNotes) msg += "🛵 *הערה לשליח:* " + courierNotes + "\n";
  if (discount > 0 && couponCode) msg += "🎟 *קופון " + couponCode + ":* -" + discount + " ₪\n";
  if (rewardedThreshold) msg += "🎁 *" + ((thresholdCfg.rewardItem || DEFAULT_THRESHOLD.rewardItem).name) + " — חינם (Threshold)*\n";
  msg += "━━━━━━━━━━━━━━━━━\n📦 *פירוט:*\n" + itemsText + "\n━━━━━━━━━━━━━━━━━\n💰 *סה\"כ: " + total + " ₪*";
  await sendTelegram(msg);

  const etaMinutes = (adminState && Number(adminState.etaMinutes)) || 30;
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true, orderKey, total, discount, etaMinutes,
      loyaltyRewardCode: (loyaltyOut && loyaltyOut.rewardCode) || null
    })
  };
};

// Port of the client recordLoyaltyOrder — single source of truth now lives here.
async function recordLoyalty(phoneDigits, orderKey, orderData) {
  if (!phoneDigits) return null;
  const path = "loyalty/" + phoneDigits;
  const existing = (await fbGet(path)) || { count: 0, totalOrders: 0 };
  const now = Date.now();
  const newCount = (existing.count || 0) + 1;
  const totalOrders = (existing.totalOrders || 0) + 1;
  const orderTotal = orderData.total || 0;
  const totalRevenue = (existing.totalRevenue || 0) + orderTotal;
  const avgOrderValue = Math.round(totalRevenue / totalOrders);
  const firstName = (orderData.name || "").trim().split(/\s+/)[0] || existing.firstName || "";
  const favoriteItems = { ...(existing.favoriteItems || {}) };
  (orderData.items || []).forEach(i => { if (i && !i.isThresholdReward && i.name) favoriteItems[i.name] = (favoriteItems[i.name] || 0) + 1; });
  const firstOrderDate = existing.firstOrderDate || now;
  const daysActive = Math.floor((now - firstOrderDate) / 86400000);

  const updates = {
    ...existing,
    count: newCount, totalOrders, lastOrderAt: now, lastOrderKey: orderKey,
    firstName, fullName: orderData.name || existing.fullName || "",
    totalRevenue, avgOrderValue, firstOrderDate, daysActive, favoriteItems,
    lastOrder: {
      orderId: orderKey, createdAt: now, total: orderTotal,
      items: (orderData.items || []).map(i => ({
        name: i.name, basePrice: i.basePrice || 0, total: i.total || 0,
        choice: i.choice || null,
        extras: (i.extras || []).map(e => ({ name: e.name, qty: e.qty, price: e.price })),
        notes: i.notes || "", isThresholdReward: !!i.isThresholdReward
      })),
      type: orderData.type || null, address: orderData.address || null, payment: orderData.payment || null
    },
    tags: computeTags({ totalOrders, daysActive, avgOrderValue, lastOrderAt: now }),
    tier: computeTier(totalOrders, totalRevenue)
  };

  let rewardCode = null;
  if (newCount >= LOYALTY_GOAL) {
    rewardCode = "LOYAL-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    await fbSet("coupons/" + rewardCode, {
      type: "fixed", value: LOYALTY_REWARD, active: true,
      usedCount: 0, used: false, oneTime: true,
      createdAt: now, expiresAt: now + 60 * 86400000,
      wonByPhone: phoneDigits, source: "loyalty"
    });
    updates.count = 0;
    updates.lastReward = { code: rewardCode, issuedAt: now };
  }
  await fbSet(path, updates);
  return { rewardCode };
}
