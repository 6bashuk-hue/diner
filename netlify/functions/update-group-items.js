// netlify/functions/update-group-items.js
// Public POST. Upserts a participant's items in a group order and recomputes the
// group's totalAmount. Used as both "join" and "update my cart".
//
// Every line is re-priced against the live menu/extras/guest config (same trusted
// source place-order.js uses for solo orders) — a participant can no longer deflate
// the group total by POSTing a fake `total`, and guest ("עוד מהשכונה") dishes are
// priced the same way here as in a solo order.
//
// Required env: FB_URL

const { fbGet, fbPatch, fbSet } = require("../../marketing/lib/fb");
const SITE_CONFIG = require("../../site.config.js");
const {
  PricingError, flattenPrices, flattenGuestPrices, flattenGuestExtraPrices, priceCart
} = require("./lib/pricing");

function normalizePhone(p) { return String(p || "").replace(/\D/g, "").replace(/^972/, "0"); }

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const groupId = String(body.groupId || "");
  const phone = normalizePhone(body.phone);
  const name = String(body.name || "").trim().slice(0, 60);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!groupId || !phone || !name) {
    return { statusCode: 400, body: JSON.stringify({ error: "groupId, phone, name required" }) };
  }
  // groupId is a Firebase path segment — reject separators to prevent traversal.
  if (!/^[A-Za-z0-9_-]+$/.test(groupId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid groupId" }) };
  }

  let group;
  try {
    group = await fbGet("groupOrders/" + groupId);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "שגיאה בטעינת הקבוצה, נסה שוב", detail: e.message }) };
  }
  if (!group) return { statusCode: 404, body: JSON.stringify({ error: "Group not found" }) };
  if (group.status !== "open") return { statusCode: 410, body: JSON.stringify({ error: "Group already submitted" }) };
  if (group.expiresAt < Date.now()) {
    return { statusCode: 410, body: JSON.stringify({ error: "Group expired" }) };
  }

  let orderItems, totalAmount, subtotal;
  try {
    // ── Re-price every line against the live menu (same trusted source as place-order.js) ──
    const [menuNode, extrasNode, adminState] = await Promise.all([
      fbGet("menu"), fbGet("siteSettings/extras"), fbGet("admin_state")
    ]);
    const menuPrices = flattenPrices(menuNode);
    const extraPrices = flattenPrices(extrasNode);
    const guestPrices = flattenGuestPrices(SITE_CONFIG.guestMenus);
    const guestExtraPrices = flattenGuestExtraPrices(SITE_CONFIG.guestMenus);
    const soldOut = new Set((adminState && Array.isArray(adminState.soldOut)) ? adminState.soldOut : []);
    const menuLoaded = menuPrices.size > 0;

    try {
      ({ orderItems } = priceCart(items, { menuPrices, extraPrices, guestPrices, guestExtraPrices, soldOut, menuLoaded }));
    } catch (e) {
      if (e instanceof PricingError) return { statusCode: e.statusCode, body: JSON.stringify({ error: e.message }) };
      throw e;
    }

    subtotal = orderItems.reduce((s, i) => s + i.total, 0);
    await fbSet("groupOrders/" + groupId + "/participants/" + phone, {
      name, items: orderItems, subtotal, updatedAt: Date.now(),
      joinedAt: (group.participants && group.participants[phone] && group.participants[phone].joinedAt) || Date.now()
    });

    const fresh = await fbGet("groupOrders/" + groupId + "/participants");
    totalAmount = Object.values(fresh || {}).reduce((s, p) => s + (p.subtotal || 0), 0);
    await fbPatch("groupOrders/" + groupId, { totalAmount });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "שגיאה בשמירת העגלה, נסה שוב", detail: e.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true, totalAmount, items: orderItems, subtotal }) };
}

module.exports = { handler };
