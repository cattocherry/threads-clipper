import { NextResponse } from "next/server";

export const runtime = "nodejs";

const THREADS_HOSTS = new Set(["threads.net", "www.threads.net", "threads.com", "www.threads.com"]);

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function meta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return "";
}

function parseAuthor(title: string) {
  const match = title.match(/^(.*?)\s+\(@([^)]+)\)\s+on Threads/i);
  return {
    authorName: match?.[1]?.trim() ?? "",
    author: match?.[2] ? `@${match[2].trim()}` : ""
  };
}

export async function POST(request: Request) {
  let url = "";
  try {
    const body = (await request.json()) as { url?: string };
    url = body.url ?? "";
    const parsed = new URL(url);
    if (!THREADS_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: "Threads 링크만 저장할 수 있어요." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);
    const html = await response.text();
    const title = meta(html, "og:title");
    const description = meta(html, "og:description");
    const image = meta(html, "og:image");
    const author = parseAuthor(title);

    return NextResponse.json({
      author: author.author,
      authorName: author.authorName,
      previewText: description || title,
      thumbnail: image
    });
  } catch {
    return NextResponse.json({
      author: "",
      authorName: "",
      previewText: "",
      thumbnail: ""
    });
  }
}
