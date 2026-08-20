// marketing/lib/rate-guard.js
// Shared, cross-instance per-IP daily cap for the coupon-minting endpoints. Unlike the
// in-memory ipLastHit maps (which only live per warm Lambda), this persists the count in
// Firebase under `rateGuard/<bucket>/<date>/<ipKey>`, so parallel instances share it.
// The node is function-only (no security-rule entry → default-deny for clients; the
// functions reach it via FB_SECRET).
//
// Note: this is a soft limit (read-then-increment, not atomic) — fine for abuse control.

const { fbGet, fbSet } = require("./fb");

function dayKey() { return new Date().toISOString().slice(0, 10); }
function ipKey(ip) { return String(ip || "unknown").replace(/[.#$\[\]\/]/g, "_").slice(0, 45); }

// Returns true if this IP has already hit `max` for `bucket` today (and does NOT count
// the current call in that case). Otherwise records the hit and returns false.
async function overDailyLimit(bucket, ip, max) {
  try {
    const path = "rateGuard/" + bucket + "/" + dayKey() + "/" + ipKey(ip);
    const cur = Number(await fbGet(path)) || 0;
    if (cur >= max) return true;
    await fbSet(path, cur + 1);
    return false;
  } catch {
    return false; // never block a legitimate user because the guard itself failed
  }
}

module.exports = { overDailyLimit };
