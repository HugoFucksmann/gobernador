import { ZoneId } from './game';

export type WindowId = 'palancas' | 'economia' | 'ciudad' | 'gaceta' | 'despacho';

export type DespachoTab = 'resumen' | 'historial' | 'informe' | 'notables';

export type LandmarkId = 'palacio' | 'prensa' | 'mercado';

export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre' | 'calle';

export type MapLens =
  | 'ninguna'
  | 'satisfaccion'
  | 'roles'
  | 'vivienda'
  | 'firmas'
  | 'alquiler'
  | 'vias'
  | 'acciones'
  | 'defensa'
  | 'orden'
  | 'integridad'
  | 'amenaza';

export type { AiStatus } from './game';

export type CityTab =
  | 'general'
  | 'poblacion'
  | 'hogares'
  | 'vivienda'
  | 'demografia'
  | 'servicios'
  | 'zonas'
  | 'vias'
  | 'clima'
  | 'ciudad'
  | 'alertas'
  | 'obras'
  | 'vecinos'
  | 'bitacora';

export interface CameraTarget {
  zone?: ZoneId | 'all';
  wx?: number;
  wy?: number;
  seq: number;
}

export interface MapHoverPreview {
  zona?: ZoneId;
  parcelaId?: string;
  tramoId?: string;
}

export interface PaydaySummary {
  periodo: number;
  dia: number;
  ingresos: number;
  gastos: number;
  saldo: number;
  reserva: number;
}

export interface MonthlySummary {
  dia: number;
  apoyoPct: number;
  poblacion: number;
  reserva: number;
  topPositivos: string[];
  topNegativos: string[];
}
