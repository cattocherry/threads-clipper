import { NextResponse } from "next/server";

export const runtime = "nodejs";

const THREADS_HOSTS = new Set(["threads.net", "www.threads.net", "threads.com", "www.threads.com"]);

const USER_AGENTS = [
  {
    label: "facebookexternalhit",
    value: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
  },
  {
    label: "twitterbot",
    value: "Mozilla/5.0 (compatible; Twitterbot/1.0)"
  },
  {
    label: "chrome",
    value:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
  }
];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeUrl(input: string) {
  const parsed = new URL(input.trim());
  if (!THREADS_HOSTS.has(parsed.hostname)) {
    throw new Error("INVALID_HOST");
  }
  parsed.hostname = "www.threads.com";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function attributes(tag: string) {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/"'>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function metaTags(html: string) {
  const result: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (!key || attrs.content === undefined) continue;
    result[key] = attrs.content.trim();
  }
  return result;
}

function parseAuthor(title: string, url: URL) {
  const titlePatterns = [
    /^(.*?)\s+\(@([^)]+)\)\s+(?:on|님이 Threads에 게시)/i,
    /^Threads(?:의|에서)\s+(.*?)\(@([^)]+)\)님/i,
    /^(.+?)\s+on Threads:\s*["“]/i,
    /^@?([A-Za-z0-9._]+)\s+on Threads/i
  ];
  for (const pattern of titlePatterns) {
    const match = title.match(pattern);
    if (!match) continue;
    if (match[2]) {
      return { authorName: match[1].trim(), author: `@${match[2].trim().replace(/^@/, "")}` };
    }
    const value = match[1].trim();
    return { authorName: value.startsWith("@") ? "" : value, author: value.startsWith("@") ? value : "" };
  }
  const handle = url.pathname.match(/\/@([^/]+)/)?.[1];
  return { authorName: "", author: handle ? `@${decodeURIComponent(handle)}` : "" };
}

function ogResult(html: string, url: URL) {
  const meta = metaTags(html);
  const title = meta["og:title"] || meta["twitter:title"] || "";
  const description = meta["og:description"] || meta["twitter:description"] || meta.description || "";
  const image = meta["og:image"] || meta["twitter:image"] || "";
  const author = parseAuthor(title, url);
  return {
    author: author.author,
    authorName: author.authorName,
    previewText: description || title,
    thumbnail: image,
    title,
    description
  };
}

function embedUrl(url: URL) {
  const next = new URL(url.toString());
  next.pathname = next.pathname.replace(/\/$/, "") + "/embed";
  return next;
}

function extractJsonStrings(html: string) {
  const strings = new Set<string>();
  for (const match of html.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
    try {
      const parsed = JSON.parse(`"${match[1]}"`);
      if (typeof parsed === "string") strings.add(parsed);
    } catch {
      // Ignore malformed app-shell fragments.
    }
  }
  return Array.from(strings).map((value) => decodeHtml(value));
}

function embedResult(html: string, url: URL) {
  const meta = ogResult(html, url);
  const strings = extractJsonStrings(html);
  const handleFromUrl = url.pathname.match(/\/@([^/]+)/)?.[1];
  const handle =
    strings.find((value) => /^@[A-Za-z0-9._]{2,}$/.test(value)) ||
    (handleFromUrl ? `@${decodeURIComponent(handleFromUrl)}` : "");
  const text =
    meta.previewText ||
    strings
      .filter((value) => {
        const clean = value.trim();
        return (
          clean.length >= 12 &&
          clean.length <= 1000 &&
          !clean.startsWith("http") &&
          !/^[Mm]\d+[\d.,A-Za-z\s-]+[Zz]$/.test(clean) &&
          !clean.includes("__bbox") &&
          !clean.includes("Comet")
        );
      })
      .sort((a, b) => b.length - a.length)[0] ||
    stripTags(html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "");

  return {
    author: meta.author || handle,
    authorName: meta.authorName,
    previewText: text,
    thumbnail: meta.thumbnail,
    title: meta.title
  };
}

async function fetchHtml(url: URL, userAgent: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ko-KR;q=0.8,ko;q=0.7",
        "Cache-Control": "no-cache"
      }
    });
    const html = await response.text();
    return { response, html };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const normalized = normalizeUrl(body.url ?? "");

    for (const userAgent of USER_AGENTS) {
      try {
        const { response, html } = await fetchHtml(normalized, userAgent.value);
        const parsed = ogResult(html, normalized);
        if (parsed.description && !response.url.includes("error=invalid_post")) {
          return NextResponse.json({
            author: parsed.author,
            authorName: parsed.authorName,
            previewText: parsed.previewText,
            thumbnail: parsed.thumbnail
          });
        }
      } catch (error) {
        // Try the next user agent before falling back to the embed endpoint.
      }
    }

    const embed = embedUrl(normalized);
    for (const userAgent of USER_AGENTS) {
      try {
        const { response, html } = await fetchHtml(embed, userAgent.value);
        const parsed = embedResult(html, normalized);
        if ((parsed.previewText || parsed.author) && !response.url.includes("error=invalid_post")) {
          return NextResponse.json({
            author: parsed.author,
            authorName: parsed.authorName,
            previewText: parsed.previewText,
            thumbnail: parsed.thumbnail
          });
        }
      } catch (error) {
        // Keep saving resilient even when Threads blocks or reshapes a response.
      }
    }

    return NextResponse.json({ author: "", authorName: "", previewText: "", thumbnail: "" });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_HOST") {
      return NextResponse.json({ error: "Threads 링크만 저장할 수 있어요." }, { status: 400 });
    }
    return NextResponse.json({ author: "", authorName: "", previewText: "", thumbnail: "" });
  }
}
