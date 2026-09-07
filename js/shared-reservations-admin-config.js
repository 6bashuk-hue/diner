// Admin-only secret for the shared-reservations Cloud Functions (updateSettings,
// listTables/createTable/updateTable/deleteTable, getReservationsByDate, and the
// admin override on cancelReservation — see "Admin functions" in that repo's
// API.md). All three brand sites share the SAME value here, because it's one
// shared backend with one shared admin key — not per-brand.
//
// REPLACE the value below with the real ADMIN_API_KEY you set via
// `firebase functions:secrets:set ADMIN_API_KEY` when deploying shared-reservations.
//
// This file is loaded on demand, only after a successful admin login (see
// ensureAdminConfigLoaded() in reservations-admin.js) — never as a static
// <script> tag on a publicly reachable page — so a site visitor who never
// authenticates never receives this value. It is still a plain static value
// shipped in client JS rather than a per-user credential, so treat it like
// any other value that must never appear in a public page's source.
window.SHARED_RESERVATIONS_ADMIN_CONFIG = {
  adminKey: "REPLACE_WITH_ADMIN_API_KEY",
};
