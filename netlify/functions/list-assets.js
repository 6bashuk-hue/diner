// netlify/functions/list-assets.js
// Lists marketing assets (UGC photos that were approved). Optional ?source=ugc filter.
// Admin-gated, read-only.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbList } = require("../../marketing/lib/fb");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (!verifyAdminAuth(event)) return unauthorized();

  const source = (event.queryStringParameters && event.queryStringParameters.source) || null;
  try {
    let items = await fbList("marketingAssets", { sortField: "createdAt", limit: 100 });
    if (source) items = items.filter(a => a.type === source);
    return { statusCode: 200, body: JSON.stringify({ items }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
