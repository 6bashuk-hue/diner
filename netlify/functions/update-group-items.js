// netlify/functions/update-group-items.js
// Public POST. Upserts a participant's items in a group order and recomputes the
// group's totalAmount. Used as both "join" and "update my cart".
//
// Required env: FB_URL

const { fbGet, fbPatch, fbSet } = require("../../marketing/lib/fb");

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

  const group = await fbGet("groupOrders/" + groupId);
  if (!group) return { statusCode: 404, body: JSON.stringify({ error: "Group not found" }) };
  if (group.status !== "open") return { statusCode: 410, body: JSON.stringify({ error: "Group already submitted" }) };
  if (group.expiresAt < Date.now()) {
    return { statusCode: 410, body: JSON.stringify({ error: "Group expired" }) };
  }

  // Items shape: [{ name, basePrice, extras:[{name,qty,price}], notes, total }]
  // Fallback for older callers that send { price, qty }.
  // Clamp each line to a non-negative, finite number so a participant can't POST a
  // negative/NaN total to deflate the group total (full server-side re-pricing
  // against the menu would be stronger — tracked as a follow-up).
  const lineTotal = (i) => {
    const t = Number.isFinite(i.total) ? Number(i.total) : (Number(i.price) || 0) * (Number(i.qty) || 1);
    return Math.max(0, Number.isFinite(t) ? t : 0);
  };
  const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
  await fbSet("groupOrders/" + groupId + "/participants/" + phone, {
    name, items, subtotal, updatedAt: Date.now(),
    joinedAt: (group.participants && group.participants[phone] && group.participants[phone].joinedAt) || Date.now()
  });

  const fresh = await fbGet("groupOrders/" + groupId + "/participants");
  const totalAmount = Object.values(fresh || {}).reduce((s, p) => s + (p.subtotal || 0), 0);
  await fbPatch("groupOrders/" + groupId, { totalAmount });

  return { statusCode: 200, body: JSON.stringify({ success: true, totalAmount }) };
}

module.exports = { handler };
