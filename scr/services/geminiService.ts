
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURACIÓN DE API KEY ---
const MANUAL_API_KEY = "AIzaSyAIqTkZLbil5Fgrc3OSmj-qB1Ljm3iodSs"; 

// --- LISTA DE MODELOS A PROBAR (EN ORDEN DE PREFERENCIA) ---
// El sistema probará uno por uno hasta que uno responda exitosamente.
// Esto evita el error "Modelo no disponible en su región".
const MODEL_CANDIDATES = [
  "gemini-2.0-flash-exp",      // 1. El más rápido y nuevo (Experimental)
  "gemini-1.5-flash",          // 2. El estándar actual (Estable)
  "gemini-1.5-flash-latest",   // 3. Alternativa del estándar
  "gemini-1.0-pro",            // 4. Versión anterior muy compatible
  "gemini-pro"                 // 5. Legacy (Último recurso)
];

const getAIClient = () => {
  let apiKey = "";
  try {
    if (typeof process !== "undefined" && process.env && process.env.API_KEY) {
      apiKey = process.env.API_KEY;
    }
  } catch (e) {}

  if (!apiKey) apiKey = MANUAL_API_KEY;
  
  if (!apiKey) throw new Error("MISSING_API_KEY");

  return new GoogleGenAI({ apiKey });
};

// --- FUNCIÓN NÚCLEO: INTENTO ROTATIVO ---
async function generateWithRetry(prompt: string, systemInstruction?: string, temperature: number = 0.7) {
  const ai = getAIClient();
  const config = { systemInstruction, temperature };

  let lastError = null;

  // Iteramos sobre la lista de modelos
  for (const modelName of MODEL_CANDIDATES) {
    try {
      // Intentamos generar contenido con el modelo actual
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config,
      });
      
      // Si llegamos aquí, funcionó. Retornamos el texto.
      return response.text;

    } catch (error: any) {
      const msg = (error.message || "").toLowerCase();
      console.warn(`Falló modelo ${modelName}: ${msg}`);
      lastError = error;

      // Si el error es de autenticación (Key inválida), no tiene sentido seguir probando modelos.
      if (msg.includes("403") || msg.includes("key") || msg.includes("permission")) {
        throw error;
      }
      // Si es 404 (No encontrado/Region), 429 (Cuota) o 5xx (Server), seguimos al siguiente modelo del bucle.
      continue;
    }
  }

  // Si terminamos el bucle y ninguno funcionó, lanzamos el último error.
  throw lastError;
}

// --- SERVICIOS EXPORTADOS (Usan la función rotativa) ---

export const getLegalAdvice = async (prompt: string) => {
  try {
    const text = await generateWithRetry(
      prompt, 
      "Eres un asistente administrativo legal experto en gestión pública y normativa DPAM. Responde de forma breve y profesional."
    );
    return text || "Sin respuesta.";
  } catch (error: any) {
    return formatGeminiError(error);
  }
};

export const draftTechnicalReport = async (rawNotes: string, context: string) => {
  const prompt = `Contexto: ${context}. Borrador: "${rawNotes}". Redacta un informe técnico formal.`;
  try {
    const text = await generateWithRetry(prompt, undefined, 0.3);
    return text?.trim() || rawNotes;
  } catch (error: any) {
    return rawNotes + `\n[Error IA: ${formatGeminiError(error)}]`;
  }
};

export const analyzeExpedienteHistory = async (caseData: any, events: any[]) => {
  const relevantEvents = events.map(e => `${e.fecha}: ${e.tipoAccion} - ${e.texto}`).join('\n');
  const prompt = `
    Expediente: ${caseData.numero} (${caseData.empresa}). Trámite: ${caseData.tramite}.
    Historial: ${relevantEvents}
    Tarea: Resumen ejecutivo del estado actual (2 lineas) y próximo paso sugerido.
  `;
  try {
    const text = await generateWithRetry(prompt, undefined, 0.5);
    return text?.trim() || "No se pudo analizar.";
  } catch (error: any) {
    return `Error IA: ${formatGeminiError(error)}`;
  }
};

export const summarizeReportRow = async (numero: string, empresa: string, rawMovements: string) => {
  const prompt = `Expediente ${numero} (${empresa}). Movimientos: ${rawMovements}. Redacta un resumen narrativo de 1 párrafo formal administrativo.`;
  try {
    const text = await generateWithRetry(prompt, undefined, 0.4);
    return text?.trim() || rawMovements;
  } catch (error) {
    return rawMovements;
  }
};

export const analyzeAuditorProfile = async (auditorData: any) => {
  const prompt = `Analiza perfil auditor: ${auditorData.nombre}. Cursos: ${JSON.stringify(auditorData.cursos)}. Stats: ${JSON.stringify(auditorData.stats)}. Breve reseña profesional.`;
  try {
    const text = await generateWithRetry(prompt, undefined, 0.6);
    return text?.trim() || "Sin datos.";
  } catch (error) {
    return "Error análisis.";
  }
};

export const askDatabase = async (question: string, contextData: string) => {
    const prompt = `
      Eres el Asistente de "División Planes". Base de datos JSON: ${contextData}.
      Pregunta: "${question}".
      Responde usando SOLO la base de datos. Sé directo y breve.
    `;
    try {
      const text = await generateWithRetry(prompt, undefined, 0.4);
      return text?.trim() || "No pude procesar la respuesta.";
    } catch (error: any) {
      console.error("Gemini Error Final:", error);
      return `⚠️ ${formatGeminiError(error)}`;
    }
  };

export const summarizeTimeline = async (events: any[]) => {
  const prompt = `Resume línea de tiempo: ${JSON.stringify(events)}`;
  return await getLegalAdvice(prompt);
};

function formatGeminiError(error: any): string {
    const msg = (error.message || error.toString() || "").toLowerCase();
    
    if (msg.includes("missing_api_key")) return "Falta configurar API KEY.";
    if (msg.includes("429")) return "Cuota excedida (Intente luego).";
    if (msg.includes("403") || msg.includes("key")) return "Clave API inválida.";
    if (msg.includes("404") || msg.includes("not found")) return "Modelos IA no disponibles temporalmente.";
    if (msg.includes("fetch") || msg.includes("network")) return "Sin conexión a internet.";
    
    return `Error de conexión IA.`; 
}
