// reservation-widget.js
// Public table-reservation widget. Byte-for-byte identical across all three
// brand sites — the only thing that differs between them is the surrounding
// page's CSS variables (:root colors) and window.SHARED_RESERVATIONS_CONFIG.source.
// Talks only to window.SharedReservationsAPI (shared-reservations-client.js).
(function () {
  "use strict";

  // Front-end-only display range for the time-slot buttons. Not enforced by
  // the backend (createReservation has no notion of "operating hours" — see
  // API.md) — this is purely which buttons this page offers to tap. Adjust
  // here if hours change; no backend/API change needed.
  const TIME_SLOTS = [];
  for (let h = 12; h <= 22; h++) {
    TIME_SLOTS.push(String(h).padStart(2, "0") + ":00");
    if (h < 23) TIME_SLOTS.push(String(h).padStart(2, "0") + ":30");
  }

  let settings = { minPartySize: 1, maxPartySize: 12 };
  let state = {
    date: "",
    time: "",
    partySize: 2,
    tab: "book",
  };

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function init() {
    const root = document.getElementById("reservation-app");
    if (!root) return;
    state.date = todayStr();
    state.partySize = 2;

    // getSettings before rendering the form so the party-size stepper never
    // lets the customer pick a value createReservation will reject anyway.
    const res = await window.SharedReservationsAPI.call("getSettings", {});
    if (res && res.success) {
      settings = res.settings;
      state.partySize = Math.min(Math.max(2, settings.minPartySize), settings.maxPartySize);
    }
    renderBookTab();
  }

  function showTab(tab) {
    state.tab = tab;
    document.getElementById("rsv-tab-book").classList.toggle("active", tab === "book");
    document.getElementById("rsv-tab-mine").classList.toggle("active", tab === "mine");
    if (tab === "book") renderBookTab();
    else renderMineTab();
  }

  function renderBookTab() {
    const root = document.getElementById("reservation-app");
    root.innerHTML = "";
    root.appendChild(el(`
      <div class="rsv-card">
        <label class="rsv-label">📅 תאריך</label>
        <input type="date" class="rsv-input" id="rsv-date">

        <label class="rsv-label">🕒 שעה</label>
        <div class="rsv-time-grid" id="rsv-time-grid"></div>

        <label class="rsv-label">👥 כמות סועדים</label>
        <div class="rsv-party-row">
          <button type="button" class="rsv-party-btn" id="rsv-party-minus">−</button>
          <div class="rsv-party-val" id="rsv-party-val"></div>
          <button type="button" class="rsv-party-btn" id="rsv-party-plus">+</button>
        </div>

        <label class="rsv-label">🙋 שם מלא</label>
        <input type="text" class="rsv-input" id="rsv-name" placeholder="השם שלך" autocomplete="name">

        <label class="rsv-label">📱 טלפון</label>
        <input type="tel" class="rsv-input" id="rsv-phone" placeholder="05X-XXXXXXX" autocomplete="tel">

        <button type="button" class="rsv-submit" id="rsv-submit">שמירת שולחן</button>
        <div id="rsv-msg"></div>
      </div>
    `));

    const dateInput = document.getElementById("rsv-date");
    dateInput.min = todayStr();
    dateInput.value = state.date;
    dateInput.addEventListener("change", () => { state.date = dateInput.value; });

    const grid = document.getElementById("rsv-time-grid");
    TIME_SLOTS.forEach((t) => {
      const btn = el(`<button type="button" class="rsv-time-btn">${t}</button>`);
      btn.addEventListener("click", () => {
        state.time = t;
        grid.querySelectorAll(".rsv-time-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      grid.appendChild(btn);
    });

    const partyVal = document.getElementById("rsv-party-val");
    partyVal.textContent = state.partySize;
    document.getElementById("rsv-party-minus").addEventListener("click", () => {
      state.partySize = Math.max(settings.minPartySize, state.partySize - 1);
      partyVal.textContent = state.partySize;
    });
    document.getElementById("rsv-party-plus").addEventListener("click", () => {
      state.partySize = Math.min(settings.maxPartySize, state.partySize + 1);
      partyVal.textContent = state.partySize;
    });

    document.getElementById("rsv-submit").addEventListener("click", submitBooking);
  }

  function showMsg(text, type) {
    const box = document.getElementById("rsv-msg");
    if (!box) return;
    box.innerHTML = text ? `<div class="rsv-msg ${type}">${escapeHtml(text)}</div>` : "";
  }

  async function submitBooking() {
    const name = document.getElementById("rsv-name").value.trim();
    const phone = document.getElementById("rsv-phone").value.trim();
    const submitBtn = document.getElementById("rsv-submit");

    if (!state.time) return showMsg("בחרו שעה", "error");
    if (!name) return showMsg("נא להזין שם", "error");
    if (!phone || phone.replace(/\D/g, "").length < 9) return showMsg("נא להזין מספר טלפון תקין", "error");

    const cfg = window.SHARED_RESERVATIONS_CONFIG || {};
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="rsv-spinner"></span> בודקים זמינות...';
    showMsg("", "");

    const avail = await window.SharedReservationsAPI.call("checkAvailability", {
      date: state.date, time: state.time, partySize: state.partySize,
    });
    if (!avail.success) {
      submitBtn.disabled = false;
      submitBtn.textContent = "שמירת שולחן";
      return showMsg(avail.error || "שגיאה בבדיקת זמינות", "error");
    }
    if (!avail.tables || avail.tables.length === 0) {
      submitBtn.disabled = false;
      submitBtn.textContent = "שמירת שולחן";
      return showMsg("אין שולחנות פנויים במועד שנבחר — נסו שעה או תאריך אחר", "error");
    }

    // Smallest table that still fits the party, so larger tables stay free
    // for larger parties.
    const table = avail.tables.slice().sort((a, b) => a.capacity - b.capacity)[0];

    submitBtn.innerHTML = '<span class="rsv-spinner"></span> שומרים את השולחן...';
    const created = await window.SharedReservationsAPI.call("createReservation", {
      tableId: table.id, date: state.date, time: state.time, partySize: state.partySize,
      customerName: name, customerPhone: phone, source: cfg.source,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "שמירת שולחן";

    if (!created.success) {
      return showMsg(created.error || "שגיאה בשמירת השולחן, נסו שוב", "error");
    }
    showMsg(`השולחן נשמר ✅ ${state.date} בשעה ${state.time}, ל-${state.partySize} סועדים`, "success");
  }

  function renderMineTab() {
    const root = document.getElementById("reservation-app");
    root.innerHTML = "";
    root.appendChild(el(`
      <div class="rsv-card">
        <label class="rsv-label">📱 טלפון שאיתו הוזמן השולחן</label>
        <input type="tel" class="rsv-input" id="rsv-mine-phone" placeholder="05X-XXXXXXX" autocomplete="tel">
        <button type="button" class="rsv-submit" id="rsv-mine-search">חיפוש הזמנות</button>
        <div id="rsv-mine-msg"></div>
        <div id="rsv-mine-list"></div>
      </div>
    `));
    document.getElementById("rsv-mine-search").addEventListener("click", searchMine);
  }

  async function searchMine() {
    const phone = document.getElementById("rsv-mine-phone").value.trim();
    const msgBox = document.getElementById("rsv-mine-msg");
    const list = document.getElementById("rsv-mine-list");
    list.innerHTML = "";
    if (!phone) { msgBox.innerHTML = '<div class="rsv-msg error">נא להזין מספר טלפון</div>'; return; }

    msgBox.innerHTML = '<div class="rsv-msg" style="background:#f0f0f0;color:#555;"><span class="rsv-spinner" style="border-color:rgba(0,0,0,0.15);border-top-color:#555;"></span> מחפשים...</div>';
    const res = await window.SharedReservationsAPI.call("getReservationsByPhone", { phone });
    if (!res.success) { msgBox.innerHTML = `<div class="rsv-msg error">${escapeHtml(res.error || "שגיאה בחיפוש")}</div>`; return; }

    if (!res.reservations || res.reservations.length === 0) {
      msgBox.innerHTML = '<div class="rsv-msg" style="background:#f0f0f0;color:#555;">לא נמצאו הזמנות עתידיות למספר זה</div>';
      return;
    }
    msgBox.innerHTML = "";
    res.reservations.forEach((r) => {
      const item = el(`
        <div class="rsv-my-list-item">
          <div class="top"><span>${escapeHtml(r.date)} — ${escapeHtml(r.time)}</span><span>${escapeHtml(r.partySize)} סועדים</span></div>
          <button type="button" class="rsv-cancel-btn">ביטול הזמנה</button>
        </div>
      `);
      item.querySelector(".rsv-cancel-btn").addEventListener("click", () => cancelMine(r.id, phone, item));
      list.appendChild(item);
    });
  }

  async function cancelMine(reservationId, phone, itemEl) {
    if (!confirm("לבטל את ההזמנה?")) return;
    const btn = itemEl.querySelector(".rsv-cancel-btn");
    btn.disabled = true;
    btn.textContent = "מבטלים...";
    const res = await window.SharedReservationsAPI.call("cancelReservation", {
      reservationId, requestingPhone: phone,
    });
    if (!res.success) {
      btn.disabled = false;
      btn.textContent = "ביטול הזמנה";
      alert(res.error || "שגיאה בביטול ההזמנה");
      return;
    }
    itemEl.style.opacity = "0.5";
    btn.textContent = "בוטל ✓";
  }

  window.ReservationWidget = { init, showTab };
})();
