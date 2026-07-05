function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.end(JSON.stringify(body));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, "i")
  ];
  const match = patterns.map((pattern) => html.match(pattern)).find(Boolean);
  return match ? decodeHtml(match[1]).trim() : "";
}

function cleanTitle(title, description) {
  const value = description || title;
  return value
    .replace(/\s+/g, " ")
    .replace(/^@[^ ]+ on Threads$/i, "")
    .trim()
    .slice(0, 80);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return send(res, 405, { error: "Method not allowed" });
    }

    const url = String(req.query.url || "");
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return send(res, 400, { error: "Invalid URL" });

    const response = await fetch(parsed.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PebbletoonArchive/1.0)",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) return send(res, 200, { title: "", image: "" });

    const html = await response.text();
    const title = metaContent(html, "og:title") || metaContent(html, "twitter:title");
    const description = metaContent(html, "og:description") || metaContent(html, "description") || metaContent(html, "twitter:description");
    const image = metaContent(html, "og:image") || metaContent(html, "twitter:image");

    return send(res, 200, {
      title: cleanTitle(title, description),
      image
    });
  } catch (error) {
    return send(res, 200, { title: "", image: "" });
  }
};
