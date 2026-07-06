import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5";

function parseTags(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((tag) => String(tag).trim())
          .filter((tag) => tag.length >= 2 && tag.length <= 12)
      )
    ).slice(0, 3);
  } catch {
    return [];
  }
}

function fallbackTags(text: string, existingTags: string[]) {
  const normalized = text.toLowerCase();
  const reused = existingTags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => normalized.includes(tag.toLowerCase()));

  const inferred = [
    [/만화|웹툰|그림|일러스트|image|comic|toon/i, "만화"],
    [/글쓰기|작법|문장|소설|writing|story/i, "글쓰기"],
    [/개발|코딩|프로그래밍|코드|developer|code|programming/i, "개발"],
    [/디자인|브랜드|ui|ux|design/i, "디자인"],
    [/음악|노래|앨범|music|song/i, "음악"],
    [/영화|드라마|애니|movie|film|anime/i, "영상"],
    [/책|독서|서평|book|reading/i, "책"],
    [/여행|공간|카페|travel|place/i, "장소"],
    [/뉴스|정치|사회|news/i, "뉴스"],
    [/ai|인공지능|claude|chatgpt|openai/i, "AI"]
  ]
    .filter(([pattern]) => (pattern as RegExp).test(text))
    .map(([, tag]) => tag as string);

  const tags = Array.from(new Set([...reused, ...inferred])).slice(0, 3);
  return tags.length ? tags : ["읽을거리"];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; existingTags?: string[] };
    const text = body.text?.trim() ?? "";
    const existingTags = body.existingTags ?? [];
    if (!text || !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ tags: text ? fallbackTags(text, existingTags) : [] });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        "당신은 아카이브 태그 분류기다. 주어진 글에 맞는 한국어 태그를 1~3개 제안한다. 기존 태그 목록에서 맞는 것이 있으면 반드시 그것을 우선 재사용하고, 정말 없을 때만 새 태그를 만든다. 태그는 2~6자 명사형. JSON 문자열 배열만 출력하고 다른 텍스트는 절대 포함하지 마라.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            text,
            existingTags
          })
        }
      ]
    });

    const output = message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    const tags = parseTags(output);
    return NextResponse.json({ tags: tags.length ? tags : fallbackTags(text, existingTags) });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
