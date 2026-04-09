import { GoogleGenAI } from '@google/genai';
import { PlanEmergencia } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const summarizeReportRow = async (numero: string, empresa: string, resumenOriginal: string): Promise<string> => {
  return resumenOriginal;
};

export const analyzeExpedienteHistory = async (history: any[]): Promise<string> => {
  return "Análisis no disponible.";
};

export const analyzeAuditorProfile = async (auditor: any): Promise<string> => {
  return "Análisis no disponible.";
};

export const draftTechnicalReport = async (inspeccion: any, expediente: any): Promise<string> => {
  return "Borrador no disponible.";
};

export const extractPlanesFromPDF = async (base64Pdf: string, activeTab: string): Promise<Partial<PlanEmergencia>[]> => {
  const prompt = `
    Extrae la información de la tabla de este documento PDF (Plan de Emergencia) y devuélvela estrictamente como un array de objetos JSON.
    El array debe tener este formato exacto, sin markdown extra ni explicaciones:
    [
      {
        "empresa": "Nombre de la empresa",
        "dependencia": "Jurisdicción (ej. SLOR, SNIC, S/D)",
        "disposicion": "Número de disposición",
        "vencimiento": "YYYY-MM-DD",
        "cuit": "",
        "domicilio": "",
        "localidad": "",
        "email": "",
        "telefono": "",
        "numeroPlan": "Número de plan",
        "coordenadas": "",
        "responsablePlan": "",
        "contactoPlan": "",
        "tipoRespuesta": "propia" o "terceros" o "",
        "empresaRespuesta": "",
        "documentacionExtra": "Observaciones o respuesta",
        "estado": "vigente" o "desafectado",
        "convalidaciones": {
          "anio1": "YYYY-MM-DD",
          "anio2": "YYYY-MM-DD",
          "anio3": "YYYY-MM-DD",
          "anio4": "YYYY-MM-DD"
        },
        "convalidacionesDetalle": {
          "anio1": { "nroExpediente": "Expediente 1" },
          "anio2": { "nroExpediente": "Expediente 2" },
          "anio3": { "nroExpediente": "Expediente 3" },
          "anio4": { "nroExpediente": "Expediente 4" }
        }
      }
    ]
    
    Reglas importantes:
    - Transforma todas las fechas al formato YYYY-MM-DD. Si solo dice el año (ej. 2026), pon "2026-01-01".
    - Si en observaciones dice "desafectado", el estado debe ser "desafectado", sino "vigente".
    - Si un dato está vacío o no existe, usa un string vacío "".
    - Devuelve SOLO el JSON válido.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Pdf
          }
        },
        prompt
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "[]";
    const parsed = JSON.parse(text);
    
    return parsed.map((p: any) => ({
      ...p,
      anexo: activeTab,
      ultimaActualizacion: new Date().toISOString()
    }));
  } catch (error) {
    console.error("Error extracting PDF with Gemini:", error);
    throw new Error("No se pudo extraer la información del PDF.");
  }
};
