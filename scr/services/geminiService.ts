
import { GoogleGenAI } from "@google/genai";

const getAIClient = () => {
  // SE SEGURIZA LA CLAVE API:
  // Se utiliza la variable de entorno del sistema.
  // La clave hardcodeada anterior causaba error 403 (Permisos Denegados).
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    // Error específico para alertar que falta configuración en el entorno
    throw new Error("MISSING_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

// ESTRATEGIA DE MODELOS:
// Intentamos usar el más moderno (2.0 Flash). Si falla (404/Region), hacemos fallback al estable (1.5 Flash).
const PRIMARY_MODEL = "gemini-2.0-flash";
const FALLBACK_MODEL = "gemini-1.5-flash"; 

async function generateWithFallback(prompt: string, systemInstruction?: string, temperature: number = 0.7) {
  const ai = getAIClient();
  const config = {
    systemInstruction,
    temperature,
  };

  try {
    // Intento 1: Modelo Primario
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents: prompt,
      config,
    });
    return response.text;
  } catch (error: any) {
    const msg = (error.message || "").toLowerCase();
    
    // Si es error 403 (Permisos) o falta de key, NO hacemos fallback, fallamos directo para avisar al usuario.
    if (msg.includes("403") || msg.includes("permission") || msg.includes("key") || msg.includes("missing")) {
        throw error;
    }

    // Si es error 404 (No encontrado) o 400 (Bad Request por modelo invalido), probamos fallback
    if (msg.includes("404") || msg.includes("not found") || msg.includes("not supported")) {
      console.warn(`Primary model ${PRIMARY_MODEL} failed. Switching to fallback ${FALLBACK_MODEL}.`);
      try {
        const responseFallback = await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents: prompt,
          config,
        });
        return responseFallback.text;
      } catch (fallbackError: any) {
        throw fallbackError; // Si falla el fallback, lanzamos el error real
      }
    }
    throw error; // Otros errores (429, 500) se lanzan directo
  }
}

// Función genérica para consultoría legal o administrativa
export const getLegalAdvice = async (prompt: string) => {
  try {
    const text = await generateWithFallback(
      prompt, 
      "Eres un asistente administrativo legal experto en gestión pública y normativa DPAM (División Planes). Tu objetivo es resumir historiales o explicar términos legales de forma concisa y profesional."
    );
    return text || "No se pudo generar una respuesta.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return formatGeminiError(error);
  }
};

// 1. Asistente de Redacción para Inspecciones
export const draftTechnicalReport = async (rawNotes: string, context: string) => {
  const prompt = `
    Contexto: Inspección técnica en ${context}.
    Notas del inspector (borrador): "${rawNotes}"
    
    Tarea: Reescribe estas notas convirtiéndolas en un informe técnico formal, objetivo y preciso. 
    Usa terminología de seguridad e higiene o normativa portuaria según corresponda. 
    Corrige ortografía y gramática. NO agregues información inventada, solo da formato profesional a lo provisto.
  `;

  try {
    const text = await generateWithFallback(prompt, undefined, 0.3);
    return text?.trim() || rawNotes;
  } catch (error: any) {
    console.error("Gemini Error (Draft):", error);
    return rawNotes + `\n[Error de IA: ${formatGeminiError(error)}]`;
  }
};

// 2. Analista de Historial de Expedientes (Edición Individual)
export const analyzeExpedienteHistory = async (caseData: any, events: any[]) => {
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
    const text = await generateWithFallback(prompt, undefined, 0.5);
    return text?.trim() || "No se pudo analizar el historial.";
  } catch (error: any) {
    console.error("Gemini Error (Analyze):", error);
    return `Error al conectar con IA: ${formatGeminiError(error)}`;
  }
};

// 3. Resumidor de Línea de Reporte (Para la Sábana Diaria)
export const summarizeReportRow = async (numero: string, empresa: string, rawMovements: string) => {
  const prompt = `
    Actúa como un secretario administrativo redactando un parte diario oficial.
    
    Expediente: ${numero}
    Empresa: ${empresa}
    Lista de Movimientos recientes: "${rawMovements}"
    
    Tarea: Redacta un resumen narrativo de la actividad de este expediente.
    
    Requisitos:
    1. Utiliza un lenguaje formal, administrativo y técnico.
    2. Conecta los movimientos cronológicamente.
    3. Longitud: Entre 1 y 3 oraciones como máximo.
    4. NO uses listas ni guiones, debe ser un párrafo fluido.
    
    Ejemplo entrada: "Carga manual | Pase a legales | Retorno con dictamen"
    Ejemplo salida: "Se procedió al inicio del trámite mediante carga manual. Posteriormente fue remitido al área de Legales y retornó a esta oficina con el dictamen jurídico correspondiente."
  `;

  try {
    const text = await generateWithFallback(prompt, undefined, 0.4);
    return text?.trim() || rawMovements;
  } catch (error) {
    return rawMovements;
  }
};

// 4. Analista de Perfil de Auditor (Inspector)
export const analyzeAuditorProfile = async (auditorData: any) => {
  const prompt = `
    Analiza el perfil del siguiente Auditor/Inspector de Seguridad:
    Nombre: ${auditorData.nombre}
    Zona: ${auditorData.zonaTrabajo}
    Estadísticas: ${JSON.stringify(auditorData.stats)}
    Cursos Realizados: ${auditorData.cursos?.map((c:any) => c.nombre).join(', ')}
    
    Tarea: Genera una breve "Reseña Profesional" (max 50 palabras) destacando su nivel de actividad (según estadísticas) y su especialización (según los cursos). Indica si es un perfil "Senior", "Junior" o "Especialista" basado en los datos.
  `;

  try {
    const text = await generateWithFallback(prompt, undefined, 0.6);
    return text?.trim() || "No se pudo generar el perfil.";
  } catch (error) {
    return "Error en análisis IA.";
  }
};

// 5. CHATBOT: Consultar Base de Datos General
export const askDatabase = async (question: string, contextData: string) => {
    const prompt = `
      Eres el Asistente Virtual Inteligente de la "División Planes (DPAM)".
      Tienes acceso a la base de datos actual del sistema en formato JSON.
      
      BASE DE DATOS (Contexto):
      ${contextData}
      
      PREGUNTA DEL USUARIO:
      "${question}"
      
      INSTRUCCIONES:
      1. Responde basándote ÚNICAMENTE en la información provista en la base de datos.
      2. Si te preguntan por un expediente, busca por número o empresa.
      3. Si te preguntan "quién tiene" algo, busca el campo 'asignadoANombre' o el último movimiento.
      4. Si no encuentras la información, dilo claramente.
      5. Sé breve, profesional y directo.
      6. No menciones IDs internos (como 'gabriel-id'), usa los nombres reales.
    `;
  
    try {
      const text = await generateWithFallback(prompt, undefined, 0.4);
      return text?.trim() || "No pude procesar la respuesta.";
    } catch (error: any) {
      console.error("Gemini Error (Chat):", error);
      return `⚠️ ${formatGeminiError(error)}`;
    }
  };

export const summarizeTimeline = async (events: any[]) => {
  const prompt = `Resume la siguiente línea de tiempo de actividad legal en 2 oraciones: ${JSON.stringify(events)}`;
  return await getLegalAdvice(prompt);
};

// Helper para limpiar mensajes de error
function formatGeminiError(error: any): string {
    const msg = (error.message || error.toString() || "").toLowerCase();
    
    if (msg.includes("missing_api_key")) return "Falta configurar API KEY en el servidor.";
    if (msg.includes("429")) return "Cuota diaria excedida. Intente mañana.";
    if (msg.includes("404") || msg.includes("not found")) return "Modelo no disponible en su región.";
    if (msg.includes("403") || msg.includes("permission") || msg.includes("key")) return "Clave de API inválida o expirada.";
    if (msg.includes("400")) return "Error en la solicitud (Datos incorrectos).";
    if (msg.includes("500") || msg.includes("503")) return "Servidor de Google ocupado.";
    if (msg.includes("fetch") || msg.includes("network")) return "Error de Red / Sin Internet.";
    
    return `Error de IA: ${msg.substring(0, 40)}...`; 
}
