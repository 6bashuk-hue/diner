// reservations-admin.js
// Admin-side screens for the shared table-reservation system. Identical
// across all three brand sites. Used from two places:
//   - index.html's admin panel (?admin=1): the "🪑 שולחנות" tab — full table
//     map/editor/settings, via renderTablesTab(). Reuses the existing admin
//     panel's own CSS classes (.admin-section/.admin-input/.admin-btn/...)
//     so it looks like part of the same screen, not a bolted-on widget.
//   - admin.html (the kitchen board / KDS): a read-only "today's reserved
//     tables" reminder panel, via initDailyPanel(). Display-only — this file
//     never touches printing, USB, or any other existing admin.html feature.
//
// Every mutation here calls the exact same Cloud Functions the public widget
// calls (createReservation/cancelReservation) or the admin-only ones
// documented in API.md — no separate/parallel logic against Firestore.
(function () {
  "use strict";

  const TIME_SLOTS = [];
  for (let h = 12; h <= 22; h++) {
    TIME_SLOTS.push(String(h).padStart(2, "0") + ":00");
    if (h < 23) TIME_SLOTS.push(String(h).padStart(2, "0") + ":30");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // Lazy-loads the admin secret only when an admin screen actually needs it,
  // so a plain site visitor's page load never ships this value — see the
  // comment at the top of shared-reservations-admin-config.js.
  function ensureAdminConfigLoaded() {
    return new Promise((resolve, reject) => {
      if (window.SHARED_RESERVATIONS_ADMIN_CONFIG) return resolve();
      const s = document.createElement("script");
      s.src = "js/shared-reservations-admin-config.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("לא ניתן לטעון את הגדרות הניהול של מערכת השולחנות"));
      document.head.appendChild(s);
    });
  }

  async function call(name, body) {
    await ensureAdminConfigLoaded();
    return window.SharedReservationsAPI.call(name, body || {});
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ───────────────────────── index.html: "🪑 שולחנות" tab ─────────────────────────

  let tablesTabState = { date: todayStr() };

  async function renderTablesTab() {
    const root = document.getElementById("tables-admin-root");
    if (!root) return;
    root.innerHTML = '<div style="color:#888;">טוען...</div>';

    const [reservationsRes, tablesRes, settingsRes] = await Promise.all([
      call("getReservationsByDate", { date: tablesTabState.date }),
      call("listTables", {}),
      call("getSettings", {}),
    ]);

    if (!reservationsRes.success || !tablesRes.success) {
      root.innerHTML = `<div style="color:var(--danger);">שגיאה בטעינת נתוני השולחנות: ${escapeHtml((reservationsRes && reservationsRes.error) || (tablesRes && tablesRes.error) || "")}</div>`;
      return;
    }

    const reservations = reservationsRes.reservations.slice().sort((a, b) => a.time.localeCompare(b.time));
    const tables = tablesRes.tables;
    const tableById = Object.fromEntries(tables.map((t) => [t.id, t]));
    const settings = settingsRes.success ? settingsRes.settings : { minPartySize: 1, maxPartySize: 12 };

    root.innerHTML = "";
    root.appendChild(renderDayReservationsSection(reservations, tableById));
    root.appendChild(renderBlockTableSection(tables));
    root.appendChild(renderTablesEditorSection(tables));
    root.appendChild(renderSettingsSection(settings));
  }

  function renderDayReservationsSection(reservations, tableById) {
    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`<div class="admin-section-title">🗓 מפת שולחנות ליום נבחר</div>`));
    const section = el(`
      <div class="admin-section">
        <input type="date" id="tables-date-input" class="admin-input" style="max-width:200px;">
        <div id="tables-day-list" style="margin-top:0.8rem;"></div>
      </div>
    `);
    wrap.appendChild(section);

    const dateInput = section.querySelector("#tables-date-input");
    dateInput.value = tablesTabState.date;
    dateInput.addEventListener("change", () => {
      tablesTabState.date = dateInput.value;
      renderTablesTab();
    });

    const list = section.querySelector("#tables-day-list");
    if (reservations.length === 0) {
      list.innerHTML = '<div style="color:#888; font-size:0.9rem;">אין הזמנות ליום זה</div>';
    } else {
      reservations.forEach((r) => {
        const table = tableById[r.tableId];
        const row = el(`
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding:0.55rem 0; gap:0.5rem; flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(r.time)}</strong> — ${escapeHtml(r.customerName)} (${escapeHtml(r.partySize)} סועדים)
              <div style="font-size:0.8rem;color:#888;">שולחן: ${table ? escapeHtml(table.location) + " (" + table.capacity + " מק')" : r.tableId} · ${escapeHtml(r.customerPhone)}</div>
            </div>
            <button type="button" class="admin-btn-secondary" style="color:var(--danger);">ביטול</button>
          </div>
        `);
        row.querySelector("button").addEventListener("click", async () => {
          if (!confirm("לבטל את ההזמנה של " + r.customerName + "?")) return;
          const res = await call("cancelReservation", { reservationId: r.id });
          if (!res.success) return alert(res.error || "שגיאה בביטול");
          renderTablesTab();
        });
        list.appendChild(row);
      });
    }
    return wrap;
  }

  // "Blocking" a table for a holiday/private event reuses createReservation
  // exactly like a real customer booking would (same transaction, same
  // double-booking guard) — there is no separate "block" endpoint, by design
  // (see stage 3 instructions: this screen must not carry parallel logic).
  function renderBlockTableSection(tables) {
    const activeTables = tables.filter((t) => t.isActive);
    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`<div class="admin-section-title">🔒 חסימת שולחן (חג / אירוע פרטי)</div>`));
    const section = el(`
      <div class="admin-section">
        <div class="history-row">
          <select id="block-table-select" class="admin-input">
            ${activeTables.map((t) => `<option value="${t.id}">${escapeHtml(t.location)} (${t.capacity} מק')</option>`).join("")}
          </select>
          <select id="block-time-select" class="admin-input">
            ${TIME_SLOTS.map((t) => `<option value="${t}">${t}</option>`).join("")}
          </select>
          <input type="text" id="block-reason-input" class="admin-input" placeholder="סיבה (לדוגמה: אירוע פרטי)">
          <button type="button" id="block-submit-btn" class="admin-btn">חסימה</button>
        </div>
        <div id="block-msg" style="margin-top:0.5rem;"></div>
      </div>
    `);
    wrap.appendChild(section);
    section.querySelector("#block-submit-btn").addEventListener("click", async () => {
      const tableId = section.querySelector("#block-table-select").value;
      const time = section.querySelector("#block-time-select").value;
      const reason = section.querySelector("#block-reason-input").value.trim() || "אירוע פרטי";
      if (!tableId) return alert("אין שולחנות פעילים לחסימה");
      const cfg = window.SHARED_RESERVATIONS_CONFIG || {};
      const msg = section.querySelector("#block-msg");
      msg.textContent = "חוסם...";
      const res = await call("createReservation", {
        tableId, date: tablesTabState.date, time, partySize: 1,
        customerName: "🔒 חסום: " + reason, customerPhone: "-", source: cfg.source,
      });
      if (!res.success) { msg.innerHTML = `<span style="color:var(--danger);">${escapeHtml(res.error)}</span>`; return; }
      renderTablesTab();
    });
    return wrap;
  }

  function renderTablesEditorSection(tables) {
    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`<div class="admin-section-title">🪑 עריכת מפת השולחנות</div>`));
    const section = el(`
      <div class="admin-section">
        <div id="tables-editor-list"></div>
        <button type="button" id="add-table-btn" class="admin-btn" style="margin-top:0.7rem;">➕ הוסף שולחן חדש</button>
        <div id="add-table-msg" style="margin-top:0.5rem;"></div>
      </div>
    `);
    wrap.appendChild(section);

    const list = section.querySelector("#tables-editor-list");
    tables.forEach((t) => {
      const row = el(`
        <div style="display:flex; align-items:center; gap:0.5rem; border-bottom:1px solid #333; padding:0.5rem 0; flex-wrap:wrap; opacity:${t.isActive ? "1" : "0.55"};">
          <input type="text" class="admin-input rsv-loc-input" style="flex:2; min-width:110px;" value="${escapeHtml(t.location)}">
          <input type="number" min="1" class="admin-input rsv-cap-input" style="flex:1; min-width:70px;" value="${t.capacity}">
          <label style="display:flex; align-items:center; gap:0.3rem; font-size:0.85rem;">
            <input type="checkbox" class="rsv-active-checkbox" ${t.isActive ? "checked" : ""}> פעיל
          </label>
          <button type="button" class="admin-btn-secondary">שמירה</button>
        </div>
      `);
      const locInput = row.querySelector(".rsv-loc-input");
      const capInput = row.querySelector(".rsv-cap-input");
      const activeCheckbox = row.querySelector(".rsv-active-checkbox");
      row.querySelector("button").addEventListener("click", async () => {
        const res = await call("updateTable", {
          tableId: t.id, location: locInput.value.trim(),
          capacity: Number(capInput.value), isActive: activeCheckbox.checked,
        });
        if (!res.success) return alert(res.error || "שגיאה בעדכון השולחן");
        renderTablesTab();
      });
      list.appendChild(row);
    });

    section.querySelector("#add-table-btn").addEventListener("click", async () => {
      const capacity = prompt("כמות כיסאות בשולחן החדש:");
      if (!capacity) return;
      const location = prompt("מיקום השולחן (לדוגמה: פנים - ליד החלון):");
      if (!location) return;
      const res = await call("createTable", { capacity: Number(capacity), location: location.trim() });
      const msg = section.querySelector("#add-table-msg");
      if (!res.success) { msg.innerHTML = `<span style="color:var(--danger);">${escapeHtml(res.error)}</span>`; return; }
      renderTablesTab();
    });
    return wrap;
  }

  function renderSettingsSection(settings) {
    const wrap = el(`<div></div>`);
    wrap.appendChild(el(`<div class="admin-section-title">⚙️ הגדרות שמירת שולחן</div>`));
    const section = el(`
      <div class="admin-section">
        <div class="history-row">
          <label style="color:#aaa; font-size:0.9rem;">מינימום אנשים:</label>
          <input type="number" min="1" id="settings-min-input" class="admin-input" style="width:90px;" value="${settings.minPartySize}">
          <label style="color:#aaa; font-size:0.9rem;">מקסימום אנשים:</label>
          <input type="number" min="1" id="settings-max-input" class="admin-input" style="width:90px;" value="${settings.maxPartySize}">
          <button type="button" id="settings-save-btn" class="admin-btn">שמירה</button>
        </div>
        <div id="settings-msg" style="margin-top:0.5rem;"></div>
        <div style="font-size:0.78rem;color:#888;margin-top:0.6rem;">השינוי חל מיד בכל שלושת האתרים — הם קוראים להגדרות האלה בזמן אמת, בלי צורך בפריסה מחדש.</div>
      </div>
    `);
    wrap.appendChild(section);
    section.querySelector("#settings-save-btn").addEventListener("click", async () => {
      const minPartySize = Number(section.querySelector("#settings-min-input").value);
      const maxPartySize = Number(section.querySelector("#settings-max-input").value);
      const msg = section.querySelector("#settings-msg");
      const res = await call("updateSettings", { minPartySize, maxPartySize });
      msg.innerHTML = res.success
        ? '<span style="color:#25D366;">נשמר ✓</span>'
        : `<span style="color:var(--danger);">${escapeHtml(res.error)}</span>`;
    });
    return wrap;
  }

  // ───────────────────────── admin.html: daily kitchen panel ─────────────────────────

  let dailyPanelTimer = null;

  function initDailyPanel(containerId) {
    renderDailyPanel(containerId);
    if (dailyPanelTimer) clearInterval(dailyPanelTimer);
    dailyPanelTimer = setInterval(() => renderDailyPanel(containerId), 60000);
  }

  async function renderDailyPanel(containerId) {
    const root = document.getElementById(containerId || "reservations-daily-panel");
    if (!root) return;
    const res = await call("getReservationsByDate", { date: todayStr() });
    if (!res.success) {
      root.innerHTML = `<div style="color:#e74c3c;font-size:0.85rem;">שגיאה בטעינת שולחנות שמורים: ${escapeHtml(res.error || "")}</div>`;
      return;
    }
    const reservations = res.reservations.slice().sort((a, b) => a.time.localeCompare(b.time));
    if (reservations.length === 0) {
      root.innerHTML = '<div style="opacity:0.7;">אין שולחנות שמורים להיום</div>';
      return;
    }
    root.innerHTML = reservations.map((r) => `
      <div style="display:inline-flex; align-items:center; gap:0.4rem; background:#3a2f00; color:#ffd873; border-radius:8px; padding:0.35rem 0.7rem; margin:0.2rem; font-weight:700; font-size:0.85rem;">
        🪑 ${escapeHtml(r.time)} · ${escapeHtml(r.customerName)} · ${escapeHtml(r.partySize)} סועדים
      </div>
    `).join("");
  }

  window.ReservationsAdmin = { renderTablesTab, initDailyPanel };
})();
