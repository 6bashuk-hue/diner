// netlify/functions/get-knowledge.js
// Returns the static brand + local knowledge so the admin pages can assemble copy-paste
// prompts client-side for the owner's external Claude chat. No AI calls. Admin-gated.
//
// Required env: ADMIN_PASSWORD

const { BRAND_CONFIG, LOCAL_KNOWLEDGE } = require("../../marketing/lib/brand-config");
const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (!verifyAdminAuth(event)) return unauthorized();
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand: BRAND_CONFIG, local: LOCAL_KNOWLEDGE })
  };
}

module.exports = { handler };
