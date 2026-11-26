import { DistrictId, ZoneId } from './game';

export type WindowId = 'palancas' | 'economia' | 'ciudad' | 'gaceta';

export type LandmarkId = 'palacio' | 'prensa' | 'mercado';

export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre' | 'calle';

export type SimSpeed = 1 | 2 | 5 | 20;

export type MapLens =
  | 'ninguna'
  | 'roles'
  | 'acciones'
  | 'rol'
  | 'satisfaccion'
  | 'hambre'
  | 'miedo'
  | 'salud'
  | 'accion'
  | 'lealtad'
  | 'vivienda'
  | 'firmas'
  | 'alquiler'
  | 'vias'
  | 'defensa'
  | 'orden'
  | 'integridad'
  | 'amenaza'
  | 'hospital';

export type AiStatus = 'activa' | 'lenta' | 'plantilla';

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

export type EconomyTab =
  | 'resumen'
  | 'firmas'
  | 'mercado'
  | 'vivienda'
  | 'presupuesto'
  | 'alimento'
  | 'comercio'
  | 'fiscal';

export type InspectorTarget =
  | { tipo: 'npc'; id: string }
  | { tipo: 'hogar'; id: string }
  | { tipo: 'parcela'; id: string }
  | { tipo: 'firma'; id: string }
  | { tipo: 'via'; id: string }
  | { tipo: 'zona'; id: ZoneId }
  | { tipo: 'medio'; id: string }
  | { tipo: 'hecho'; id: string; source: 'log' | 'evento' };

export interface CameraTarget {
  district?: DistrictId | 'all';
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
