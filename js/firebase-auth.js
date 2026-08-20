// js/firebase-auth.js
// Minimal Firebase Authentication client (REST, no SDK) for the ADMIN surfaces only
// (admin.html kitchen board, index.html ?admin=1 panel, marketing/*). It signs the
// admin in with email+password via Identity Toolkit, caches the resulting idToken, and
// exposes it so the Realtime-DB REST helpers can append `?auth=<idToken>`. The DB rules
// then authorize admin writes with `auth.token.admin === true`.
//
// ───────────────────────────────────────────────────────────────────────────────
// STAGED ROLLOUT — this module is DORMANT until you flip CONFIG.enabled to true.
// While enabled === false, token() returns "" and nothing changes (admin writes go
// out unauthenticated, exactly as today). Turn it on only AFTER you have:
//   1. Created a Firebase Auth email/password user for the owner.
//   2. Given that user the custom claim { admin: true } (see SECURITY.md).
//   3. Filled CONFIG.apiKey + CONFIG.adminEmail below.
// Then test, and only then publish the locked security rules.
// ───────────────────────────────────────────────────────────────────────────────

(function () {
  // apiKey/adminEmail come from site.config.js (must be loaded via <script> before this
  // file — see index.html/admin.html) so there's one edit point for both. `enabled` stays
  // here since it's a rollout switch, not a business-identity value.
  const site = (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.firebase) ? SITE_CONFIG.firebase : {};
  const CONFIG = {
    enabled: true,                                   // ← flip to true AFTER setup (step in SECURITY.md)
    apiKey: site.apiKey || "",                        // ← from site.config.js firebase.apiKey
    adminEmail: site.adminEmail || "",                // ← from site.config.js firebase.adminEmail
  };

  const TOKEN_KEY = "6bq_fbauth";                     // sessionStorage: { idToken, refreshToken, expiresAt }
  const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
  const SECURE = "https://securetoken.googleapis.com/v1/token";

  function load() { try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; } }
  function save(s) { try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s)); } catch {} }
  function clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} }

  // Sign in with the owner's password (email is fixed in CONFIG). Returns true on success.
  async function signIn(password) {
    if (!CONFIG.enabled) return false;
    if (!CONFIG.apiKey || !CONFIG.adminEmail) { console.warn("[FBAuth] not configured"); return false; }
    try {
      const r = await fetch(IDENTITY + "?key=" + encodeURIComponent(CONFIG.apiKey), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: CONFIG.adminEmail, password, returnSecureToken: true })
      });
      if (!r.ok) { console.warn("[FBAuth] sign-in failed", r.status); return false; }
      const j = await r.json();
      save({ idToken: j.idToken, refreshToken: j.refreshToken, expiresAt: Date.now() + (Number(j.expiresIn) || 3600) * 1000 });
      return true;
    } catch (e) { console.warn("[FBAuth] sign-in error", e); return false; }
  }

  async function refresh() {
    const s = load();
    if (!s || !s.refreshToken) return false;
    try {
      const r = await fetch(SECURE + "?key=" + encodeURIComponent(CONFIG.apiKey), {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.refreshToken)
      });
      if (!r.ok) { clear(); return false; }
      const j = await r.json();
      save({ idToken: j.id_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
      return true;
    } catch { return false; }
  }

  // Synchronous best-effort token for URL building. Kicks off a background refresh when
  // the token is close to expiry so the next call has a fresh one.
  function token() {
    if (!CONFIG.enabled) return "";
    const s = load();
    if (!s || !s.idToken) return "";
    if (Date.now() > s.expiresAt - 60000) { refresh(); }      // refresh ~1 min before expiry
    return Date.now() < s.expiresAt ? s.idToken : "";
  }

  // Convenience for REST URL building: returns "auth=<token>" or "".
  function authQuery() { const t = token(); return t ? "auth=" + encodeURIComponent(t) : ""; }

  // Decode the JWT payload (claims) of the current idToken, or null.
  function claims() {
    const s = load();
    if (!s || !s.idToken) return null;
    try {
      const payload = s.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(payload))));
    } catch { return null; }
  }
  // True only when the signed-in user actually carries the admin custom claim.
  // (isSignedIn() only means a token exists — this is what the DB rules check.)
  function hasAdminClaim() { const c = claims(); return !!(c && c.admin === true); }

  window.FBAuth = {
    get enabled() { return !!CONFIG.enabled; },
    signIn, refresh, token, authQuery, claims, hasAdminClaim,
    signOut: clear,
    isSignedIn() { return !!token(); }
  };
})();
