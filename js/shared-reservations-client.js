// shared-reservations-client.js
// Thin fetch wrapper for the shared table-reservation backend (see API.md in
// the shared-reservations repo for the full contract). Identical across all
// three brand sites on purpose — this file is never brand-specific.
//
// Reads window.SHARED_RESERVATIONS_CONFIG (baseUrl, source) which every page
// using this file must load first. If window.SHARED_RESERVATIONS_ADMIN_CONFIG
// is also present (loaded only on admin surfaces, and only after login — see
// reservations-admin.js), its adminKey is attached to every call automatically
// so admin screens never have to remember to add it themselves.
(function () {
  async function callReservationsApi(name, body) {
    const cfg = window.SHARED_RESERVATIONS_CONFIG || {};
    if (!cfg.baseUrl) {
      return { success: false, code: "NOT_CONFIGURED", error: "מערכת ההזמנות לא הוגדרה באתר זה" };
    }
    const adminCfg = window.SHARED_RESERVATIONS_ADMIN_CONFIG;
    const payload = Object.assign({}, body || {});
    if (adminCfg && adminCfg.adminKey && payload.adminKey === undefined) {
      payload.adminKey = adminCfg.adminKey;
    }

    let response;
    try {
      response = await fetch(cfg.baseUrl.replace(/\/$/, "") + "/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { success: false, code: "NETWORK_ERROR", error: "בעיית תקשורת - בדקו את החיבור לאינטרנט ונסו שוב" };
    }

    try {
      return await response.json();
    } catch (e) {
      return { success: false, code: "BAD_RESPONSE", error: "שגיאה בקריאת התשובה מהשרת" };
    }
  }

  window.SharedReservationsAPI = { call: callReservationsApi };
})();
