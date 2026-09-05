// netlify/functions/create-group-order.js
// Public POST. The manager creates a group order shell; everyone joins via the
// returned shareLink. Group expires 24h after creation.
//
// Required env: FB_URL

const { fbSet } = require("../../marketing/lib/fb");
const SITE_CONFIG = require("../../site.config.js");

function normalizePhone(p) { return String(p || "").replace(/\D/g, "").replace(/^972/, "0"); }
function genGroupId() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "GRP-" + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const managerPhone = normalizePhone(body.managerPhone);
  const managerName = String(body.managerName || "").trim();
  if (!managerPhone || !managerName) {
    return { statusCode: 400, body: JSON.stringify({ error: "managerPhone and managerName required" }) };
  }

  const groupId = genGroupId();
  const now = Date.now();
  try {
    await fbSet("groupOrders/" + groupId, {
      groupId, createdAt: now, expiresAt: now + 86400000,
      status: "open",
      managerPhone, managerName,
      participants: {
        [managerPhone]: { name: managerName, joinedAt: now, items: [], subtotal: 0 }
      },
      totalAmount: 0
    });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "שגיאה ביצירת הקבוצה, נסה שוב", detail: e.message }) };
  }

  const origin = (event.headers && (event.headers.origin || ("https://" + event.headers.host))) || SITE_CONFIG.business.canonicalUrl;
  return {
    statusCode: 200,
    body: JSON.stringify({
      groupId,
      shareLink: origin + "/group.html?id=" + groupId
    })
  };
}

module.exports = { handler };
