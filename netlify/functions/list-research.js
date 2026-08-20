// netlify/functions/list-research.js
// Lists the local research bank (newest first) for the content-workspace prompt builder.
// Admin-gated, read-only.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbList } = require("../../marketing/lib/fb");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (!verifyAdminAuth(event)) return unauthorized();
  try {
    const items = await fbList("localResearch", { sortField: "addedAt", limit: 50 });
    return { statusCode: 200, body: JSON.stringify({ items }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
