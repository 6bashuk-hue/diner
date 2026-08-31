/* Injected by scripts/sync-web.js at build time — NOT part of admin.html's source.
 *
 * Fixes: <audio loop> is unreliable in Android's WebView — the sound plays once
 * and stops instead of looping. Standard-compliant browsers never fire `ended`
 * while loop=true, so this listener is a no-op everywhere except the buggy
 * WebView case it targets.
 */
(function () {
  function attach() {
    var el = document.getElementById("kitchen-alert-sound");
    if (!el) return;
    el.addEventListener("ended", function () {
      if (el.loop) {
        el.currentTime = 0;
        el.play().catch(function () {});
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach);
  else attach();
})();
