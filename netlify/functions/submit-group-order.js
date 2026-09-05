// netlify/functions/submit-group-order.js
// Public POST (manager-only check via phone match). Aggregates all participants' items,
// creates a single record under orders/, marks the group as submitted, and pings the
// owner via Telegram. The threshold reward still applies (computed on totalAmount).
//
// Required env: FB_URL, TG_TOKEN (optional), TG_CHAT (optional)

const { fbGet, fbPush, fbPatch } = require("../../marketing/lib/fb");
const { findDeliveryZone } = require("./lib/pricing");

function normalizePhone(p) { return String(p || "").replace(/\D/g, "").replace(/^972/, "0"); }

// Returns {pickupOpen, deliveryOpen, msg} for now in Asia/Jerusalem time.
// Mirrors getHoursStatus() in index.html so server and client agree.
function getILHoursStatus() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", weekday: "short", hour: "numeric", minute: "numeric", hour12: false
  }).formatToParts(new Date());
  const day = parts.find(p => p.type === "weekday").value;
  const h = parseInt(parts.find(p => p.type === "hour").value, 10);
  const m = parseInt(parts.find(p => p.type === "minute").value, 10);
  const t = h * 60 + m;
  const d = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[day];
  let pickup = false, delivery = false, msg = "";
  if (d >= 1 && d <= 4) {
    pickup = t >= 18 * 60 && t < 24 * 60;
    delivery = t >= 18 * 60 && t < 23 * 60;
    if (t < 18 * 60) msg = "נפתח היום ב-18:00";
    else if (t >= 24 * 60) msg = "נפתח מחר ב-18:00";
  } else if (d === 5) {
    pickup = t >= 18 * 60;
    delivery = false;
    if (t < 18 * 60) msg = "נפתח היום בשישי ב-18:00";
  } else if (d === 6) {
    pickup = t < 60 || t >= 12 * 60;
    delivery = t >= 18 * 60 && t < 23 * 60;
    if (t >= 60 && t < 12 * 60) msg = "נפתח היום בשבת ב-12:00";
  } else {
    msg = "נפתח ביום שני ב-18:00";
  }
  return { pickupOpen: pickup, deliveryOpen: delivery, msg };
}

function buildItemsText(participants) {
  // One block per participant, then itemized lines per participant. Same shape
  // as the solo order telegram message in index.html, plus the "addedBy" header.
  const blocks = [];
  Object.entries(participants).forEach(([, p]) => {
    const lines = (p.items || []).map(i => {
      let s = "• " + i.name + " -- " + (Number(i.basePrice) || 0) + " ₪";
      if (Array.isArray(i.extras) && i.extras.length) {
        s += "\n  ↳ " + i.extras
          .map(e => e.name + (Number(e.qty) > 1 ? " x" + e.qty : "") + (e.choice ? " — " + e.choice : "") + " (+" + ((Number(e.qty) || 1) * (Number(e.price) || 0)) + "₪)")
          .join(", ");
      }
      if (i.notes) s += "\n  📝 " + i.notes;
      s += "\n  סה\"כ: " + (Number(i.total) || 0) + " ₪";
      return s;
    }).join("\n");
    blocks.push("👤 *" + (p.name || "?") + "* — ₪" + (p.subtotal || 0) + "\n" + lines);
  });
  return blocks.join("\n\n");
}

async function notifyOwner(text) {
  const { TG_TOKEN, TG_CHAT } = process.env;
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "Markdown" })
    });
  } catch {}
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const groupId = String(body.groupId || "");
  const managerPhone = normalizePhone(body.managerPhone);
  const delivery = body.delivery || {};
  const courierNotes = String(delivery.courierNotes || "").trim().slice(0, 280);
  if (!groupId || !managerPhone) return { statusCode: 400, body: JSON.stringify({ error: "groupId, managerPhone required" }) };
  // groupId is a Firebase path segment — reject separators to prevent traversal.
  if (!/^[A-Za-z0-9_-]+$/.test(groupId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid groupId" }) };
  }

  // ── Delivery zone (only relevant when delivery.type === "משלוח") ──
  const wantsDeliveryType = (delivery.type || "") === "משלוח";
  let zone = null;
  if (wantsDeliveryType) {
    zone = findDeliveryZone(String(delivery.zone || ""));
    if (!zone) return { statusCode: 400, body: JSON.stringify({ error: "נא לבחור אזור משלוח" }) };
    if (zone.requiresAddress && !String(delivery.address || "").trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "חסרה כתובת למשלוח" }) };
    }
  }

  const group = await fbGet("groupOrders/" + groupId);
  if (!group) return { statusCode: 404, body: JSON.stringify({ error: "Group not found" }) };
  if (group.managerPhone !== managerPhone) return { statusCode: 403, body: JSON.stringify({ error: "Only manager can submit" }) };
  if (group.status !== "open") return { statusCode: 409, body: JSON.stringify({ error: "Already submitted" }) };

  // ── Closed check ──
  // Hours (Asia/Jerusalem) AND the owner's manual toggles from admin_state.
  const { pickupOpen, deliveryOpen, msg: hoursMsg } = getILHoursStatus();
  const adminState = (await fbGet("admin_state")) || {};
  const pickupOn = adminState.pickupOn !== false;
  const deliveryOn = adminState.deliveryOn !== false;
  const effectivePickup = pickupOpen && pickupOn;
  const effectiveDelivery = deliveryOpen && deliveryOn;
  if (wantsDeliveryType ? !effectiveDelivery : !effectivePickup) {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: "closed",
        message: "המסעדה סגורה כרגע ל" + (wantsDeliveryType ? "משלוחים" : "איסוף") +
          (hoursMsg ? " — " + hoursMsg : "") + ". נסה שוב כשנהיה פתוחים."
      })
    };
  }

  const participants = group.participants || {};
  const allItems = [];
  Object.entries(participants).forEach(([phone, p]) => {
    (p.items || []).forEach(i => {
      const basePrice = Math.max(0, Number(i.basePrice != null ? i.basePrice : i.price) || 0);
      const rawTotal = Number.isFinite(i.total) ? Number(i.total) : basePrice * (Number(i.qty) || 1);
      const total = Math.max(0, Number.isFinite(rawTotal) ? rawTotal : 0);
      allItems.push({
        name: i.name, basePrice,
        choice: i.choice || null,
        guestSource: i.guestSource || null,
        extras: Array.isArray(i.extras) ? i.extras : [],
        notes: i.notes || "",
        total,
        addedBy: p.name, addedByPhone: phone
      });
    });
  });
  if (!allItems.length) return { statusCode: 400, body: JSON.stringify({ error: "Empty group order" }) };

  const itemsTotal = allItems.reduce((s, i) => s + i.total, 0);
  const fee = wantsDeliveryType ? zone.fee : 0;
  const total = itemsTotal + fee;
  const now = Date.now();
  const address = wantsDeliveryType ? String(delivery.address || "").trim().slice(0, 200) : "";
  const orderRecord = {
    name: group.managerName,
    phone: managerPhone,
    type: delivery.type || "איסוף",
    address: address || null,
    deliveryZone: wantsDeliveryType ? { key: zone.key, label: zone.label, fee: zone.fee } : null,
    courierNotes: courierNotes || null,
    payment: delivery.payment || "cash",
    paymentLabel: delivery.payment === "credit" ? "💳 אשראי טלפוני" : "💵 מזומן",
    items: allItems, couponCode: null, discount: 0, total,
    isGroupOrder: true, groupId,
    ts: now,
    date: new Date(now).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })
  };
  const orderKey = await fbPush("orders", orderRecord);
  await fbPatch("groupOrders/" + groupId, { status: "submitted", submittedAt: now, orderKey });

  const itemsText = buildItemsText(participants);
  await notifyOwner(
    "🍔 *הזמנה קבוצתית חדשה* (" + groupId + ")\n" +
    "━━━━━━━━━━━━━━━━━\n" +
    "👤 *מנהל:* " + group.managerName + "\n📞 *טלפון:* " + managerPhone + "\n" +
    "🚲 *סוג:* " + (delivery.type || "איסוף") +
    (wantsDeliveryType ? "\n🗺️ *אזור משלוח:* " + zone.label + " (💵 " + zone.fee + " ₪)" : "") +
    (address ? "\n📍 *כתובת:* " + address : "") + "\n" +
    "💰 *תשלום:* " + (delivery.payment === "credit" ? "💳 אשראי טלפוני — ⚠️ להתקשר" : "💵 מזומן") + "\n" +
    (courierNotes ? "🛵 *הערה לשליח:* " + courierNotes + "\n" : "") +
    "━━━━━━━━━━━━━━━━━\n📦 *פירוט לפי משתתף:*\n\n" + itemsText + "\n" +
    "━━━━━━━━━━━━━━━━━\n💰 *סה\"כ: " + total + " ₪*"
  );

  return { statusCode: 200, body: JSON.stringify({ success: true, orderKey, total }) };
}

module.exports = { handler };
