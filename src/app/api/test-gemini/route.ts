import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 30;

export async function GET(req: Request) {
  const apiKey = req.headers.get("X-Gemini-Key") || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set", keySet: false });
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: "Write a 5-word headline about Khaligraph Jones dropping a new song. ALL CAPS only." }] }],
      config: {
        systemInstruction: "You write short punchy headlines. Always ALL CAPS. Max 7 words.",
        temperature: 0.5,
        maxOutputTokens: 50,
      },
    });
    const text = response.text?.trim() ?? "";
    return NextResponse.json({ 
      ok: true, 
      keySet: true,
      headline: text,
      keyPrefix: apiKey.slice(0, 8) + "...",
    });
  } catch (err: any) {
    return NextResponse.json({ 
      error: err.message, 
      errorType: err.constructor?.name,
      keySet: true,
      keyPrefix: apiKey.slice(0, 8) + "...",
    }, { status: 500 });
  }
}
