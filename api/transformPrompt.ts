import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { userInput } = (req.body ?? {}) as { userInput?: string };

    if (!userInput || typeof userInput !== "string") {
      return res.status(400).json({ error: "Missing userInput" });
    }

    // Server-only env var (set in Vercel Project Settings → Environment Variables)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not set on server" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
You are an expert AI Prompt Engineer and Research Assistant.
Transform a simple user request into a complete, high-quality, accurate, reusable AI prompt.

Rules:
1) Identify the user's true goal and intent.
2) Identify target audience if implied.
3) Add necessary context.
4) Assign a clear expert role to the AI.
5) Define constraints (tone, length, format, tools, limitations).
6) Specify output format clearly.
7) Ensure factual accuracy and avoid hallucination.
8) If info varies by region/time, include assumptions.
9) Ask MAXIMUM of TWO follow-up questions only.
Return JSON only.
`.trim();

    const response = await ai.models.generateContent({
      // ✅ Use a real current model ID
      model: model: "gemini-1.5-pro",
      contents: userInput,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            aiRole: { type: Type.STRING },
            context: { type: Type.STRING },
            task: { type: Type.STRING },
            constraints: { type: Type.STRING },
            outputFormat: { type: Type.STRING },
            followUpQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            "title",
            "aiRole",
            "context",
            "task",
            "constraints",
            "outputFormat",
            "followUpQuestions",
          ],
        },
      },
    });

    const text = response.text;
    if (!text) return res.status(500).json({ error: "No response text from Gemini" });

    // Return parsed JSON to the frontend
    return res.status(200).json(JSON.parse(text));
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || "Server error",
    });
  }
}
