/* Injected by scripts/sync-web.js at build time — NOT part of admin.html's source.
 *
 * Fixes: relative fetch('/.netlify/functions/...') calls break inside Capacitor
 * because the app's own origin is https://localhost, not the real site domain.
 * Rewrites those calls to an absolute URL and routes them through the native
 * NativeHttp plugin (plain HttpURLConnection, see NativeHttpPlugin.kt) instead
 * of the WebView's fetch — which sidesteps CORS entirely, since CORS is a
 * browser/WebView concept that a native HTTP client never triggers.
 *
 * No-op outside Capacitor (e.g. testing admin.html directly in a browser):
 * window.fetch is left completely untouched there.
 */
(function () {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var PROD_ORIGIN = "__PROD_ORIGIN__"; // replaced by scripts/sync-web.js at build time

  var NativeHttp = window.Capacitor.Plugins && window.Capacitor.Plugins.NativeHttp;
  if (!NativeHttp) {
    console.warn("[native-bridge] NativeHttp plugin unavailable — relative fetch() calls will fail in-app");
    return;
  }

  var originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    init = init || {};
    var url = typeof input === "string" ? input : (input && input.url) || "";

    // Only rewrite our own relative API calls. Absolute URLs (Firebase REST,
    // Google Identity Toolkit, the Sentry CDN script) already work fine as-is
    // and go through the normal WebView fetch untouched.
    if (!url.startsWith("/")) return originalFetch(input, init);

    var fullUrl = PROD_ORIGIN + url;
    var method = (init.method || "GET").toUpperCase();

    var headers = {};
    if (init.headers) {
      if (typeof Headers !== "undefined" && init.headers instanceof Headers) {
        init.headers.forEach(function (value, key) { headers[key] = value; });
      } else {
        Object.keys(init.headers).forEach(function (key) { headers[key] = init.headers[key]; });
      }
    }

    var body = init.body;
    if (body != null && typeof body !== "string") {
      try { body = JSON.stringify(body); } catch (e) { /* leave as-is */ }
    }

    return NativeHttp.request({ url: fullUrl, method: method, headers: headers, body: body })
      .then(function (res) {
        return new Response(res.data, { status: res.status, headers: res.headers || {} });
      });
  };
})();
