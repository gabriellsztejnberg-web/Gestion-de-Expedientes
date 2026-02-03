
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
  categoria?: string;
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

export interface TimelineEvent {
  id: string;
  usuario: string;
  fecha: string; // ISO string
  texto: string;
  expedienteId: string;
  tipoAccion?: string;
}

export type UserRole = 'jefe' | 'operador';

export interface User {
  id: string;
  username: string; // Nombre de usuario para login (no email)
  name: string; // Nombre real para mostrar
  password?: string;
  role: UserRole;
}
