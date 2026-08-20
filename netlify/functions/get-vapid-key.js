// netlify/functions/get-vapid-key.js
// Returns the public VAPID key for the client push subscription handshake.
// Public — the key is intentionally shareable (it identifies the server, not a secret).

exports.handler = async (event) => {
  if (event && event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  if (!publicKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "VAPID_PUBLIC_KEY not configured. Add it in Netlify env vars." })
    };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    body: JSON.stringify({ publicKey })
  };
};
