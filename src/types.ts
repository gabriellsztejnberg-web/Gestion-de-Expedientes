
import React from 'react';

export type InstanciaId = 'analisis' | 'obs' | 'notificacion' | 'p_insp' | 'p_dispo' | 'pase' | 'guarda';

export interface Instancia {
  id: InstanciaId;
  label: string;
  color: string;
}

export type AnexoTipo = 'anexo_15' | 'anexo_16' | 'anexo_17' | 'anexo_18' | 'anexo_19' | 'anexo_20' | 'derrames';

export const ANEXOS: { id: AnexoTipo; label: string }[] = [
  { id: 'anexo_15', label: 'ANEXO 15 (Zonales/Locales)' },
  { id: 'anexo_16', label: 'ANEXO 16 (Ref)' },
  { id: 'anexo_17', label: 'ANEXO 17 (Termap/Oil)' },
  { id: 'anexo_18', label: 'ANEXO 18 (Buques/Barcazas)' },
  { id: 'anexo_19', label: 'ANEXO 19 (Puertos Ref)' },
  { id: 'anexo_20', label: 'ANEXO 20 (Plataformas)' },
  { id: 'derrames', label: 'CONTROL DE DERRAMES' }
];

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
  calculatedStats?: EstadisticasAuditor;
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
  auditorIdSecundario?: string;
  auditorNombreSecundario?: string;
  auditoresVarios?: string; // Para poner nombres separados por comas/espacios
  ubicacion: string;
  baseId?: string; // Para EMCODECON, vincular a una base especifica
  baseNombre?: string;
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

export interface ConvalidacionDetalle {
  fecha?: string;
  auditorNombre?: string;
  nroCertificado?: string;
  nroIF?: string;
  nroExpediente?: string;
  nroCertificadoConvalidacion?: string; // Nuevo: Certificado de convalidación específico
}

export interface PlanEmergencia {
  id: string;
  empresa: string;
  logoUrl?: string;
  anexo: AnexoTipo;
  dependencia: string; // Jurisdicción
  disposicion: string; // Número de disposición de aprobación
  vencimiento: string; // Fecha de vencimiento (YYYY-MM-DD)
  formatoDisposicion?: 'digital' | 'papel' | ''; // Aplica a la disposición y sus convalidaciones
  estado?: 'vigente' | 'desafectado'; // Estado del plan
  convalidaciones: {
    anio1?: string;
    anio2?: string;
    anio3?: string;
    anio4?: string;
  };
  convalidacionesDetalle?: {
    anio1?: ConvalidacionDetalle;
    anio2?: ConvalidacionDetalle;
    anio3?: ConvalidacionDetalle;
    anio4?: ConvalidacionDetalle;
  };
  historialDisposiciones?: {
    disposicion: string;
    vencimiento: string;
    formatoDisposicion?: 'digital' | 'papel' | '';
    convalidaciones: any;
    convalidacionesDetalle: any;
    fechaArchivo: string;
    numeroPlan?: string;
    documentacionExtra?: string;
  }[];
  observaciones?: string;
  ultimaActualizacion: string; // ISO String
  expedienteOrigenId?: string; // ID del expediente que generó/actualizó este plan
  
  // Campos adicionales para el perfil de la empresa
  cuit?: string;
  domicilio?: string;
  localidad?: string;
  email?: string;
  telefono?: string;
  notas?: string;
  
  // Nuevos campos solicitados
  numeroPlan?: string;
  documentacionExtra?: string;
  coordenadas?: string;
  responsablePlan?: string;
  contactoPlan?: string;
  tipoRespuesta?: 'propia' | 'terceros' | '';
  empresaRespuesta?: string;
  empresaRespuestaManual?: string; // Nuevo: Para guardar el texto manual histórico
  cantidadBarreras?: number | string; // Nuevo: para cuando la respuesta es propia
  
  // Específicos Anexo 15
  isSIPA?: boolean;
  sipaEquipamiento?: BaseOperativa;
  presentacionesAnuales?: {
    anio: number;
    fecha: string;
    nroIF: string;
    disposicion: string;
  }[];
}

// --- NUEVOS TIPOS PARA EMPRESAS CONTROL DE DERRAMES ---

export interface BaseOperativa {
  id: string;
  nombre: string;
  coordenadas: string; // Ej: -34.6037, -58.3816
  materiales: string;
  cantidadBarreras?: number | string; // Suma total de barreras
  barrerasPuerto?: number | string; // INT. DE PUERTO
  barrerasFluvial?: number | string; // FLUV. Y LACUSTRE
  barrerasMaritima?: number | string; // MARITIMAS
  skimmers?: number | string;
  embarcaciones?: number | string;
  metrosAbsorbentes?: number | string;
  observaciones?: string;
}

export interface InspeccionIntermedia {
  id?: string;
  fecha?: string;
  auditorNombre?: string;
  nroCertificado?: string;
  nroExpediente?: string;
  baseNombre?: string;
}

export interface EmpresaControlDerrame {
  id: string;
  categoria?: string;
  empresa: string;
  logoUrl?: string;
  cuit?: string;
  domicilio?: string;
  email?: string;
  telefono?: string;
  dependencia: string; // Jurisdicción
  disposicion: string; // Número de disposición de habilitación
  vencimiento: string; // Vencimiento (3 años)
  formatoDisposicion?: 'digital' | 'papel' | '';
  estado?: 'vigente' | 'desafectado';
  convalidacionesDetalle?: {
    anio1?: ConvalidacionDetalle;
    anio2?: ConvalidacionDetalle;
  };
  inspeccionesIntermedias?: InspeccionIntermedia[];
  basesOperativas: BaseOperativa[];
  historialDisposiciones?: {
    disposicion: string;
    vencimiento: string;
    formatoDisposicion?: 'digital' | 'papel' | '';
    fechaArchivo: string;
    inspeccionesIntermedias: any;
    documentacionExtra?: string;
  }[];
  observaciones?: string;
  ultimaActualizacion: string;
  expedienteOrigenId?: string;
  
  localidad?: string;
  notas?: string;
  documentacionExtra?: string;
  responsable?: string;
  contacto?: string;
}
