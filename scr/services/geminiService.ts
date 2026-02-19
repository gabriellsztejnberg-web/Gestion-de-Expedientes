
import { GoogleGenAI } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Función genérica para consultoría legal o administrativa
export const getLegalAdvice = async (prompt: string) => {
  const ai = getAIClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "Eres un asistente administrativo legal experto en gestión pública y normativa DPAM (División Planes). Tu objetivo es resumir historiales o explicar términos legales de forma concisa y profesional.",
        temperature: 0.7,
      },
    });
    return response.text || "No se pudo generar una respuesta.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generando respuesta. Verifique su conexión o clave API.";
  }
};

// 1. Asistente de Redacción para Inspecciones
export const draftTechnicalReport = async (rawNotes: string, context: string) => {
  const ai = getAIClient();
  const prompt = `
    Contexto: Inspección técnica en ${context}.
    Notas del inspector (borrador): "${rawNotes}"
    
    Tarea: Reescribe estas notas convirtiéndolas en un informe técnico formal, objetivo y preciso. 
    Usa terminología de seguridad e higiene o normativa portuaria según corresponda. 
    Corrige ortografía y gramática. NO agregues información inventada, solo da formato profesional a lo provisto.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { temperature: 0.3 }, // Baja temperatura para ser preciso
    });
    return response.text?.trim() || rawNotes;
  } catch (error) {
    console.error("Gemini Error (Draft):", error);
    return rawNotes;
  }
};

// 2. Analista de Historial de Expedientes
export const analyzeExpedienteHistory = async (caseData: any, events: any[]) => {
  const ai = getAIClient();
  
  // Filtramos solo los datos relevantes para no saturar el contexto
  const relevantEvents = events.map(e => `${e.fecha}: ${e.tipoAccion} - ${e.texto}`).join('\n');
  
  const prompt = `
    Expediente: ${caseData.numero} (${caseData.empresa})
    Trámite: ${caseData.tramite}
    
    Historial de Movimientos:
    ${relevantEvents}
    
    Tarea:
    1. Genera un "Resumen Ejecutivo" de 2 o 3 oraciones explicando en qué estado real se encuentra el trámite.
    2. Identifica si hay alguna demora o bloqueo evidente.
    3. Sugiere el "Próximo Paso Administrativo" lógico.
    
    Formato de salida: Texto plano conciso.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { temperature: 0.5 },
    });
    return response.text?.trim() || "No se pudo analizar el historial.";
  } catch (error) {
    console.error("Gemini Error (Analyze):", error);
    return "Error al conectar con el asistente IA.";
  }
};

export const summarizeTimeline = async (events: any[]) => {
  const prompt = `Resume la siguiente línea de tiempo de actividad legal en 2 oraciones: ${JSON.stringify(events)}`;
  return await getLegalAdvice(prompt);
};
