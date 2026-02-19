
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
  cursos: Curso[];
  stats: EstadisticasAuditor;
  ultimaActualizacion: string;
}

// --- NUEVOS TIPOS PARA INSPECCIONES ---

export type ResultadoInspeccion = 'APROBADO' | 'APROBADO CON OPORTUNIDAD DE MEJORAS' | 'CON PENDIENTES';

export interface Inspeccion {
  id: string;
  fecha: string; // YYYY-MM-DD
  expedienteId?: string; // Opcional, vinculación con Case
  expedienteNumero?: string; // Cache del numero GDE para visualización rápida
  auditorId: string;
  auditorNombre: string;
  ubicacion: string;
  jurisdiccion?: string; // Nuevo campo: Jurisdicción Prefectura
  tipo: string; // Ej: Habilitación, Renovación, Denuncia
  resultado: ResultadoInspeccion;
  observaciones: string;
  
  // Documentación generada
  nroInforme?: string;
  nroCertificado?: string;
  nroDisposicion?: string;
  
  registradoPor: string; // Usuario del sistema que cargó el dato
  registradoEn: string; // ISO String
}

// --- NUEVOS TIPOS PARA ASISTENCIA ---

export type AttendanceType = 'normal' | 'licencia_ord' | 'licencia_med' | 'comision' | 'feriado' | 'ausente';

export interface AttendanceLog {
  id: string; // composite: userId_YYYY-MM-DD
  userId: string;
  userName: string;
  userRole: string; // Para mostrar JER en la tabla
  date: string; // YYYY-MM-DD
  entry: string; // HH:MM
  exit: string; // HH:MM (Egreso final)
  breakOut: string; // HH:MM (Salida intermedia)
  breakIn: string; // HH:MM (Regreso intermedio)
  type: AttendanceType; 
  notes?: string;
  totalHours: string; // HH:MM calculado
}
