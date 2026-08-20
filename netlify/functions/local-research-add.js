// netlify/functions/local-research-add.js
// Stores a successful local Arad post for the owner's research bank. No AI analysis —
// the owner writes their own takeaway, and the content-workspace prompt feeds these
// posts to the external Claude chat as style examples. Admin-gated.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbPush, fbList } = require("../../marketing/lib/fb");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (!verifyAdminAuth(event)) return unauthorized();
  if (event.httpMethod === "GET") return listResearch();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { businessName, postText, category, engagement = {}, userAnalysis = "" } = body;
  if (!businessName || !postText) {
    return { statusCode: 400, body: JSON.stringify({ error: "businessName and postText are required" }) };
  }

  try {
    const id = await fbPush("localResearch", {
      businessName, postText, category, engagement, userAnalysis,
      addedAt: Date.now()
    });
    return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
  } catch (error) {
    console.error("Local research add error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

async function listResearch() {
  try {
    const rows = await fbList("localResearch", { sortField: "addedAt", limit: 100 });
    return { statusCode: 200, body: JSON.stringify({ items: rows }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
