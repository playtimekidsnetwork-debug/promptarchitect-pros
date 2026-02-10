import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { userInput } = req.body || {};

    if (!userInput || typeof userInput !== "string") {
      return res.status(400).json({ error: "Missing userInput" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not set" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
You are an expert AI Prompt Engineer.
Transform a user idea into a clear, reusable, expert-level AI prompt.

Rules:
- Identify goal and audience
- Add context
- Assign expert role
- Define constraints
- Specify output format
- Ask max TWO follow-up questions
Return JSON only.
`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: userInput,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;

    if (!text) {
      return res.status(500).json({ error: "Empty response from Gemini" });
    }

    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Server error",
      details: String(err),
    });
  }
}
