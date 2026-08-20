// netlify/functions/daily-backup.js
// Daily snapshot of orders + history into a separate `backups/` tree in Firebase.
// The cron is declared in netlify.toml under [functions."daily-backup"].
//
// Required env var: FB_URL (+ FB_SECRET once rules are locked — see fb.js).

const { fbGet, fbSet, fbDelete } = require("../../marketing/lib/fb");

const KEEP_DAYS = 30;

function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

exports.handler = async () => {
    if (!process.env.FB_URL) return { statusCode: 500, body: "Missing FB_URL" };

    const [orders, history, coupons, menu, settings] = await Promise.all([
        fbGet("orders"),
        fbGet("history"),
        fbGet("coupons"),
        fbGet("menu"),
        fbGet("siteSettings")
    ]);

    const snapshot = {
        ts: Date.now(),
        orders: orders || {},
        history: history || {},
        coupons: coupons || {},
        menu: menu || {},
        siteSettings: settings || {}
    };
    const dateKey = todayKey();
    await fbSet("backups/" + dateKey, snapshot);

    // Trim old backups beyond KEEP_DAYS
    const allBackups = (await fbGet("backups")) || {};
    const cutoff = Date.now() - KEEP_DAYS * 86400 * 1000;
    const old = Object.entries(allBackups)
        .filter(([, v]) => v && v.ts && v.ts < cutoff)
        .map(([k]) => k);
    await Promise.all(old.map(k => fbDelete("backups/" + k)));

    return { statusCode: 200, body: JSON.stringify({ ok: true, snapshotKey: dateKey, trimmed: old.length }) };
};
