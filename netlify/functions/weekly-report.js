// netlify/functions/weekly-report.js
// Computes the past 7 days of stats and stores the result under
// `reports/<isoWeek>` in Firebase. Cron declared in netlify.toml.
//
// Required env var: FB_URL (+ FB_SECRET once rules are locked — see fb.js).

const { fbGet, fbSet } = require("../../marketing/lib/fb");

function isoWeekKey(d = new Date()) {
    // Returns YYYY-Www
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

function buildReport(orders) {
    const cutoff = Date.now() - 7 * 86400 * 1000;
    const recent = orders.filter(o => (o.ts || 0) >= cutoff);
    let revenue = 0, delivery = 0, pickup = 0, cash = 0, credit = 0,
        gameWins = 0, couponsUsed = 0, couponDiscount = 0;
    const itemCounts = {};
    const newCustomers = new Set();
    const phoneSeen = {};
    recent.forEach(o => {
        revenue += o.total || 0;
        if (o.type === "משלוח") delivery++; else pickup++;
        if (o.payment === "cash") cash++; else credit++;
        if (o.wonGameCode) gameWins++;
        if (o.couponCode)  { couponsUsed++; couponDiscount += o.discount || 0; }
        (o.items || []).forEach(it => { itemCounts[it.name] = (itemCounts[it.name] || 0) + 1; });
        const phone = String(o.phone || "").replace(/\D/g, "");
        if (phone) phoneSeen[phone] = (phoneSeen[phone] || 0) + 1;
    });
    Object.keys(phoneSeen).forEach(p => { if (phoneSeen[p] === 1) newCustomers.add(p); });
    const topItems = Object.entries(itemCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const avg = recent.length ? Math.round(revenue / recent.length) : 0;
    return {
        ts: Date.now(),
        period: { from: cutoff, to: Date.now() },
        orders: recent.length,
        revenue, avg, delivery, pickup, cash, credit,
        gameWins, couponsUsed, couponDiscount,
        newCustomers: newCustomers.size,
        topItems
    };
}

exports.handler = async () => {
    if (!process.env.FB_URL) return { statusCode: 500, body: "Missing FB_URL" };
    const [orders, history] = await Promise.all([fbGet("orders"), fbGet("history")]);
    const all = [];
    if (orders) Object.values(orders).forEach(o => o && all.push(o));
    if (history) Object.values(history).forEach(day => {
        if (day) Object.values(day).forEach(o => o && all.push(o));
    });
    const report = buildReport(all);
    const key = isoWeekKey();
    await fbSet("reports/" + key, report);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, key, report }) };
};
