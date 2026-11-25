import { DistrictId } from './game';

export type WindowId = 'palancas' | 'economia' | 'ciudad' | 'gaceta';
export type CityTab = 'alertas' | 'vecinos' | 'bitacora';
export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre';
export type MapLens =
  | 'roles'
  | 'acciones'
  | 'satisfaccion'
  | 'hambre'
  | 'lealtad'
  | 'defensa'
  | 'orden'
  | 'integridad'
  | 'amenaza'
  | 'hospital';

export type AiStatus = 'activa' | 'lenta' | 'plantilla';

export interface CameraTarget {
  district: DistrictId | 'all';
  seq: number;
}
