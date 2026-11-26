import { DistrictId } from './game';

export type WindowId = 'palancas' | 'economia' | 'ciudad' | 'gaceta';

export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre' | 'calle';

export type MapLens =
  | 'rol'
  | 'satisfaccion'
  | 'hambre'
  | 'miedo'
  | 'salud'
  | 'accion'
  | 'lealtad'
  | 'vivienda'
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
  | 'clima'
  | 'ciudad'
  | 'despacho';

export type EconomyTab =
  | 'resumen'
  | 'firmas'
  | 'mercado'
  | 'vivienda'
  | 'presupuesto'
  | 'alimento'
  | 'comercio'
  | 'fiscal';

export interface CameraTarget {
  district: DistrictId | 'all';
  seq: number;
}
