// netlify/functions/get-daily-question.js
// Public GET. Returns today's quiz question (without the correct answer / funFact).
// Rotates to a new random question every 24h via dailyQuiz/rotation.
//
// Required env: FB_URL

const { fbGet, fbPatch } = require("../../marketing/lib/fb");

async function handler() {
  const quiz = await fbGet("dailyQuiz");
  const questions = (quiz && Array.isArray(quiz.questions)) ? quiz.questions : [];
  if (!questions.length) {
    return { statusCode: 404, body: JSON.stringify({ error: "no_questions" }) };
  }
  const now = Date.now();
  const rotation = (quiz && quiz.rotation) || { currentQuestionId: null, lastRotatedAt: 0 };
  let currentId = rotation.currentQuestionId;

  if (!currentId || (now - (rotation.lastRotatedAt || 0)) >= 86400000) {
    const pool = questions.filter(q => q.id !== rotation.currentQuestionId);
    const pick = (pool.length ? pool : questions)[Math.floor(Math.random() * (pool.length || questions.length))];
    currentId = pick.id;
    try { await fbPatch("dailyQuiz/rotation", { currentQuestionId: currentId, lastRotatedAt: now }); } catch {}
  }
  const q = questions.find(x => x.id === currentId) || questions[0];
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ id: q.id, question: q.question, options: q.options })
  };
}

module.exports = { handler };
