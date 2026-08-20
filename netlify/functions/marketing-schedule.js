// netlify/functions/marketing-schedule.js
// CRUD for the marketing post pipeline (marketingPosts node). One node carries the whole
// lifecycle via `status`: draft → scheduled → published, plus manual analytics.
// Used by the generator (save draft), calendar (schedule), and analytics (manual numbers).
// Admin-gated.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbGet, fbSet, fbPatch, fbPush, fbDelete, fbList } = require("../../marketing/lib/fb");

const VALID_STATUS = ["draft", "scheduled", "published"];

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (!verifyAdminAuth(event)) return unauthorized();

  if (event.httpMethod === "GET") return listPosts();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const action = body.action || "add";

  try {
    switch (action) {
      case "add": return await addPost(body);
      case "save": return await savePost(body);
      case "update": return await updatePost(body);
      case "delete": return await deletePost(body);
      case "setStatus": return await setStatus(body);
      case "setAnalytics": return await setAnalytics(body);
      case "list": return await listPosts();
      default: return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
    }
  } catch (error) {
    console.error("Marketing schedule error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

async function addPost(body) {
  const { content, scheduledFor = null, time = null, platform = "both", status = "draft" } = body;
  if (!content) return { statusCode: 400, body: JSON.stringify({ error: "content is required" }) };

  const record = {
    content: typeof content === "string" ? { text: content } : content,
    scheduledFor, time, platform,
    status: VALID_STATUS.includes(status) ? status : "draft",
    createdAt: Date.now()
  };
  if (record.status === "published") record.publishedAt = Date.now();

  const id = await fbPush("marketingPosts", record);
  return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
}

// Save a full post record built client-side (content-workspace paste-back).
async function savePost(body) {
  const data = body.postData;
  if (!data || !data.content) return { statusCode: 400, body: JSON.stringify({ error: "postData.content is required" }) };

  const status = VALID_STATUS.includes(data.status) ? data.status : "draft";
  const record = {
    content: typeof data.content === "string" ? { text: data.content } : data.content,
    metadata: data.metadata || null,
    platform: data.platform || "both",
    scheduledFor: data.scheduledFor || null,
    time: data.time || null,
    status,
    createdAt: (data.metadata && data.metadata.createdAt) || Date.now()
  };
  if (status === "published") record.publishedAt = Date.now();

  const id = await fbPush("marketingPosts", record);
  return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
}

async function updatePost(body) {
  const { id, ...rest } = body;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "id is required" }) };
  delete rest.action;
  await fbPatch("marketingPosts/" + id, { ...rest, updatedAt: Date.now() });
  return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
}

async function deletePost(body) {
  if (!body.id) return { statusCode: 400, body: JSON.stringify({ error: "id is required" }) };
  await fbDelete("marketingPosts/" + body.id);
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
}

async function setStatus(body) {
  const { id, status } = body;
  if (!id || !VALID_STATUS.includes(status)) {
    return { statusCode: 400, body: JSON.stringify({ error: "id and valid status required" }) };
  }
  const patch = { status, updatedAt: Date.now() };
  if (status === "published") {
    const existing = await fbGet("marketingPosts/" + id);
    if (!existing || !existing.publishedAt) patch.publishedAt = Date.now();
  }
  await fbPatch("marketingPosts/" + id, patch);
  return { statusCode: 200, body: JSON.stringify({ id, status, success: true }) };
}

async function setAnalytics(body) {
  const { id, analytics } = body;
  if (!id || !analytics) return { statusCode: 400, body: JSON.stringify({ error: "id and analytics required" }) };
  const clean = {};
  ["reach", "impressions", "likes", "comments", "shares", "saves", "clicks"].forEach(k => {
    if (analytics[k] != null) clean[k] = Number(analytics[k]) || 0;
  });
  await fbPatch("marketingPosts/" + id, { manualAnalytics: clean, analyticsUpdatedAt: Date.now() });
  return { statusCode: 200, body: JSON.stringify({ id, success: true }) };
}

async function listPosts() {
  const rows = await fbList("marketingPosts", { sortField: "createdAt", limit: 500 });
  return { statusCode: 200, body: JSON.stringify({ items: rows }) };
}

module.exports = { handler };
