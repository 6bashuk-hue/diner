/* marketing/admin/prompt-fragments.js
   Shared prompt-scaffold text for the two "build a copy-paste Claude prompt" pages
   (consultant-bridge.html, content-workspace.html). Both used to hardcode nearly
   identical opening lines and a sensitive-topic (kashrut) paragraph independently —
   this file is now the one place that prose lives, so editing brand voice or turning
   the sensitive-topic feature on/off doesn't mean editing two files and hoping they
   stay in sync.
*/

// role: "advisor" (consultant-bridge's "you are my marketing advisor" framing) or
// "owner-request" (content-workspace's "I'm the owner, I need post variations" framing).
function buildBrandHeader(brand, role) {
  return role === "advisor"
    ? `אתה היועץ השיווקי שלי ל"${brand.name}" - ${brand.type} ב${brand.location}.`
    : `אני בעלים של "${brand.name}" - ${brand.type} ב${brand.location}. אני צריך 3 וריאציות לפוסט.`;
}

// Returns "" when the business has no sensitive-topic profile set (the default) —
// see marketing/lib/brand-config.js BRAND_CONFIG.audience.kashrutProfile.
function buildSensitiveTopicBlock(brand) {
  const p = brand && brand.audience && brand.audience.kashrutProfile;
  if (!p) return "";
  const label = (brand.forbidden && brand.forbidden.sensitiveTermsLabel) || "הנושא הרגיש";
  return `\nחשוב לגבי ${label}:\n- הקהל שלנו: ${p.target}\n- ${p.messagingRule}\n`;
}

window.PromptFragments = { buildBrandHeader, buildSensitiveTopicBlock };
