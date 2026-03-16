
import React from 'react';

export type InstanciaId = 'analisis' | 'obs' | 'notificacion' | 'p_insp' | 'p_dispo' | 'pase' | 'guarda';

export interface Instancia {
  id: InstanciaId;
  label: string;
  color: string;
}

export interface Case {
  id: string;
  numero: string; // GDE
  empresa: string;
  planId?: string; // Vinculación con Base de Datos de Planes
  plan?: string;
  tramite: string;
  ordenanza?: string;
  categoria?: string; // Usado como Anexo
  instancia: InstanciaId;
  asignadoA: string; // 'buzon' o ID de usuario
  asignadoANombre: string;
  observaciones: string;
  creadoEn: string;
  ultimaModificacion: string;
  fechaAdquisicion?: string;
  fechaNotificacion?: string;
  destinoExterno?: string;
  isInternal: boolean;
}

export interface Mail {
  id: string;
  fechaIngreso: string; // ISO
  remitente: string;
  asunto: string;
  cuerpo?: string;
  estado: 'pendiente' | 'respondido';
  respuesta?: string;
  fechaRespuesta?: string;
  respondidoPor?: string;
  registradoPor: string;
}

export interface TimelineEvent {
  id: string;
  usuario: string;
  fecha: string; // ISO string
  texto: string;
  expedienteId: string;
  inspeccionId?: string; // Nuevo: Para vincular historial a una inspección especifica
  tipoAccion?: string;
  isPending?: boolean; // Para marcar como tarea pendiente
}

export type UserRole = 'jefe' | 'operador';

export interface User {
  id: string;
  username: string; 
  name: string; 
  password?: string;
  role: UserRole;
}

// --- TIPOS PARA AUDITORES ---

export interface Curso {
  id: string;
  nombre: string;
  disposicion: string;
  fecha: string;
}

export interface EstadisticasAuditor {
  totalHistorico: number;
  anualActual: number;
  anioReferencia: number;
}

export interface Auditor {
  id: string;
  nombre: string;
  dni?: string;
  disposicionHabilitacion: string; // Numero y Año
  zonaTrabajo: string;
  nivel?: 'I' | 'II' | 'III'; // Nuevo campo Nivel
  cursos: Curso[];
  stats: EstadisticasAuditor;
  ultimaActualizacion: string;
}

// Cursos Esenciales definidos por normativa
export const ESSENTIAL_COURSES = [
  "PLANIFICACION PARA CONTINGENCIAS POR DERRAMES - TEORICO",
  "PLANIFICACION PARA CONTINGENCIAS POR DERRAMES - PRACTICO",
  "CURSO CONTROL DE DERRAME - NIVEL OPERADOR",
  "CURSO CONTROL DE DERRAME - NIVEL SUPERVISOR"
];

// --- NUEVOS TIPOS PARA INSPECCIONES ---

export type ResultadoInspeccion = 'APROBADO' | 'APROBADO CON OPORTUNIDAD DE MEJORAS' | 'CON PENDIENTES';

export interface Inspeccion {
  id: string;
  fecha: string; // YYYY-MM-DD
  expedienteId?: string; // Opcional, vinculación con Case
  planId?: string; // Vinculación directa con Plan si no hay expediente
  expedienteNumero?: string; // Cache del numero GDE para visualización rápida
  auditorId: string;
  auditorNombre: string;
  ubicacion: string;
  jurisdiccion?: string; // Nuevo campo: Jurisdicción Prefectura
  tipo: string; // Ej: Habilitación, Renovación, Denuncia
  resultado: ResultadoInspeccion;
  convalidacionNumero?: 1 | 2 | 3 | 4; // Para identificar qué año se está convalidando
  observaciones: string;
  
  // Documentación generada
  nroInforme?: string;
  nroCertificado?: string;
  nroDisposicion?: string;
  
  registradoPor: string; // Usuario del sistema que cargó el dato
  registradoEn: string; // ISO String
}

// --- NUEVOS TIPOS PARA ASISTENCIA ---

export type AttendanceType = 
  | 'normal' 
  | 'comision' 
  | 'feriado' 
  | 'ausente' 
  | 'franco'
  | 'licencia_anual'
  | 'licencia_ord' 
  | 'licencia_extra'
  | 'licencia_med'
  | 'licencia_personal';

export interface AttendanceLog {
  id: string; // composite: userId_YYYY-MM-DD
  userId: string;
  userName: string;
  userRole: string; // Para mostrar JER en la tabla
  date: string; // YYYY-MM-DD
  entry: string; // HH:MM
  exit: string; // HH:MM
  type: AttendanceType; 
  notes?: string;
  totalHours: string; // HH:MM calculado
}

export interface MOI {
  id: string;
  tipo: 'enviado' | 'recibido';
  origen: string; // CITS, DEDU, etc.
  gfh: string; // DDHHMM/MMM/YYYY
  reserva: string; // PUBLICO, RESERVADO
  prioridad: string; // RUTINA (R), PRIORIDAD (P)
  destinatarios: string;
  informativos: string;
  exceptuados?: string;
  codigoTexto: string; // 9999
  texto: string;
  adjuntos?: string; // Nombre del archivo o link
  registradoPor: string;
  fechaRegistro: string; // ISO para ordenamiento
}

// --- NUEVOS TIPOS PARA PLANES DE EMERGENCIA ---

export type AnexoTipo = 'anexo_16' | 'anexo_17' | 'anexo_18' | 'anexo_19' | 'anexo_20';

export interface PlanEmergencia {
  id: string;
  empresa: string;
  anexo: AnexoTipo;
  dependencia: string; // Jurisdicción
  disposicion: string; // Número de disposición de aprobación
  vencimiento: string; // Fecha de vencimiento (YYYY-MM-DD)
  convalidaciones: {
    anio1?: string;
    anio2?: string;
    anio3?: string;
    anio4?: string;
  };
  observaciones?: string;
