const ALLOWED_KEYS = new Set(["clips", "episodes"]);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requireConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const missing = [
      !url && "UPSTASH_REDIS_REST_URL or KV_REST_API_URL",
      !token && "UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN"
    ].filter(Boolean);
    const err = new Error(`Missing env: ${missing.join(", ")}`);
    err.statusCode = 500;
    throw err;
  }
  return { url, token };
}

async function redis(command) {
  const { url, token } = requireConfig();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err = new Error(data.error || `Redis request failed: ${response.status}`);
    err.statusCode = 502;
    throw err;
  }
  return data.result;
}

function verifyAdmin(password) {
  const expected = process.env.ADMIN_PASSWORD || process.env.SITE_PASSWORD || "1149";
  return typeof password === "string" && password === expected;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const key = String(req.query.key || "");
      if (!ALLOWED_KEYS.has(key)) return send(res, 400, { error: "Invalid key" });
      const value = await redis(["GET", key]);
      return send(res, 200, { value: value || "[]" });
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      if (body.action === "auth") {
        return send(res, verifyAdmin(body.adminPassword) ? 200 : 401, {
          ok: verifyAdmin(body.adminPassword)
        });
      }

      const key = String(body.key || "");
      if (!ALLOWED_KEYS.has(key)) return send(res, 400, { error: "Invalid key" });
      if (!verifyAdmin(body.adminPassword)) return send(res, 401, { error: "Unauthorized" });
      if (typeof body.value !== "string") return send(res, 400, { error: "Value must be a string" });

      await redis(["SET", key, body.value]);
      return send(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
};
