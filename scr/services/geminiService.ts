
import Groq from "groq-sdk";

// --- CONFIGURACIÓN DE API KEY ---
// Se intenta obtener desde variables de entorno (Vite)
const getGroqClient = () => {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  
  if (!apiKey) {
    console.warn("Falta VITE_GROQ_API_KEY en .env");
    throw new Error("MISSING_API_KEY");
  }

  return new Groq({ 
    apiKey,
    dangerouslyAllowBrowser: true // Necesario para uso client-side
  });
};

// --- LISTA DE MODELOS GROQ ---
const MODEL_CANDIDATES = [
  "llama-3.3-70b-versatile", // Modelo potente y rápido
  "llama-3.1-8b-instant",    // Opción muy rápida
];

// --- FUNCIÓN NÚCLEO: INTENTO ROTATIVO ---
async function generateWithRetry(prompt: string, systemInstruction?: string, temperature: number = 0.7) {
  const groq = getGroqClient();
  let lastError = null;

  // Construimos los mensajes
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  messages.push({ role: "user", content: prompt });

  // Iteramos sobre la lista de modelos
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const completion = await groq.chat.completions.create({
        messages: messages,
        model: modelName,
        temperature: temperature,
        max_tokens: 1024,
      });

      return completion.choices[0]?.message?.content || "";

    } catch (error: any) {
      const msg = (error.message || "").toLowerCase();
      console.warn(`Falló modelo ${modelName}: ${msg}`);
      lastError = error;

      // Si es error de autenticación, no seguimos probando
      if (msg.includes("401") || msg.includes("authentication") || msg.includes("key")) {
        throw error;
      }
      continue;
    }
  }

  throw lastError;
}

// --- SERVICIOS EXPORTADOS ---

export const getLegalAdvice = async (prompt: string) => {
  try {
    const text = await generateWithRetry(
      prompt, 
      "Eres un asistente administrativo legal experto en gestión pública y normativa DPAM. Responde de forma breve y profesional."
    );
    return text || "Sin respuesta.";
  } catch (error: any) {
    return formatError(error);
  }
};

export const draftTechnicalReport = async (rawNotes: string, context: string) => {
  const prompt = `Contexto: ${context}. Borrador: "${rawNotes}". Redacta un informe técnico formal.`;
  try {
    const text = await generateWithRetry(prompt, undefined, 0.3);
    return text?.trim() || rawNotes;
  } catch (error: any) {
    return rawNotes + `\n[Error IA: ${formatError(error)}]`;
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
    return `Error IA: ${formatError(error)}`;
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
      console.error("Groq Error Final:", error);
      return `⚠️ ${formatError(error)}`;
    }
  };

export const summarizeTimeline = async (events: any[]) => {
  const prompt = `Resume línea de tiempo: ${JSON.stringify(events)}`;
  return await getLegalAdvice(prompt);
};

function formatError(error: any): string {
    const msg = (error.message || error.toString() || "").toLowerCase();
    
    if (msg.includes("missing_api_key")) return "Falta configurar VITE_GROQ_API_KEY.";
    if (msg.includes("401") || msg.includes("authentication")) return "API Key inválida.";
    if (msg.includes("429")) return "Cuota excedida (Intente luego).";
    if (msg.includes("fetch") || msg.includes("network")) return "Sin conexión a internet.";
    
    return `Error de conexión IA (${msg}).`; 
}
