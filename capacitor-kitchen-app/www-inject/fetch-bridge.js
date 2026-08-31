/* Injected by scripts/sync-web.js at build time — NOT part of admin.html's source.
 *
 * Routes every fetch() call through the native NativeHttp plugin (plain
 * HttpURLConnection, see NativeHttpPlugin.kt) instead of the WebView's own
 * fetch. Two separate problems this fixes:
 *
 * 1. Relative fetch('/.netlify/functions/...') calls break inside Capacitor
 *    because the app's own origin is https://localhost, not the real site
 *    domain — so they're rewritten to an absolute URL first.
 * 2. Absolute cross-origin calls (Firebase REST writes in particular —
 *    fbSet()/fbDelete() in admin.html) can still fail with a plain "network
 *    error" from https://localhost as the calling origin, even though the
 *    exact same request works fine from a real https:// origin in a normal
 *    browser: CORS preflight behavior for non-GET requests is where this
 *    showed up (PUT/DELETE silently failing while GET kept working). Native
 *    HttpURLConnection never triggers a browser CORS check at all — for any
 *    URL, not just our own relative ones — so this sidesteps the whole class
 *    of issue rather than special-casing the one endpoint that surfaced it.
 *
 * No-op outside Capacitor (e.g. testing admin.html directly in a browser):
 * window.fetch is left completely untouched there.
 */
(function () {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var PROD_ORIGIN = "__PROD_ORIGIN__"; // replaced by scripts/sync-web.js at build time

  var NativeHttp = window.Capacitor.Plugins && window.Capacitor.Plugins.NativeHttp;
  if (!NativeHttp) {
    console.warn("[native-bridge] NativeHttp plugin unavailable — fetch() calls will fail in-app");
    return;
  }

  var originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    init = init || {};
    var url = typeof input === "string" ? input : (input && input.url) || "";

    // Anything that isn't a plain http(s) URL (blob:, data:, etc.) — none of
    // admin.html's own calls are, but stay out of the way of anything that is.
    if (!/^https?:\/\//.test(url) && !url.startsWith("/")) return originalFetch(input, init);

    var fullUrl = url.startsWith("/") ? PROD_ORIGIN + url : url;
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
