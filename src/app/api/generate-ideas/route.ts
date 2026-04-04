import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { trends, recentCategories } = await req.json() as any;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ideas: [] });

  const prompt = `You are the editorial director of PPP TV Kenya — a premium Kenyan entertainment, sports, and tech media brand.

Generate exactly 8 specific, actionable content ideas for today based on:
- Kenya trending topics right now: ${trends || "general Kenya entertainment"}
- Recent categories posted: ${recentCategories || "CELEBRITY, SPORTS, MUSIC"}

Rules:
- Focus ONLY on: entertainment, sports, music, celebrity, comedy, technology (Kenyan angle)
- NO politics, NO elections, NO government, NO crime
- Each idea must be specific and actionable — not generic
- Prioritize Kenyan content, then African, then international
- Consider what's trending and what gaps exist in recent posts

Return ONLY valid JSON array with this exact structure:
[
  {
    "id": "1",
    "title": "Short punchy title",
    "angle": "Specific approach — what to post and how",
    "category": "CELEBRITY|MUSIC|SPORTS|TV & FILM|ENTERTAINMENT|COMEDY|TECHNOLOGY|GENERAL",
    "source": "Where to find this content",
    "why": "One sentence on why this will perform well",
    "captionHook": "Opening line for the caption",
    "urgency": "high|medium|low",
    "generatedAt": "${new Date().toISOString()}"
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2000 },
        }),
        signal: AbortSignal.timeout(25000),
      }
    );

    if (!res.ok) return NextResponse.json({ ideas: [] });
    const data = await res.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ ideas: [] });

    const ideas = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ideas });
  } catch {
    return NextResponse.json({ ideas: [] });
  }
}
