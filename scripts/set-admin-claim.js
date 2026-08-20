// scripts/set-admin-claim.js
// One-time helper: grants the { admin: true } custom claim to a Firebase Auth user,
// which the locked Realtime Database rules check via `auth.token.admin === true`.
//
// Usage (run on your own machine, NOT in the repo / not deployed):
//   1. Firebase Console → Project settings → Service accounts → Generate new private key
//      → save the downloaded file next to this script as `serviceAccountKey.json`.
//   2. npm init -y && npm install firebase-admin
//   3. node set-admin-claim.js <USER_UID>
//   4. Delete serviceAccountKey.json afterwards (it is a sensitive credential).
//
// To REVOKE later: node set-admin-claim.js <USER_UID> --revoke

const admin = require("firebase-admin");
const path = require("path");

const uid = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!uid) {
  console.error("Usage: node set-admin-claim.js <USER_UID> [--revoke]");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));
} catch {
  console.error("Missing serviceAccountKey.json next to this script (see header comment).");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin.auth().setCustomUserClaims(uid, revoke ? { admin: null } : { admin: true })
  .then(() => {
    console.log(`✓ admin claim ${revoke ? "revoked for" : "set for"} ${uid}`);
    console.log("The user must sign out and sign back in for the new token to take effect.");
    process.exit(0);
  })
  .catch((e) => { console.error("Failed:", e.message); process.exit(1); });
