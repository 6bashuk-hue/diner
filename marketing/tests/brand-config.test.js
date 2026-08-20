const {
  BRAND_CONFIG, LOCAL_KNOWLEDGE, MARKETING_KNOWLEDGE, SYSTEM_PROMPT, CONSULTANT_ADDENDUM
} = require("../lib/brand-config");

describe("brand-config (shipped scaffold — empty by default)", () => {
  test("core config shape", () => {
    expect(typeof BRAND_CONFIG.name).toBe("string");
    expect(typeof BRAND_CONFIG.location).toBe("string");
    expect(Array.isArray(BRAND_CONFIG.forbidden.phrases)).toBe(true);
    expect(Array.isArray(BRAND_CONFIG.forbidden.sensitiveTerms)).toBe(true);
    expect(BRAND_CONFIG.forbidden.sensitiveTerms).toEqual([]);
    expect(BRAND_CONFIG.audience.kashrutProfile).toBeNull();
    expect(typeof LOCAL_KNOWLEDGE.history).toBe("object");
    expect(Array.isArray(MARKETING_KNOWLEDGE.cialdiniPrinciples)).toBe(true);
  });

  test("system prompt builds without unresolved template expressions", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(2000);
    expect(SYSTEM_PROMPT).not.toMatch(/\$\{/);
    // Generic marketing knowledge still comes through even with an empty brand
    expect(SYSTEM_PROMPT).toContain("Reciprocity");
    // Sensitive-topic section is entirely absent when kashrutProfile is null
    expect(SYSTEM_PROMPT).not.toContain("כשרות");
  });

  test("consultant addendum asks for JSON with needs_data contract", () => {
    expect(CONSULTANT_ADDENDUM).toContain("needs_data");
    expect(CONSULTANT_ADDENDUM).toContain("suggested_actions");
  });
});
