// marketing/lib/content-validator.js
// Validates generated marketing posts against brand rules.
// `validate(post)` runs content-level checks (forbidden phrases, kashrut, length, hashtags).
// `validateContent(parsed)` runs the same checks over every variation in a generation
// payload and adds stricter completeness checks (copy-paste version, hashtags present).

const { BRAND_CONFIG } = require("./brand-config");

// Opt-in — off by default. Set BRAND_CONFIG.forbidden.sensitiveTerms in
// marketing/lib/brand-config.js if your business needs the AI marketing assistant to
// flag certain words unprompted (the original example was kashrut terms, since that
// business is open on Shabbat and not kosher-certified — see
// marketing/lib/examples/brand-config.example.js). Most businesses can leave this empty.
const SENSITIVE_TERMS = Array.isArray(BRAND_CONFIG.forbidden.sensitiveTerms)
  ? BRAND_CONFIG.forbidden.sensitiveTerms : [];
const SENSITIVE_LABEL = BRAND_CONFIG.forbidden.sensitiveTermsLabel || "נושא רגיש";
const MAX_POST_LENGTH = 2200;
const MAX_HASHTAGS = 5;

function checkPost(post) {
  const issues = [];
  const text = (post && post.text) || "";

  BRAND_CONFIG.forbidden.phrases.forEach(phrase => {
    if (text.includes(phrase)) issues.push(`כולל ביטוי אסור: "${phrase}"`);
  });

  SENSITIVE_TERMS.forEach(term => {
    if (text.includes(term)) issues.push(`מזכיר ${SENSITIVE_LABEL}: "${term}" - לא לשיווק`);
  });

  if (text.length > MAX_POST_LENGTH) issues.push("פוסט ארוך מדי לאינסטגרם");
  if (post && Array.isArray(post.hashtags) && post.hashtags.length > MAX_HASHTAGS) {
    issues.push("יותר מדי hashtags");
  }

  return issues;
}

function validate(post) {
  const issues = checkPost(post);
  return { ...post, validation: { issues, passed: issues.length === 0 } };
}

function validateContent(parsed) {
  if (!parsed || !Array.isArray(parsed.variations)) return parsed;

  parsed.variations = parsed.variations.map(v => {
    const issues = checkPost(v);
    if (!v.hashtags || v.hashtags.length === 0) issues.push("חסרים hashtags");
    if (!v.copy_paste_version) issues.push("חסרה גרסת העתקה");
    return { ...v, validation: { issues, passed: issues.length === 0 } };
  });

  return parsed;
}

module.exports = { validate, validateContent, checkPost, SENSITIVE_TERMS, MAX_POST_LENGTH, MAX_HASHTAGS };
