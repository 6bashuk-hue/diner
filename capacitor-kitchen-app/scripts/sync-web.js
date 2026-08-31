#!/usr/bin/env node
// Builds www/ from the site's real source files, without ever modifying them.
//
// - admin.html is copied byte-for-byte into www/index.html (Capacitor always
//   loads index.html as its entry point), except for one small, clearly
//   marked <script> block spliced in right after site.config.js loads. That
//   block is defined in www-inject/*.js — see those files for what and why.
// - Only the specific static files admin.html actually loads in the browser
//   are copied alongside it — not the rest of the site (no server code, no
//   secrets, no unrelated pages).
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const APP_ROOT = path.join(__dirname, "..");
const WWW_DIR = path.join(APP_ROOT, "www");
const INJECT_DIR = path.join(APP_ROOT, "www-inject");

// Change this if you ever rename admin.html or move it.
const SOURCE_HTML = "admin.html";

// Falls back to the domain already recorded in site.config.js
// (business.canonicalUrl) so there's a single place to edit it. Override
// per-build with `PROD_ORIGIN=https://your-real-domain npm run build`.
function readDefaultOrigin() {
  try {
    const configPath = path.join(REPO_ROOT, "site.config.js");
    const SITE_CONFIG = require(configPath);
    const url = SITE_CONFIG && SITE_CONFIG.business && SITE_CONFIG.business.canonicalUrl;
    if (url) return url.replace(/\/+$/, "");
  } catch (e) {
    console.warn("[sync-web] could not read site.config.js canonicalUrl:", e.message);
  }
  return "https://REPLACE-WITH-YOUR-DOMAIN.netlify.app";
}

const PROD_ORIGIN = (process.env.PROD_ORIGIN || readDefaultOrigin()).replace(/\/+$/, "");

function copyFile(relSrc, relDest) {
  const src = path.join(REPO_ROOT, relSrc);
  const dest = path.join(WWW_DIR, relDest || relSrc);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[sync-web] copied ${relSrc} -> www/${relDest || relSrc}`);
}

function buildInjectedBlock() {
  const files = ["fetch-bridge.js", "audio-loop-fix.js"];
  const parts = files.map((name) => {
    const src = fs.readFileSync(path.join(INJECT_DIR, name), "utf8");
    return src.replace(/__PROD_ORIGIN__/g, PROD_ORIGIN);
  });
  return (
    "\n<!-- ========= Injected at build time by capacitor-kitchen-app/scripts/sync-web.js =========\n" +
    "     Fixes for running admin.html inside a native Capacitor WebView (relative fetch\n" +
    "     URLs, audio loop). NOT present in the source admin.html — see www-inject/*.js. -->\n" +
    "<script>\n" + parts.join("\n") + "\n</script>\n" +
    "<!-- ========= End injected block ========= -->\n"
  );
}

function buildIndexHtml() {
  const srcPath = path.join(REPO_ROOT, SOURCE_HTML);
  let html = fs.readFileSync(srcPath, "utf8");

  const marker = '<script src="site.config.js"></script>';
  if (!html.includes(marker)) {
    throw new Error(`[sync-web] expected to find ${JSON.stringify(marker)} in ${SOURCE_HTML} to anchor the injected block`);
  }
  html = html.replace(marker, marker + "\n" + buildInjectedBlock());

  fs.mkdirSync(WWW_DIR, { recursive: true });
  fs.writeFileSync(path.join(WWW_DIR, "index.html"), html, "utf8");
  console.log(`[sync-web] wrote www/index.html from ${SOURCE_HTML} (PROD_ORIGIN=${PROD_ORIGIN})`);
}

function main() {
  fs.rmSync(WWW_DIR, { recursive: true, force: true });
  fs.mkdirSync(WWW_DIR, { recursive: true });

  buildIndexHtml();

  // Every other static file admin.html actually references in the browser.
  copyFile("site.config.js");
  copyFile("js/firebase-auth.js");
  copyFile("admin-manifest.json");
  copyFile("icon-192.png");
  copyFile("icon-512.png");
  copyFile("sounds/alert.wav");

  console.log("[sync-web] done.");
}

main();
