// netlify/functions/lib/delivery/message.js
// Pure text/keyboard builders for the courier delivery notification. Kept free of any
// Telegram-specific API calls so the same functions work for a future SMS/WhatsApp
// provider — see provider.js for the channel abstraction.

function orderDisplayNumber(orderKey) {
  return String(orderKey || "").slice(-6).toUpperCase();
}

function orderAddress(order) {
  // Covers both order schemas in play across the three businesses: this repo (and
  // adelasite) use `address` (free text) or `deliveryZone.label` (a named zone);
  // 6bashuk uses `address` or `destination`. Kept identical across all three copies
  // since the shared webhook hub (telegram-webhook.js, in the 6bashuk repo) rebuilds
  // messages for every business and needs to handle every shape.
  return String((order && (order.address || (order.deliveryZone && order.deliveryZone.label) || order.destination)) || "").trim();
}

// Telegram inline-button URLs only accept http(s):// and tg:// — a tel: link gets
// rejected outright ("Bad Request: ... is invalid: Wrong port number specified in
// the URL"), so there's no button for calling. Instead the phone number is put in
// the message text in +<countrycode> form, which Telegram's own auto-linkification
// turns into a tap-to-call link on mobile clients without needing a button at all.
function formatPhoneIntl(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? "+972" + digits.slice(1) : "+" + digits;
}

function buildDeliveryText(businessMeta, order, orderKey, statusNote) {
  const lines = [
    `${businessMeta.emoji} ${businessMeta.name}`,
    `🚗 משלוח #${orderDisplayNumber(orderKey)}`,
    `📍 ${orderAddress(order) || "לא צוינה כתובת"}`,
    `💰 ${order.total || 0} ₪`,
    `📞 ${formatPhoneIntl(order.phone) || order.phone || ""}`
  ];
  if (statusNote) lines.push("", statusNote);
  return lines.join("\n");
}

// One inline-keyboard row per delivery stage. Earlier stages stay visible as
// non-interactive labels (callback_data "noop") so the courier sees the full
// progress instead of the buttons disappearing.
function buildKeyboard(status, businessId, orderKey, order) {
  const address = orderAddress(order);
  const navRow = [
    { text: "🗺️ ניווט", url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address) }
  ];
  const rows = [navRow];

  if (status === "sent") {
    rows.push([{ text: "✅ קיבלתי", callback_data: `accept:${businessId}:${orderKey}` }]);
  } else if (status === "driver_accepted") {
    rows.push([{ text: "✅ התקבל", callback_data: "noop" }]);
    rows.push([{ text: "🚗 יצאתי ללקוח", callback_data: `out:${businessId}:${orderKey}` }]);
  } else if (status === "out_for_delivery") {
    rows.push([{ text: "✅ התקבל", callback_data: "noop" }]);
    rows.push([{ text: "🚗 בדרך", callback_data: "noop" }]);
    rows.push([{ text: "✅ נמסר", callback_data: `delivered:${businessId}:${orderKey}` }]);
  } else if (status === "delivered") {
    rows.push([{ text: "✅ נמסר", callback_data: "noop" }]);
  }
  return rows;
}

const STATUS_NOTE = {
  sent: null,
  driver_accepted: "✅ השליח קיבל את ההזמנה",
  out_for_delivery: "🚗 השליח בדרך ללקוח",
  delivered: "✅ נמסר ללקוח"
};

module.exports = { orderDisplayNumber, orderAddress, buildDeliveryText, buildKeyboard, STATUS_NOTE };
