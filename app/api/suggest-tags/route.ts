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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; existingTags?: string[] };
    const text = body.text?.trim() ?? "";
    if (!text || !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ tags: [] });
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
            existingTags: body.existingTags ?? []
          })
        }
      ]
    });

    const output = message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    return NextResponse.json({ tags: parseTags(output) });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
