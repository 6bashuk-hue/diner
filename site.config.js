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
          },
          {
            label: "עיקריות",
            items: [
              { name: "סטייק כרוב", desc: "כרוב צלוי, טחינה חמוצה, עגבניות גחלים, שום קונפי, אריסה, לימון כבוש, בצל קריספי, בצל ירוק ושמן צ'ילי", price: 52 },
              { name: "הקבב של אדלה", desc: "קבב אסאדו (250 גרם), טחינה, בצל צלוי, בטטה צלויה וסלסת עגבניות גחלים", price: 69 },
              { name: "הכריך של בן", desc: "לחם של פעם על הגז, אנטריקוט, איולי פלפלים, חסה וסגולים מוחמצים, תפו\"א קריספי בצד", price: 69 }
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
            label: "פיצות הבית",
            items: [
              { name: "פיצת קיסר שרוף", desc: "בסיס שום ושמן זית, מוצרלה, חסה טרייה, צלפים ובצל סגול; אחרי האפייה זילוף רוטב קיסר ביתי, שביבי פרמזן וגרידת לימון וצ'ילי — הבחירה של השף", price: 74 },
              { name: "פיצה מרגריטה קלאסית", desc: "רוטב עגבניות, מוצרלה ובזיליקום טרי", price: 60 },
              { name: "פיצה דרוזית", desc: "מוצרלה, לאבנה, עגבניות שרי, בצל סגול, פטרוזיליה, שמן זית וזעתר", price: 66 },
              { name: "פיצת השוק", desc: "רוטב עגבניות, מוצרלה, חציל, זוקיני, שום קונפי, פרמזן, בזיליקום ובלסמי מצומצם", price: 66 },
              { name: "פיצה מקורמלת", desc: "רוטב עגבניות, מוצרלה, בצל מקורמל, חלפיניו ופרמזן", price: 66 },
              { name: "פיצת אלה-רומנה", desc: "רוטב עגבניות, מוצרלה, ארטישוק, בזיליקום ופרמזן", price: 66 },
              { name: "פיצת דבש וצ'ילי", desc: "גבינת עיזים, שום קונפי, חלפיניו ורוטב דבש צ'ילי ביתי", price: 66 },
              { name: "פיצת אנשובי", desc: "רוטב עגבניות, מוצרלה, בצל סגול, אנשובי וצלפים", price: 66 },
              { name: "פיצת מלך היער", desc: "רוטב מלך היער על בסיס מסקרפונה ופרמזן, מוצרלה, שמפיניון, פורטובלו ופטרוזיליה", price: 66 },
              { name: "פיצת טרטופו", desc: "רוטב מלך היער על בסיס מסקרפונה ופרמזן, מוצרלה, פטריות פורטובלו ושמפיניון, מחית כמהין שחור, ערמונים קלויים ופטרוזיליה", price: 72 }
            ],
            // Pizza toppings ("שדרגו את הפיצה" on the printed menu) — same qty +/- format
            // as the diner's own burger extras. Two names ("פטריות", "בצל מקורמל") are
            // disambiguated with a "(פיצה)" suffix because the diner's own siteSettings/extras
            // already uses those exact names at a different price — place-order.js prices
            // every extra name from a single flat map, so an unqualified collision would
            // silently charge the diner's price instead of the neighbor's real one.
            extraGroups: [
              { label: "תוספות רגילות", price: 7, items: ["קלמטה", "בצל סגול", "פטריות (פיצה)", "חלפיניו", "עגבניות שרי"] },
              { label: "תוספות פרימיום", price: 12, items: ["גבינת עיזים", "ארטישוק", "פרמזן", "מוצרלה נוספת", "גבינה טבעונית (פיצה)", "ערמונים קלויים", "בצל מקורמל (פיצה)"] }
            ]
          },
          {
            label: "קינוחים",
            items: [
              { name: "קלצונה נוטלה אישי", desc: "קלצונה ממולאת נוטלה, מוגשת חמה", price: 44 },
              { name: "קלצונה נוטלה זוגי", desc: "קלצונה ממולאת נוטלה בגודל זוגי", price: 60 }
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
