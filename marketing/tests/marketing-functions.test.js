jest.mock("../lib/fb", () => ({
  fbGet: jest.fn(), fbSet: jest.fn(), fbPatch: jest.fn(),
  fbPush: jest.fn(), fbDelete: jest.fn(), fbList: jest.fn()
}));

const fb = require("../lib/fb");
const research = require("../../netlify/functions/local-research-add");
const knowledge = require("../../netlify/functions/get-knowledge");
const consultantCtx = require("../../netlify/functions/get-consultant-context");

function adminPost(body) {
  return { httpMethod: "POST", headers: { "x-admin-token": "test" }, body: JSON.stringify(body) };
}
function adminGet() {
  return { httpMethod: "GET", headers: { "x-admin-token": "test" } };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = "test";
  process.env.FB_URL = "https://example.firebaseio.com";
});

describe("local-research-add (no AI)", () => {
  test("stores raw post without any claudeAnalysis", async () => {
    fb.fbPush.mockResolvedValue("r-1");
    const res = await research.handler(adminPost({
      businessName: "פלאפל בערד", postText: "סיפור מקומי", category: "קהילה",
      engagement: { likes: 50 }, userAnalysis: "אותנטי"
    }));
    expect(res.statusCode).toBe(200);
    const [node, record] = fb.fbPush.mock.calls[0];
    expect(node).toBe("localResearch");
    expect(record.businessName).toBe("פלאפל בערד");
    expect(record).not.toHaveProperty("claudeAnalysis");
  });

  test("requires auth", async () => {
    const res = await research.handler({ httpMethod: "POST", headers: {}, body: "{}" });
    expect(res.statusCode).toBe(401);
  });
});

describe("get-knowledge", () => {
  test("returns brand + local knowledge (endpoint wiring, not brand content)", async () => {
    const res = await knowledge.handler(adminGet());
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(typeof data.brand.name).toBe("string");
    expect(typeof data.local.history).toBe("object");
  });

  test("rejects wrong token", async () => {
    const res = await knowledge.handler({ httpMethod: "GET", headers: { "x-admin-token": "nope" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("get-consultant-context", () => {
  test("includes brand and analyzed orders when requested", async () => {
    fb.fbList.mockResolvedValue([
      { items: [{ name: "מרגריטה", quantity: 2 }], total: 60, ts: Date.now() },
      { items: [{ name: "מרגריטה", quantity: 1 }], total: 55, ts: Date.now() }
    ]);
    const res = await consultantCtx.handler(adminPost({ includeOrders: true }));
    const data = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(typeof data.brand.name).toBe("string");
    expect(data.orders.totalOrders).toBe(2);
    expect(data.orders.topItems[0][0]).toBe("מרגריטה");
    expect(data.orders.topItems[0][1]).toBe(3);
  });

  test("analyzeOrders handles empty input", () => {
    const out = consultantCtx.analyzeOrders([]);
    expect(out.totalOrders).toBe(0);
    expect(out.avgOrder).toBe(0);
  });
});
