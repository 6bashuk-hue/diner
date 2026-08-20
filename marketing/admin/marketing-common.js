/* marketing/admin/marketing-common.js
   Shared client helpers for every marketing admin page:
   - password gate (stored in sessionStorage, sent as x-admin-token)
   - api() wrapper for the marketing Netlify functions
   - direct Firebase Realtime DB read/write helpers (same FB_URL as the rest of the site)
   - nav bar, toast, clipboard, minimal markdown renderer, HTML escaping
*/

const FB_URL = SITE_CONFIG.firebase.dbUrl;
const TOKEN_KEY = "6bq_mkt_token";

// Load the shared Firebase Auth module (dormant until enabled). Async-injected here so
// every marketing page picks it up without editing each HTML file; writes below append
// its token once an admin is signed in and the DB rules are locked.
(function () {
  if (!document.querySelector('script[data-fbauth]')) {
    const s = document.createElement("script");
    s.src = "/js/firebase-auth.js"; s.async = true; s.setAttribute("data-fbauth", "1");
    document.head.appendChild(s);
  }
})();
// Append "?auth=<idToken>" to a write URL when the admin is signed into Firebase Auth.
function fbWriteUrl(path) {
  let u = FB_URL + path + ".json";
  const q = (window.FBAuth && window.FBAuth.authQuery) ? window.FBAuth.authQuery() : "";
  if (q) u += (u.includes("?") ? "&" : "?") + q;
  return u;
}

const NAV = [
  ["marketing-dashboard.html", "🏠 דאשבורד"],
  ["content-workspace.html", "✍️ סדנת תוכן"],
  ["consultant-bridge.html", "💬 יועץ"],
  ["threshold-config.html", "🎁 סף מתנה חינם"],
  ["customers.html", "👥 לקוחות"],
  ["push-broadcast.html", "📣 התראות"],
  ["quiz-management.html", "🧠 חידון"],
  ["referrals.html", "🎁 Referrals"],
  ["calendar.html", "📅 לוח שנה"],
  ["ugc-review.html", "📸 UGC"],
  ["assets-library.html", "🖼️ נכסים"],
  ["local-research.html", "📚 מחקר מקומי"],
  ["analytics.html", "📊 ביצועים"]
];

/* ── Auth ──────────────────────────────────── */
function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

function showLogin() {
  if (document.getElementById("mkt-login")) return;
  const el = document.createElement("div");
  el.id = "mkt-login";
  el.innerHTML = `
    <div class="box">
      <div class="logo">🍔 ${SITE_CONFIG.business.name}</div>
      <p class="muted small">מערכת שיווק — כניסת מנהל</p>
      <input id="mkt-pass" type="password" placeholder="סיסמה" autocomplete="current-password" />
      <div class="btn-row" style="justify-content:center;margin-top:0.8rem;">
        <button class="btn" id="mkt-login-btn">כניסה</button>
      </div>
      <div class="err" id="mkt-login-err">סיסמה שגויה</div>
    </div>`;
  document.body.appendChild(el);
  const pass = el.querySelector("#mkt-pass");
  const err = el.querySelector("#mkt-login-err");
  const submit = async () => {
    const val = pass.value;
    if (!val) return;
    try {
      const res = await fetch("/.netlify/functions/admin-login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: val })
      });
      const data = await res.json();
      if (data.ok) {
        if (window.FBAuth && window.FBAuth.enabled) { try { await window.FBAuth.signIn(val); } catch {} }
        setToken(val); el.remove(); if (window.onMktReady) window.onMktReady();
      }
      else { err.style.display = "block"; }
    } catch { err.style.display = "block"; }
  };
  el.querySelector("#mkt-login-btn").addEventListener("click", submit);
  pass.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  pass.focus();
}

// Run `cb` once the admin is authenticated. Pages set window.onMktReady before calling this.
function requireAuth(cb) {
  window.onMktReady = cb;
  if (getToken()) cb(); else showLogin();
}

/* ── Marketing function API ────────────────── */
async function api(fnName, body, method = "POST") {
  const opts = { method, headers: { "x-admin-token": getToken() } };
  if (method !== "GET") { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body || {}); }
  const res = await fetch("/.netlify/functions/" + fnName, opts);
  if (res.status === 401) { clearToken(); showLogin(); throw new Error("יש להתחבר מחדש"); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && data.error) || ("שגיאה " + res.status));
  return data;
}

/* ── Firebase REST (read-mostly, client side) ─ */
async function fbGet(path) {
  const r = await fetch(FB_URL + path + ".json");
  return r.ok ? r.json() : null;
}
async function fbSet(path, data) {
  return fetch(fbWriteUrl(path), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
async function fbPush(path, data) {
  const r = await fetch(fbWriteUrl(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const j = await r.json(); return j && j.name;
}
async function fbList(path) {
  const obj = (await fbGet(path)) || {};
  return Object.entries(obj).filter(([, v]) => v && typeof v === "object").map(([id, v]) => ({ id, ...v }));
}

/* ── UI helpers ────────────────────────────── */
function buildNav(active) {
  const links = NAV.map(([href, label]) =>
    `<a href="${href}" class="${href === active ? "active" : ""}">${label}</a>`).join("");
  return `<nav class="mkt-nav"><div class="mkt-nav-inner">
      <div class="mkt-brand">${SITE_CONFIG.business.name} <span>· שיווק</span></div>
      <div class="mkt-links">${links}</div>
      <div style="display:flex;gap:0.3rem;flex-wrap:wrap;">
        <a href="/" class="btn ghost sm" style="text-decoration:none;background:#fdf8f0;">🏪 לאתר</a>
        <a href="/admin.html" class="btn ghost sm" style="text-decoration:none;background:#e3f2fd;">🍳 מטבח</a>
        <a href="/?admin=1" class="btn ghost sm" style="text-decoration:none;background:#fff0e6;">⚙️ הגדרות</a>
      </div>
    </div></nav>`;
}
function renderNav(active) {
  const host = document.getElementById("nav");
  if (host) host.outerHTML = buildNav(active);
}

let toastTimer;
function toast(msg) {
  let t = document.getElementById("mkt-toast");
  if (!t) { t = document.createElement("div"); t.id = "mkt-toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("📋 הועתק"); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand("copy"); toast("📋 הועתק"); } catch { toast("לא הצלחתי להעתיק"); }
    ta.remove();
  }
}

// Minimal, safe markdown -> HTML (escapes first, then applies a small subset).
function mdToHtml(md) {
  let html = escapeHtml(md);
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>")
             .replace(/^## (.*)$/gm, "<h2>$1</h2>")
             .replace(/^# (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
             .replace(/`([^`]+?)`/g, "<code>$1</code>");
  // group consecutive list items
  html = html.replace(/(?:^|\n)((?:[-*] .*(?:\n|$))+)/g, (m, block) => {
    const items = block.trim().split(/\n/).map(l => "<li>" + l.replace(/^[-*]\s+/, "") + "</li>").join("");
    return "\n<ul>" + items + "</ul>";
  });
  html = html.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
  return html;
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
