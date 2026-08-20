// netlify/functions/submit-quiz-answer.js
// Public POST. Records a customer's daily quiz answer. If correct, mints a one-time
// ARAD-XXXX coupon worth ₪5 off, valid until end of day. One attempt per question
// per phone per day. Light per-IP rate limit (in-memory, lives per function instance).
//
// Required env: FB_URL

const { fbGet, fbSet } = require("../../marketing/lib/fb");
const { overDailyLimit } = require("../../marketing/lib/rate-guard");

const MAX_PER_IP_PER_DAY = 5;     // a real customer answers a couple of times; bots can't farm
const MIN_INTERVAL_MS = 800;
const ipLastHit = new Map();
function tooFrequent(ip) {
  const now = Date.now();
  const prev = ipLastHit.get(ip) || 0;
  ipLastHit.set(ip, now);
  if (ipLastHit.size > 500) for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
  return now - prev < MIN_INTERVAL_MS;
}
function normalizePhone(p) {
  return String(p || "").replace(/\D/g, "").replace(/^972/, "0");
}
function rand6() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function todayKey() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooFrequent(ip)) return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  // Cross-instance daily cap per IP so fake phones can't farm ₪5 coupons en masse.
  if (await overDailyLimit("quiz", ip, MAX_PER_IP_PER_DAY)) {
    return { statusCode: 429, body: JSON.stringify({ error: "הגעת למכסת הניסיונות היומית" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const phone = normalizePhone(body.phone);
  const questionId = String(body.questionId || "");
  const selectedIndex = Number(body.selectedIndex);
  if (!phone || !questionId || !Number.isFinite(selectedIndex)) {
    return { statusCode: 400, body: JSON.stringify({ error: "phone, questionId, selectedIndex required" }) };
  }
  // questionId becomes a Firebase path segment — reject anything with separators
  // so a crafted id (e.g. "../coupons/X") can't traverse into other nodes.
  if (!/^[A-Za-z0-9_-]+$/.test(questionId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid questionId" }) };
  }

  const today = todayKey();
  const attemptPath = "quizAttempts/" + phone + "/" + today + "/" + questionId;
  const existing = await fbGet(attemptPath);
  if (existing) return { statusCode: 429, body: JSON.stringify({ error: "כבר ענית היום על השאלה הזו" }) };

  const quiz = await fbGet("dailyQuiz");
  const questions = (quiz && Array.isArray(quiz.questions)) ? quiz.questions : [];
  const q = questions.find(x => x.id === questionId);
  if (!q) return { statusCode: 404, body: JSON.stringify({ error: "Question not found" }) };

  const correct = Number(q.correctIndex) === selectedIndex;
  await fbSet(attemptPath, { correct, selectedIndex, at: Date.now() });

  let couponCode = null;
  if (correct) {
    couponCode = "ARAD-" + rand6();
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    await fbSet("coupons/" + couponCode, {
      type: "fixed", value: 5, active: true,
      usedCount: 0, used: false, oneTime: true,
      createdAt: Date.now(), expiresAt: eod.getTime(),
      wonByPhone: phone, source: "quiz"
    });
  }

  // Note: correctIndex is intentionally NOT returned — leaking it let a script always
  // answer correctly on a fresh phone. We only reveal the right answer once the user
  // already answered (correct=true means they got it; otherwise they just see "wrong").
  return {
    statusCode: 200,
    body: JSON.stringify({ correct, couponCode, funFact: correct ? (q.funFact || "") : "" })
  };
}

module.exports = { handler };
