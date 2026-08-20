// netlify/functions/save-consultation-summary.js
// Persists the owner's own summary of an external consultant chat. No AI calls. Admin-gated.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbPush } = require("../../marketing/lib/fb");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!verifyAdminAuth(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { summary, question = "", topic = null } = body;
  if (!summary) return { statusCode: 400, body: JSON.stringify({ error: "summary is required" }) };

  try {
    const id = await fbPush("consultationSummaries", {
      summary, question, topic, timestamp: body.timestamp || Date.now()
    });
    return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
  } catch (error) {
    console.error("save-consultation-summary error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

module.exports = { handler };
