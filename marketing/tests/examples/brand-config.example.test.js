// Regression coverage for the worked example (marketing/lib/examples/*.example.js),
// decoupled from what actually ships as the live default (see ../brand-config.test.js
// for that). These are the exact-value assertions the original test suite had before
// this codebase became a template — they now run against the example files instead of
// the live brand-config.js, so the worked example stays internally consistent.

const BRAND_CONFIG = require("../../lib/examples/brand-config.example");
const LOCAL_KNOWLEDGE = require("../../lib/examples/local-knowledge.example");

describe("brand-config example (reference only — not loaded by the app)", () => {
  test("business identity", () => {
    expect(BRAND_CONFIG.name).toBe("6 בשוק");
    expect(BRAND_CONFIG.location).toBe("ערד");
    expect(BRAND_CONFIG.forbidden.phrases).toEqual(expect.arrayContaining(["כשר למהדרין", "תחת השגחה"]));
    expect(BRAND_CONFIG.forbidden.sensitiveTerms).toEqual(
      expect.arrayContaining(["כשר", "כשרות", "מהדרין", "תעודה", "השגחה"])
    );
  });

  test("sensitive-topic profile is filled in (the opt-in feature, demonstrated)", () => {
    expect(BRAND_CONFIG.audience.kashrutProfile).not.toBeNull();
    expect(BRAND_CONFIG.audience.kashrutProfile.target).toBe("לא שומרי כשרות הדוקים");
  });

  test("local knowledge base", () => {
    expect(LOCAL_KNOWLEDGE.history.founded).toBe(1962);
    expect(LOCAL_KNOWLEDGE.history.historicalSite.age).toBe("5000 שנה");
    expect(LOCAL_KNOWLEDGE.competitiveLandscape.pizzaPlaces).toEqual(
      expect.arrayContaining(["כפרוצקה - הוותיקה והמוכרת"])
    );
  });
});
