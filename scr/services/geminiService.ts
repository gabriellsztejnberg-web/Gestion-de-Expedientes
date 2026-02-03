
import { GoogleGenAI } from "@google/genai";

export const getLegalAdvice = async (prompt: string) => {
  // Always create a new GoogleGenAI instance right before making an API call to ensure use of the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a legal administrative assistant specialized in CRM and document management. Help the user summarize case histories or explain legal terms concisely.",
        temperature: 0.7,
      },
    });
    // Access the text property directly on the GenerateContentResponse object.
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating response. Please try again later.";
  }
};

export const summarizeTimeline = async (events: any[]) => {
  const prompt = `Summarize the following legal case activity timeline into a concise 2-sentence update: ${JSON.stringify(events)}`;
  return await getLegalAdvice(prompt);
};
