import { DistrictId } from './game';

export type DockSection = 'gobierno' | 'alimento' | 'ciudad';
export type CityTab = 'alertas' | 'gaceta' | 'objetivo' | 'vecinos' | 'bitacora';
export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre';
export type MapLens =
  | 'roles'
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
