import { DistrictId } from './game';

export type DockSection = 'tesoreria' | 'alimento' | 'servicios' | 'prensa' | 'ciudad';
export type MapFilter = 'todos' | 'acciones' | 'descontentos' | 'hambre';
export type MapLens = 'roles' | 'satisfaccion' | 'hambre' | 'lealtad';

export interface CameraTarget {
  district: DistrictId | 'all';
  seq: number;
}
