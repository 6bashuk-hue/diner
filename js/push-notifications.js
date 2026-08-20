// js/push-notifications.js
// Client library for Web Push subscription. Loads the public VAPID key from
// /.netlify/functions/get-vapid-key on first use, registers the existing /sw.js,
// and exposes window.PushNotifications.{isSupported, getPermission, subscribe,
// unsubscribe, isSubscribed}. iOS Safari requires the site be installed to home
// screen as a PWA; isPushSupported() will return false otherwise.

(function () {
  let cachedVapidKey = null;

  function isPushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function getPermissionState() {
    if (!isPushSupported()) return "unsupported";
    return Notification.permission;
  }

  async function getVapidPublicKey() {
    if (cachedVapidKey) return cachedVapidKey;
    const r = await fetch("/.netlify/functions/get-vapid-key");
    if (!r.ok) throw new Error("vapid-key-unavailable");
    const j = await r.json();
    cachedVapidKey = j.publicKey;
    return cachedVapidKey;
  }

  async function registerSW() {
    if (!isPushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return reg;
    } catch (e) { console.warn("SW register failed", e); return null; }
  }

  async function subscribeToPush(customerPhone) {
    if (!isPushSupported()) return { success: false, reason: "unsupported" };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { success: false, reason: "denied" };
    const reg = await registerSW();
    if (!reg) return { success: false, reason: "sw_failed" };

    let publicKey;
    try { publicKey = await getVapidPublicKey(); }
    catch { return { success: false, reason: "vapid_key_unavailable" }; }

    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      const res = await fetch("/.netlify/functions/save-push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customerPhone, subscription: sub.toJSON() })
      });
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j.error || ""; } catch {}
        throw new Error("save_failed (" + res.status + ")" + (detail ? ": " + detail : ""));
      }
      return { success: true };
    } catch (e) {
      console.warn("subscribe failed", e);
      return { success: false, reason: "subscription_failed", error: e.message };
    }
  }

  async function unsubscribeFromPush(customerPhone) {
    if (!isPushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await fetch("/.netlify/functions/remove-push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customerPhone })
      });
    }
  }

  async function isSubscribed() {
    if (!isPushSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch { return false; }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  window.PushNotifications = {
    isSupported: isPushSupported,
    getPermission: getPermissionState,
    subscribe: subscribeToPush,
    unsubscribe: unsubscribeFromPush,
    isSubscribed
  };
})();
