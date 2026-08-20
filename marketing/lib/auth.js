// marketing/lib/auth.js
// Admin gate for marketing functions. Reuses the existing ADMIN_PASSWORD env var.
// Admin pages prompt for the password and send it back as the `x-admin-token` header.
// (ADMIN_SECRET is accepted as a fallback for compatibility with the original spec.)

const crypto = require("crypto");

// Constant-time comparison so the admin password can't be recovered byte-by-byte
// via response timing. Hashing both sides first keeps timingSafeEqual happy even
// when the lengths differ (it throws on unequal-length buffers otherwise).
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyAdminAuth(event) {
  const headers = (event && event.headers) || {};
  const token = headers["x-admin-token"] || headers["X-Admin-Token"] || "";
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  return !!expected && token.length > 0 && safeEqual(token, expected);
}

function unauthorized() {
  return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
}

module.exports = { verifyAdminAuth, unauthorized };
