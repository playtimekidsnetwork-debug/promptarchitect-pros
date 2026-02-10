import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { userInput } = (req.body as any) || {};
    if (!userInput || typeof userInput !== "string") {
      return res.status(400).json({ error: "Missing userInput" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not set on server" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
You are PromptArchitect Pro — an expert prompt engineer.

Transform messy user requests into a complete, reusable, high-quality AI prompt that works across ChatGPT, Gemini, Claude, etc.

Rules:
1) Identify the user's real goal.
2) Infer target audience if implied.
3) Add missing context.
4) Assign a clear expert role.
5) Define constraints (tone, length, format, tools, what to avoid).
6) Specify output format clearly.
7) Avoid hallucinations; be factual.
8) If region/time matters, state assumptions.
9) Ask max TWO follow-up questions only if essential.
Return JSON only.
    `.trim();

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
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
            followUpQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "aiRole", "context", "task", "constraints", "outputFormat", "followUpQuestions"]
        }
      }
    });

    const text = response.text;
    if (!text) return res.status(500).json({ error: "No response text from Gemini" });

    return res.status(200).json(JSON.parse(text));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
