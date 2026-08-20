// The template ships with BRAND_CONFIG.forbidden.sensitiveTerms empty by default (the
// feature is opt-in — see marketing/lib/brand-config.js and content-validator.js).
// These tests cover both sides: the mechanism works when a business configures it
// (mocked here the way the original "6 בשוק" example did — see
// marketing/lib/examples/brand-config.example.js), AND it's a true no-op when unset.

describe("Sensitive-topic validation (configured)", () => {
  jest.resetModules();
  jest.doMock("../lib/brand-config", () => ({
    BRAND_CONFIG: {
      forbidden: {
        phrases: [],
        sensitiveTerms: ["כשר", "כשרות", "מהדרין", "תעודה", "השגחה"],
        sensitiveTermsLabel: "כשרות"
      }
    }
  }));
  const { validate } = require("../lib/content-validator");

  test("flags posts that mention the sensitive topic", () => {
    const post = { text: "פיצה כשרה למהדרין!", hashtags: [] };
    const result = validate(post);
    expect(result.validation.passed).toBe(false);
    expect(result.validation.issues.some(i => i.includes("כשרות"))).toBe(true);
  });

  test("flags each configured term", () => {
    ["כשר", "כשרות", "מהדרין", "תעודה", "השגחה"].forEach(term => {
      const post = { text: `הפיצה שלנו ${term}`, hashtags: [] };
      const result = validate(post);
      expect(result.validation.passed).toBe(false);
    });
  });

  test("does not flag unrelated posts", () => {
    const post = { text: "פתוחים גם בשבת! מחכים לכם 🍕", hashtags: ["#פיצה"] };
    const result = validate(post);
    expect(result.validation.passed).toBe(true);
  });
});

describe("Sensitive-topic validation (default / unconfigured)", () => {
  jest.resetModules();
  jest.dontMock("../lib/brand-config");
  const { validate } = require("../lib/content-validator");

  test("is off by default — a real business's brand-config.js starts empty", () => {
    const post = { text: "הפיצה שלנו כשרה למהדרין!", hashtags: [] };
    const result = validate(post);
    expect(result.validation.passed).toBe(true);
  });
});
