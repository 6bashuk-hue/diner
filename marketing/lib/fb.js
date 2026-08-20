// marketing/lib/fb.js
// Thin Firebase Realtime Database REST client, matching the pattern already used by
// the existing functions (send-order, mint-win-coupon, daily-backup).
//
// Required env: FB_URL  (e.g. https://YOUR-PROJECT-default-rtdb.REGION.firebasedatabase.app/)
// Optional env: FB_SECRET — a legacy database secret / auth token. When set it is appended
//   as ?auth=... so the server can bypass locked-down security rules. Leave unset to use the
//   public REST endpoint (the existing project's posture).

function base() {
  const url = process.env.FB_URL;
  if (!url) throw new Error("Missing FB_URL env var");
  return url.replace(/\/$/, "");
}

function endpoint(path) {
  let u = `${base()}/${String(path).replace(/^\//, "")}.json`;
  const secret = process.env.FB_SECRET;
  if (secret) u += (u.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(secret);
  return u;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function fbGet(path) {
  const r = await fetch(endpoint(path));
  if (!r.ok) return null;
  return r.json();
}

async function fbSet(path, data) {
  const r = await fetch(endpoint(path), { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`fbSet failed (${r.status}) for ${path}`);
  return r.json().catch(() => null);
}

async function fbPatch(path, data) {
  const r = await fetch(endpoint(path), { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`fbPatch failed (${r.status}) for ${path}`);
  return r.json().catch(() => null);
}

// Push a new child under `path`, returns the generated key.
async function fbPush(path, data) {
  const r = await fetch(endpoint(path), { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`fbPush failed (${r.status}) for ${path}`);
  const j = await r.json();
  return j && j.name;
}

async function fbDelete(path) {
  const r = await fetch(endpoint(path), { method: "DELETE" });
  if (!r.ok) throw new Error(`fbDelete failed (${r.status}) for ${path}`);
  return true;
}

// Read a collection node and return it as an array of { id, ...value }, newest first
// when records carry a numeric `sortKey` field (defaults to addedAt/createdAt/submittedAt/ts).
async function fbList(path, { sortField, limit, desc = true } = {}) {
  const obj = (await fbGet(path)) || {};
  let rows = Object.entries(obj)
    .filter(([, v]) => v && typeof v === "object")
    .map(([id, v]) => ({ id, ...v }));

  const field = sortField || pickSortField(rows[0]);
  if (field) {
    rows.sort((a, b) => (desc ? (b[field] || 0) - (a[field] || 0) : (a[field] || 0) - (b[field] || 0)));
  }
  if (limit) rows = rows.slice(0, limit);
  return rows;
}

function pickSortField(sample) {
  if (!sample) return null;
  return ["addedAt", "createdAt", "submittedAt", "publishedAt", "lastMessageAt", "ts"].find(f => f in sample) || null;
}

module.exports = { fbGet, fbSet, fbPatch, fbPush, fbDelete, fbList };
