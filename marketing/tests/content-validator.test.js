// content-validator.js reads BRAND_CONFIG.forbidden.phrases, which ships empty by
// default in the template (marketing/lib/brand-config.js). Mock it here so the
// mechanism test doesn't depend on a business having filled in real phrases.
jest.mock("../lib/brand-config", () => ({
  BRAND_CONFIG: { forbidden: { phrases: ["הכי טעים בעולם"], sensitiveTerms: [], sensitiveTermsLabel: "" } }
}));

const { validate, validateContent } = require("../lib/content-validator");

describe("content-validator", () => {
  test("clean post passes", () => {
    const post = { text: "פיצה חמה מהטאבון מחכה לכם הערב 🍕", hashtags: ["#ערד", "#פיצה"] };
    expect(validate(post).validation.passed).toBe(true);
  });

  test("forbidden phrase is flagged", () => {
    const post = { text: "הפיצה הכי טעים בעולם", hashtags: ["#ערד"] };
    const result = validate(post);
    expect(result.validation.passed).toBe(false);
    expect(result.validation.issues.some(i => i.includes("ביטוי אסור"))).toBe(true);
  });

  test("too many hashtags is flagged", () => {
    const post = { text: "פוסט", hashtags: ["#1", "#2", "#3", "#4", "#5", "#6"] };
    expect(validate(post).validation.issues.some(i => i.includes("hashtags"))).toBe(true);
  });

  test("validateContent requires copy_paste_version and hashtags per variation", () => {
    const parsed = {
      variations: [
        { text: "טוב", hashtags: ["#ערד"], copy_paste_version: "טוב #ערד" },
        { text: "חסר", hashtags: [] }
      ]
    };
    const out = validateContent(parsed);
    expect(out.variations[0].validation.passed).toBe(true);
    expect(out.variations[1].validation.passed).toBe(false);
    expect(out.variations[1].validation.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("hashtags"), expect.stringContaining("העתקה")])
    );
  });

  test("validateContent tolerates malformed payload", () => {
    expect(validateContent({}).variations).toBeUndefined();
    expect(validateContent(null)).toBeNull();
  });
});
