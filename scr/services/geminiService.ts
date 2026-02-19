
import { GoogleGenAI } from "@google/genai";

const getAIClient = () => {
  // Clave API configurada directamente
  const apiKey = "AIzaSyAIqTkZLbil5Fgrc3OSmj-qB1Ljm3iodSs";
  
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

// CAMBIO DE MODELO:
// "gemini-1.5-flash" es el modelo global estable. Soluciona el error 404 de región.
const MODEL_NAME = "gemini-1.5-flash"; 

// Función genérica para consultoría legal o administrativa
export const getLegalAdvice = async (prompt: string) => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: "Eres un asistente administrativo legal experto en gestión pública y normativa DPAM (División Planes). Tu objetivo es resumir historiales o explicar términos legales de forma concisa y profesional.",
        temperature: 0.7,
      },
    });
    return response.text || "No se pudo generar una respuesta.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.message && error.message.includes("429")) return "⚠️ Cuota diaria de IA excedida. Intente más tarde.";
    if (error.message && error.message.includes("404")) return "⚠️ Error: El modelo seleccionado no está disponible temporalmente.";
    return `Error IA: ${error.message || "Conexión fallida"}`;
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
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { temperature: 0.3 },
    });
    return response.text?.trim() || rawNotes;
  } catch (error: any) {
    console.error("Gemini Error (Draft):", error);
    return rawNotes + ` (Error IA: ${error.message})`;
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
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { temperature: 0.5 },
    });
    return response.text?.trim() || "No se pudo analizar el historial.";
  } catch (error: any) {
    console.error("Gemini Error (Analyze):", error);
    return `Error al conectar con IA: ${error.message}`;
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
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { temperature: 0.4 },
    });
    return response.text?.trim() || rawMovements;
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
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { temperature: 0.6 },
    });
    return response.text?.trim() || "No se pudo generar el perfil.";
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
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: { temperature: 0.4 },
      });
      return response.text?.trim() || "No pude procesar la respuesta.";
    } catch (error: any) {
      console.error("Gemini Error (Chat):", error);
      if (error.message === "MISSING_API_KEY") return "⚠️ SISTEMA: Falta configurar la API KEY.";
      
      // Manejo específico de errores comunes
      if (error.message?.includes('429')) return "⚠️ Error 429: Cuota de IA excedida por hoy. Intenta más tarde.";
      if (error.message?.includes('400')) return "⚠️ Error 400: Solicitud inválida.";
      if (error.message?.includes('404')) return "⚠️ Error 404: Modelo no disponible. Se intentará reconectar...";
      if (error.message?.includes('500') || error.message?.includes('503')) return "⚠️ Error de Servidor Google (503). Reintente en unos segundos.";

      return `Error técnico: ${error.message}`;
    }
  };

export const summarizeTimeline = async (events: any[]) => {
  const prompt = `Resume la siguiente línea de tiempo de actividad legal en 2 oraciones: ${JSON.stringify(events)}`;
  return await getLegalAdvice(prompt);
};
