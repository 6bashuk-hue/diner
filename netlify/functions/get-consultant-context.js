// netlify/functions/get-consultant-context.js
// Assembles the data the consultant-bridge page needs to build a full external-chat prompt:
// brand + local knowledge plus optional aggregates (orders, published posts, UGC, research).
// No AI calls. Admin-gated.
//
// Required env: FB_URL, ADMIN_PASSWORD

const { BRAND_CONFIG, LOCAL_KNOWLEDGE } = require("../../marketing/lib/brand-config");
const { verifyAdminAuth, unauthorized } = require("../../marketing/lib/auth");
const { fbList } = require("../../marketing/lib/fb");

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!verifyAdminAuth(event)) return unauthorized();

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { includeOrders, includePosts, includeUGC, includeResearch } = body;
  const result = { brand: BRAND_CONFIG, local: LOCAL_KNOWLEDGE };

  try {
    if (includeOrders) {
      const orders = await fbList("orders", { sortField: "ts", limit: 100 });
      result.orders = analyzeOrders(orders);
    }
    if (includePosts) {
      const posts = await fbList("marketingPosts", { sortField: "publishedAt", limit: 10 });
      result.posts = posts.filter(p => p.status === "published");
    }
    if (includeUGC) {
      const ugc = await fbList("ugcSubmissions", { sortField: "submittedAt", limit: 10 });
      result.ugc = ugc.filter(u => u.status === "approved");
    }
    if (includeResearch) {
      result.research = await fbList("localResearch", { sortField: "addedAt", limit: 10 });
    }
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error("get-consultant-context error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

function analyzeOrders(orders) {
  const itemCounts = {};
  const hourCounts = {};
  let totalRevenue = 0;

  orders.forEach(order => {
    (order.items || []).forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || item.qty || 1);
    });
    const date = new Date(order.ts || order.createdAt || Date.now());
    hourCounts[date.getHours()] = (hourCounts[date.getHours()] || 0) + 1;
    totalRevenue += order.total || 0;
  });

  return {
    totalOrders: orders.length,
    totalRevenue: Math.round(totalRevenue),
    avgOrder: Math.round(totalRevenue / (orders.length || 1)),
    topItems: Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    peakHours: Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  };
}

module.exports = { handler, analyzeOrders };
