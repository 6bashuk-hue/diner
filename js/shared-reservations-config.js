// Public config for the shared table-reservation system (project
// "shared-reservations" — see its README.md for deployment). Safe to expose
// publicly: it's just an HTTPS endpoint base and which brand this site is.
// REPLACE baseUrl once the Firebase project is deployed — see that repo's
// README.md step "Deploy" for the exact project ID this becomes.
window.SHARED_RESERVATIONS_CONFIG = {
  baseUrl: "https://europe-west1-REPLACE_WITH_PROJECT_ID.cloudfunctions.net",
  source: "hadiner", // must be exactly "6bashuk" | "adela" | "hadiner" — see shared-reservations API.md
};
