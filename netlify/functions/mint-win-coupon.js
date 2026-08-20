// netlify/functions/mint-win-coupon.js
// Issues a unique single-use 15%-off coupon for a dough-game winner.
// All Firebase access uses the public REST endpoint (same as the client) but
// centralizing minting here lets us add anti-abuse checks server-side:
//   - the order must exist in `orders/<orderKey>`
//   - the order must not already have a `wonGameCode` (no double-mint per order)
//
// Required environment variable (configured in Netlify):
//   FB_URL (+ FB_SECRET once rules are locked — see marketing/lib/fb.js)

const { fbGet, fbSet } = require("../../marketing/lib/fb");

const COUPON_PERCENT = 15;
const COUPON_TTL_MS  = 14 * 86400 * 1000;
const ALPHABET       = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return 'WIN-' + s;
}

// Light per-IP rate limit (in-memory, per warm instance).
const MIN_INTERVAL_MS = 1000;
const ipLastHit = new Map();
function tooFrequent(ip) {
    const now = Date.now();
    const prev = ipLastHit.get(ip) || 0;
    ipLastHit.set(ip, now);
    if (ipLastHit.size > 500) for (const [k, t] of ipLastHit) if (now - t > 60000) ipLastHit.delete(k);
    return now - prev < MIN_INTERVAL_MS;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const ip = ((event.headers && event.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'unknown';
    if (tooFrequent(ip)) return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };

    if (!process.env.FB_URL) return { statusCode: 500, body: JSON.stringify({ error: 'Missing FB_URL env var' }) };

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    // orderKey is REQUIRED and validated. A valid gameToken is ALSO required: it was
    // returned by place-order only to the real customer and lives in a function-only
    // node, so a win can't be farmed from a publicly-readable orderKey alone.
    const orderKey = body.orderKey;
    const gameToken = String(body.gameToken || '');
    if (!orderKey || !/^[A-Za-z0-9_-]+$/.test(orderKey)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Valid orderKey required' }) };
    }
    {
        const order = await fbGet('orders/' + orderKey);
        if (!order) return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        if (order.wonGameCode) return { statusCode: 409, body: JSON.stringify({ error: 'Order already has a coupon', code: order.wonGameCode }) };

        const tok = await fbGet('gameTokens/' + orderKey);
        if (!tok || tok.used || !tok.token || tok.token !== gameToken) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Invalid or used game token' }) };
        }
    }

    // Generate a unique code (try a few times in case of unlikely collision)
    let code = null;
    for (let i = 0; i < 6; i++) {
        const candidate = genCode();
        const existing = await fbGet('coupons/' + candidate);
        if (!existing) { code = candidate; break; }
    }
    if (!code) return { statusCode: 500, body: JSON.stringify({ error: 'Could not allocate code' }) };

    const expiresAt = Date.now() + COUPON_TTL_MS;
    await fbSet('coupons/' + code, {
        type: 'percent', value: COUPON_PERCENT, active: true,
        usedCount: 0, used: false, oneTime: true,
        createdAt: Date.now(), expiresAt,
        wonByOrderId: orderKey, source: 'dough-game'
    });
    await fbSet('orders/' + orderKey + '/wonGameCode', code);
    await fbSet('orders/' + orderKey + '/wonGameAt', Date.now());
    await fbSet('gameTokens/' + orderKey + '/used', true).catch(() => {}); // consume the token

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, expiresAt })
    };
};
