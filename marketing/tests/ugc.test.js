jest.mock("../lib/fb", () => ({
  fbGet: jest.fn(), fbSet: jest.fn(), fbPatch: jest.fn(),
  fbPush: jest.fn(), fbDelete: jest.fn(), fbList: jest.fn()
}));

const fb = require("../lib/fb");
const submit = require("../../netlify/functions/ugc-submit");
const approve = require("../../netlify/functions/ugc-approve");

const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_PASSWORD = "test";
  process.env.FB_URL = "https://example.firebaseio.com";
});

describe("ugc-submit", () => {
  test("stores a valid submission as pending", async () => {
    fb.fbPush.mockResolvedValue("sub-1");
    const res = await submit.handler({
      httpMethod: "POST", headers: { "x-forwarded-for": "1.1.1.1" },
      body: JSON.stringify({ imageData: TINY_JPEG, customerName: "דנה", consentTag: true })
    });
    expect(res.statusCode).toBe(200);
    expect(fb.fbPush).toHaveBeenCalledWith("ugcSubmissions", expect.objectContaining({
      status: "pending", customerName: "דנה"
    }));
  });

  test("rejects non-image payloads", async () => {
    const res = await submit.handler({
      httpMethod: "POST", headers: { "x-forwarded-for": "2.2.2.2" },
      body: JSON.stringify({ imageData: "not-an-image", customerName: "x" })
    });
    expect(res.statusCode).toBe(400);
  });

  test("requires a customer name", async () => {
    const res = await submit.handler({
      httpMethod: "POST", headers: { "x-forwarded-for": "3.3.3.3" },
      body: JSON.stringify({ imageData: TINY_JPEG })
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("ugc-approve", () => {
  function adminPost(body) {
    return { httpMethod: "POST", headers: { "x-admin-token": "test" }, body: JSON.stringify(body) };
  }

  test("approve mints a coupon and creates an asset", async () => {
    fb.fbGet.mockImplementation(path => {
      if (path.startsWith("ugcSubmissions/")) {
        return Promise.resolve({ imageData: TINY_JPEG, customerName: "דנה", consentTag: true, status: "pending" });
      }
      return Promise.resolve(null); // coupon code is free
    });
    fb.fbSet.mockResolvedValue(null);
    fb.fbPatch.mockResolvedValue(null);
    fb.fbPush.mockResolvedValue("asset-1");

    const res = await approve.handler(adminPost({ id: "sub-1", action: "approve", couponPercent: 5 }));
    const data = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(data.couponCode).toMatch(/^UGC-/);
    expect(fb.fbPush).toHaveBeenCalledWith("marketingAssets", expect.objectContaining({ type: "ugc" }));
    expect(fb.fbPatch).toHaveBeenCalledWith("ugcSubmissions/sub-1", expect.objectContaining({ status: "approved" }));
  });

  test("reject flips status without minting", async () => {
    fb.fbGet.mockResolvedValue({ imageData: TINY_JPEG, customerName: "x", status: "pending" });
    fb.fbPatch.mockResolvedValue(null);
    const res = await approve.handler(adminPost({ id: "sub-2", action: "reject" }));
    expect(res.statusCode).toBe(200);
    expect(fb.fbPatch).toHaveBeenCalledWith("ugcSubmissions/sub-2", expect.objectContaining({ status: "rejected" }));
    expect(fb.fbSet).not.toHaveBeenCalled();
  });

  test("requires auth", async () => {
    const res = await approve.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ id: "x", action: "approve" }) });
    expect(res.statusCode).toBe(401);
  });
});
