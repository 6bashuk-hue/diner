/* Injected by scripts/sync-web.js at build time — NOT part of admin.html's source.
 * Placed AFTER the WebUSB block in the built page (see sync-web.js), so this
 * runs after admin.html's own IIFE has already assigned
 * window.escposConnect/escposIsConnected/escposPrintOrder — otherwise that
 * later assignment would silently overwrite ours.
 *
 * Why this exists: admin.html's WebUSB code checks `"usb" in navigator`, which
 * is false in Android's WebView — navigator.usb (WebUSB) simply isn't
 * implemented there. So inside the Capacitor app, tapping "חבר מדפסת USB"
 * always hit the "browser doesn't support WebUSB" alert, and printOrder()
 * always fell through to window.print(). This overrides the three globals
 * with versions backed by the native UsbThermalPrinter plugin instead —
 * reusing window.escposBuildBytes (= admin.html's own buildEscpos) untouched,
 * so the exact same receipt rendering/ESC-POS encoding is used either way;
 * only the transport (WebUSB vs. native USB) changes.
 *
 * No-op outside Capacitor: admin.html's original WebUSB implementation is
 * left in place there.
 */
(function () {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var UsbThermalPrinter = window.Capacitor.Plugins && window.Capacitor.Plugins.UsbThermalPrinter;
  if (!UsbThermalPrinter) {
    console.warn("[native-printer] UsbThermalPrinter plugin unavailable");
    return;
  }
  if (typeof window.escposBuildBytes !== "function") {
    console.warn("[native-printer] window.escposBuildBytes missing — WebUSB block in admin.html changed?");
    return;
  }

  var connected = false;

  function setBtn(isConnected) {
    var b = document.getElementById("escpos-connect-btn");
    if (!b) return;
    b.classList.toggle("connected", isConnected);
    b.textContent = isConnected ? "🖨 מדפסת USB מחוברת" : "🔌 חבר מדפסת USB";
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // User-gesture connect — shows the Android USB permission dialog if needed.
  async function nativeConnect() {
    try {
      await UsbThermalPrinter.connect({});
      connected = true;
      setBtn(true);
      if (typeof toast === "function") toast("🖨 מדפסת USB חוברה — הדפסה ישירה פעילה");
    } catch (e) {
      connected = false;
      setBtn(false);
      alert("לא הצלחתי להתחבר למדפסת USB.\n\n" + (e && e.message ? e.message : e));
    }
  }

  function nativeIsConnected() {
    return connected;
  }

  async function nativePrintOrder(o) {
    if (!connected) return false;
    try {
      var bytes = window.escposBuildBytes(o); // same renderer as WebUSB, untouched
      await UsbThermalPrinter.printBytes({ data: bytesToBase64(bytes) });
      return true;
    } catch (e) {
      console.warn("[native-printer] print failed:", e);
      return false;
    }
  }

  window.escposConnect = nativeConnect;
  window.escposIsConnected = nativeIsConnected;
  window.escposPrintOrder = nativePrintOrder;

  // Silent reconnect on load to a previously-granted printer — no dialog,
  // mirrors admin.html's own escposReconnect() for WebUSB.
  UsbThermalPrinter.reconnectSilently({})
    .then(function (res) {
      if (res && res.connected) {
        connected = true;
        setBtn(true);
      }
    })
    .catch(function (e) {
      console.warn("[native-printer] silent reconnect failed:", e);
    });
})();
