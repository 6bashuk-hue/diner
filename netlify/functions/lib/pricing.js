// netlify/functions/lib/pricing.js
//
// Shared trusted pricing for orders — used by place-order.js (solo orders),
// update-group-items.js and submit-group-order.js (group orders) so every path
// re-prices a cart against the live menu/extras/guest config, never trusting
// prices sent by the client. Also holds the delivery-zone lookup
// (site.config.js `commerce.deliveryZones`), shared by the same three functions.

const SITE_CONFIG = require("../../../site.config.js");

class PricingError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Build {name -> price} maps from the authoritative menu/extras nodes.
function flattenPrices(node) {
  const map = new Map();
  if (!node || typeof node !== "object") return map;
  const addItem = (it) => {
    if (it && it.name != null && Number.isFinite(Number(it.price))) map.set(String(it.name), Number(it.price));
  };
  for (const section of Object.values(node)) {
    if (Array.isArray(section)) {
      section.forEach(addItem);
    } else if (section && typeof section === "object") {
      // A section is normally a list of items, but special entries (chefSpecial /
      // coupleMeal) are stored as a single priced item object — handle both.
      if (section.name != null && Number.isFinite(Number(section.price))) addItem(section);
      else Object.values(section).forEach(addItem);
    }
  }
  return map;
}

// Build {name -> {price, source}} from SITE_CONFIG.guestMenus (dishes from neighboring
// businesses a customer can add to their own order). This — not the client — is the
// only trusted price source for those items.
function flattenGuestPrices(guestMenus) {
  const map = new Map();
  (Array.isArray(guestMenus) ? guestMenus : []).forEach(src => {
    (Array.isArray(src.sections) ? src.sections : []).forEach(sec => {
      (Array.isArray(sec.items) ? sec.items : []).forEach(it => {
        if (it && it.name != null && Number.isFinite(Number(it.price))) {
          map.set(String(it.name), { price: Number(it.price), source: src.name });
        }
      });
    });
  });
  return map;
}

// Build {name -> price} from each guest section's extraGroups (e.g. 6 בשוק's pizza
// toppings) — same trusted-source treatment as flattenPrices(siteSettings/extras).
function flattenGuestExtraPrices(guestMenus) {
  const map = new Map();
  (Array.isArray(guestMenus) ? guestMenus : []).forEach(src => {
    (Array.isArray(src.sections) ? src.sections : []).forEach(sec => {
      (Array.isArray(sec.extraGroups) ? sec.extraGroups : []).forEach(g => {
        (Array.isArray(g.items) ? g.items : []).forEach(name => {
          if (name != null && Number.isFinite(Number(g.price))) map.set(String(name), Number(g.price));
        });
      });
    });
  });
  return map;
}

// Re-price a raw cart (as sent by the client: [{name, extras:[{name,qty,choice}], notes, choice}])
// against the live price maps. Returns {orderItems, itemsTotal, ownItemsTotal}.
// Throws PricingError(409) for a sold-out or unknown item — callers should turn that
// into the matching HTTP error response.
function priceCart(items, { menuPrices, extraPrices, guestPrices, guestExtraPrices, soldOut, menuLoaded }) {
  const orderItems = [];
  let itemsTotal = 0;
  // Same as itemsTotal but excludes dishes added from a neighboring business's guest
  // menu — used only for the free-item threshold nudge, so ordering from 6 בשוק /
  // אדלה בשוק doesn't help a customer reach it.
  let ownItemsTotal = 0;
  for (const raw of items) {
    const itemName = String((raw && raw.name) || "").slice(0, 120);
    if (!itemName) continue;
    if (soldOut.has(itemName)) throw new PricingError(409, `הפריט "${itemName}" אזל מהמלאי`);

    let basePrice;
    let guestSource = null;
    const guestItem = guestPrices.get(itemName);
    if (menuLoaded && menuPrices.has(itemName)) {
      basePrice = menuPrices.get(itemName);
    } else if (guestItem) {
      // Dish from a neighboring business — priced from our own trusted config.
      basePrice = guestItem.price;
      guestSource = guestItem.source;
    } else if (menuLoaded) {
      throw new PricingError(409, `הפריט "${itemName}" כבר לא בתפריט — רענן את הדף`);
    } else {
      // Menu unreachable — trust the client's basePrice rather than rejecting the order.
      basePrice = Math.max(0, Number(raw.basePrice) || 0);
    }

    const extras = (Array.isArray(raw.extras) ? raw.extras : []).slice(0, 30).map(e => {
      const en = String((e && e.name) || "").slice(0, 80);
      const qty = Math.max(1, Math.min(20, Math.floor(Number(e && e.qty) || 1)));
      let price;
      if (menuLoaded && extraPrices.has(en)) price = extraPrices.get(en);
      else if (guestExtraPrices.has(en)) price = guestExtraPrices.get(en);
      else price = Math.max(0, Number(e && e.price) || 0);
      const choice = String((e && e.choice) || "").slice(0, 40);
      const entry = { name: en, qty, price };
      if (choice) entry.choice = choice;
      return entry;
    }).filter(e => e.name);

    const extrasSum = extras.reduce((s, e) => s + e.qty * e.price, 0);
    const lineTotal = basePrice + extrasSum;
    itemsTotal += lineTotal;
    if (!guestSource) ownItemsTotal += lineTotal;
    const choice = String((raw && raw.choice) || "").slice(0, 80);
    orderItems.push({
      name: itemName, basePrice, extras,
      choice: choice || null,
      guestSource: guestSource || null,
      notes: String((raw && raw.notes) || "").slice(0, 280),
      total: lineTotal
    });
  }
  return { orderItems, itemsTotal, ownItemsTotal };
}

// ── Delivery zones (site.config.js `commerce.deliveryZones`) ──
function getDeliveryZones() {
  const z = SITE_CONFIG.commerce && SITE_CONFIG.commerce.deliveryZones;
  return Array.isArray(z) ? z : [];
}
function findDeliveryZone(key) {
  return getDeliveryZones().find(z => z.key === key) || null;
}

module.exports = {
  PricingError,
  flattenPrices, flattenGuestPrices, flattenGuestExtraPrices,
  priceCart,
  getDeliveryZones, findDeliveryZone
};
