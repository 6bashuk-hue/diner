// site.config.js — EDIT THIS FILE for your business. This is the single place that
// holds your business identity + Firebase connection details. It's written so the
// exact same file works in three places with zero build step:
//   1. <script src="/site.config.js"> in the browser pages          → window.SITE_CONFIG
//   2. require("../../site.config.js") inside Netlify Functions      → module.exports
//   3. importScripts("/site.config.js") inside sw.js (service worker) → self.SITE_CONFIG
//
// See SETUP.md for the full walkthrough (Firebase project, Netlify env vars, etc.).
// This file only holds PUBLIC values — nothing here is a secret (see SETUP.md for
// where the real secrets like ADMIN_PASSWORD/FB_SECRET go: Netlify environment
// variables, never this file).
(function (root) {
  const SITE_CONFIG = {
    business: {
      name: "הדיינר",
      tagline: "הדיינר של ערד",
      type: "דיינר אמריקאי",
      city: "ערד",
      country: "IL",
      phone: "+972504599409",
      phoneDisplay: "050-459-9409",
      whatsappCountryCode: "972",
      address: { street: "התעשייה 6", locality: "ערד", region: "", country: "IL" },
      hoursDisplay: "ב׳–ה׳ 18:00–00:00 · שבת 12:00–00:00",
      canonicalUrl: "https://REPLACE-WITH-YOUR-DOMAIN.netlify.app"
    },
    firebase: {
      // ⚠️ Create your OWN Firebase Realtime Database project (SETUP.md step 2) —
      // never point this at someone else's project. These placeholders will not work
      // until you replace them.
      dbUrl: "https://diner-ade25-default-rtdb.europe-west1.firebasedatabase.app/",
      apiKey: "AIzaSyCkU4ZOcXzaZBxs6sdDy4wLOl44879UBJo",
      adminEmail: "owner@yourbusiness.local"
    },
    commerce: {
      deliveryFee: 20,
      minDelivery: 60,
      currency: "₪"
    },
    theme: {
      primary: "#d21f24",
      primaryDark: "#a31419",
      accent: "#28a3aa",
      bg: "#f7f1e7"
    },
    // Guest menus — dishes from neighboring businesses that a הדיינר customer can add
    // to their own order (same cart, same order, same kitchen ticket). Read by both
    // index.html (renders the "add from the neighbors" picker) and place-order.js
    // (the only trusted price source for these items — see flattenGuestPrices there).
    // Prices/items here must be kept in sync with the neighbor's own printed menu.
    guestMenus: [
      {
        key: "adela",
        name: "אדלה בשוק",
        sections: [
          {
            label: "נשנושים",
            items: [
              { name: "כנפיים קריספיות", desc: "רוטב שזיפים ושומשום", price: 39 },
              { name: "אדממה", desc: "פולי סויה במלח אטלנטי ולימון", price: 32 },
              { name: "תפו\"א קריספי", desc: "קייג'ון, איולי פלפלים ואיולי נענע", price: 42 },
              { name: "טבעות בצל אדלה", desc: "איולי נענע ואיולי פלפלים", price: 41 }
            ]
          },
          {
            label: "ראשונות",
            items: [
              { name: "לחם הבית (אדלה)", desc: "סלסת עגבניות גחלים, שום קונפי וזעתר", price: 38 },
              { name: "חצילים אש", desc: "חצילים על גחלים, טחינה חמוצה, שום קונפי, עגבניות גחלים, כוסברה, צנוברים, צ'ילי חריף ושמן זית", price: 48 },
              { name: "קרפצ'יו פלפלים", desc: "לאליק, שרי, עגבניה, קרם בלסמי, שום גרוס, שמן זית, לימון כבוש, שקדים קלויים וברוסקטה", price: 46 },
              { name: "סלט חסות", desc: "חסות מהשוק, בצל סגול, צנונית, ארטישוק בבלסמי, קרוטונים וויניגרט לימון", price: 48 },
              { name: "סלט הדר ושומר", desc: "שומר, מלפפון, כוסברה, נענע, בצל ירוק, חמוציות, צ'ילי חריף ופירות הדר", price: 46 }
            ]
          }
        ]
      },
      {
        key: "shishbashuk",
        name: "6 בשוק",
        sections: [
          {
            label: "ראשונות",
            items: [
              { name: "סלט קיסר (6 בשוק)", desc: "חסה קיסר, בצל סגול, קרוטונים ופרמזן", price: 52 },
              { name: "סלט קפרזה", desc: "עגבניות שרי, בזיליקום, מוצרלה", price: 52 },
              { name: "פוקאצ'ה קלאסית", desc: "שום, שמן זית ורוזמרין", price: 34 },
              { name: "פוקאצ'ה עיזים", desc: "גבינת עיזים, פלפל קלוי ובלסמי", price: 52 },
              { name: "לאבנה אסלית", desc: "פיתה בטאבון, צנוברים, זעתר ודבש", price: 48 }
            ]
          },
          {
            label: "פיצות",
            items: [
              { name: "פיצה מרגריטה קלאסית", desc: "רוטב עגבניות, מוצרלה ובזיליקום", price: 56 },
              { name: "פיצת אנשובי", desc: "רוטב עגבניות, מוצרלה, בצל סגול, אנשובי וצלפים", price: 64 },
              { name: "פיצה מקורמלת", desc: "רוטב עגבניות, מוצרלה, בצל מקורמל, חלפיניו ופרמזן", price: 62 },
              { name: "פיצת דבש וצ'ילי", desc: "גבינת עיזים, שום קונפי, חלפיניו ודבש צ'ילי", price: 64 },
              { name: "פיצה דרוזית", desc: "מוצרלה, לאבנה, עגבניות שרי, בצל סגול, זעתר", price: 62 },
              { name: "פיצת אלה-רומנה", desc: "רוטב עגבניות, מוצרלה, ארטישוק ופרמזן", price: 64 },
              { name: "פיצת מלך היער", desc: "רוטב מסקרפונה ופרמזן, מוצרלה, פטריות", price: 64 },
              { name: "פיצת טרטופו", desc: "רוטב מלך היער, מוצרלה, פטריות, מחית כמהין וערמונים", price: 68 },
              { name: "פיצת השוק", desc: "רוטב עגבניות, חציל, זוקיני, שום קונפי ובלסמי", price: 64 },
              { name: "פיצת קיסר שרוף", desc: "מוצרלה, צלפים, חסה, בצל סגול, רוטב קיסר, פרמזן, גרידת לימון וצ'ילי", price: 68 }
            ]
          },
          {
            label: "קינוחים",
            items: [
              { name: "קלצונה שוקולד", desc: "קלצונה ממולאת שוקולד נוזלי ואגוזים, מוגשת עם גלידה", price: 44 },
              { name: "טירמיסו", desc: "קרם מסקרפונה, ביסקוויטים, אספרסו ואבקת קקאו", price: 38 }
            ]
          }
        ]
      }
    ]
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SITE_CONFIG;
  } else {
    root.SITE_CONFIG = SITE_CONFIG;
  }
})(typeof self !== "undefined" ? self : this);
