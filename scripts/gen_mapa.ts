// Validador / generador de presets/mapa_elecciones.json en formato V2 (con grilla de baldosas, clases S/M/L/XL, ~30% sin_calle y vecindad derivada).
import fs from 'node:fs';
import { BUILDING_CATALOG, LOT_CLASS_RANK } from '../src/data/catalogs';
import { buildTileGridAndSyncMap, inferLotClassFromParcel } from '../src/engine/worldHelpers';
import { LotClass, Parcela, ParcelTipo, ScenarioParcelDef, ViaTramo, ZoneDefinition, ZoneId } from '../src/types/game';

const mapaActual = JSON.parse(fs.readFileSync('presets/mapa_elecciones.json', 'utf8')) as {
  version: number;
  id: string;
  unidad?: string;
  descripcion?: string;
  bounds?: { w: number; h: number };
  isla?: { radio: number; ruido: number; semilla: number };
  zonas: Record<ZoneId, ZoneDefinition>;
  tramos: ViaTramo[];
  parcelas: ScenarioParcelDef[];
};

const zonas = structuredClone(mapaActual.zonas);
const tramos = structuredClone(mapaActual.tramos);

// Keep base parcels and idempotently generate outer sin_calle growth lots so ~30% of the map starts sin_calle
const baseParcelDefs: ScenarioParcelDef[] = mapaActual.parcelas.filter(
  (p) => !p.id.startsWith('p_ext2_')
);

const extraSinCalleDefs: ScenarioParcelDef[] = [
  { id: 'p_ext2_norte_1', nombre: 'Ensanche Residencial Norte 12', zona: 'norte', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_norte_ext', wx: 598, wy: 194, ww: 44, wh: 36 },
  { id: 'p_ext2_norte_2', nombre: 'Ensanche Residencial Norte 13', zona: 'norte', distrito: 'residencial', tipoParcela: 'residencial', clase: 'S', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_norte_ext', wx: 652, wy: 194, ww: 42, wh: 36 },
  { id: 'p_ext2_norte_3', nombre: 'Ensanche Residencial Norte 14', zona: 'norte', distrito: 'residencial', tipoParcela: 'residencial', clase: 'L', orden: 32, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_norte_ext', wx: 704, wy: 194, ww: 50, wh: 38 },
  { id: 'p_ext2_sur_1', nombre: 'Ensanche Residencial Sur 11', zona: 'sur', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_sur_ext', wx: 598, wy: 694, ww: 44, wh: 36 },
  { id: 'p_ext2_sur_2', nombre: 'Ensanche Residencial Sur 12', zona: 'sur', distrito: 'residencial', tipoParcela: 'residencial', clase: 'S', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_sur_ext', wx: 652, wy: 694, ww: 42, wh: 36 },
  { id: 'p_ext2_sur_3', nombre: 'Ensanche Residencial Sur 13', zona: 'sur', distrito: 'residencial', tipoParcela: 'residencial', clase: 'L', orden: 32, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_sur_ext', wx: 704, wy: 694, ww: 50, wh: 38 },
  { id: 'p_ext2_este_1', nombre: 'Ensanche Comercial Este 4', zona: 'este', distrito: 'mercado', tipoParcela: 'comercial', clase: 'M', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_este_com', wx: 1114, wy: 448, ww: 48, wh: 34 },
  { id: 'p_ext2_este_2', nombre: 'Ensanche Residencial Este 8', zona: 'este', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_este_com', wx: 1002, wy: 492, ww: 44, wh: 32 },
  { id: 'p_ext2_este_3', nombre: 'Ensanche Comercial Este 5', zona: 'este', distrito: 'mercado', tipoParcela: 'comercial', clase: 'L', orden: 32, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_este_com', wx: 1060, wy: 492, ww: 52, wh: 34 },
  { id: 'p_ext2_oeste_1', nombre: 'Ensanche Agrícola Oeste 2', zona: 'oeste', distrito: 'campos', tipoParcela: 'agricola', clase: 'XL', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_oeste_ind', wx: 36, wy: 462, ww: 78, wh: 32 },
  { id: 'p_ext2_oeste_2', nombre: 'Ensanche Comercial Oeste 2', zona: 'oeste', distrito: 'mercado', tipoParcela: 'comercial', clase: 'M', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_oeste_ind', wx: 126, wy: 462, ww: 48, wh: 32 },
  { id: 'p_ext2_oeste_3', nombre: 'Ensanche Residencial Oeste 5', zona: 'oeste', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 32, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_oeste_ind', wx: 184, wy: 462, ww: 46, wh: 32 },
  { id: 'p_ext2_oeste_4', nombre: 'Ensanche Residencial Oeste 6', zona: 'oeste', distrito: 'residencial', tipoParcela: 'residencial', clase: 'S', orden: 33, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_oeste_ind', wx: 240, wy: 462, ww: 42, wh: 32 },
  { id: 'p_ext2_oeste_5', nombre: 'Ensanche Industrial Oeste 4', zona: 'oeste', distrito: 'taller', tipoParcela: 'industrial', clase: 'XL', orden: 34, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_oeste_ind', wx: 292, wy: 462, ww: 70, wh: 34 },
  { id: 'p_ext2_noreste_1', nombre: 'Ensanche Residencial Noreste 8', zona: 'noreste', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_norte_ext', wx: 932, wy: 194, ww: 44, wh: 36 },
  { id: 'p_ext2_noreste_2', nombre: 'Ensanche Residencial Noreste 9', zona: 'noreste', distrito: 'residencial', tipoParcela: 'residencial', clase: 'S', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_norte_ext', wx: 986, wy: 194, ww: 42, wh: 36 },
  { id: 'p_ext2_noreste_3', nombre: 'Ensanche Comercial Noreste 2', zona: 'noreste', distrito: 'mercado', tipoParcela: 'comercial', clase: 'M', orden: 32, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_norte_ext', wx: 1040, wy: 194, ww: 48, wh: 36 },
  { id: 'p_ext2_suroeste_1', nombre: 'Ensanche Residencial Suroeste 4', zona: 'suroeste', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_sur_ext', wx: 36, wy: 656, ww: 46, wh: 36 },
  { id: 'p_ext2_suroeste_2', nombre: 'Ensanche Agrícola Suroeste 2', zona: 'suroeste', distrito: 'campos', tipoParcela: 'agricola', clase: 'XL', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_sur_ext', wx: 92, wy: 656, ww: 76, wh: 44 },
  { id: 'p_ext2_suroeste_3', nombre: 'Ensanche Comercial Suroeste 2', zona: 'suroeste', distrito: 'mercado', tipoParcela: 'comercial', clase: 'M', orden: 32, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_sur_ext', wx: 180, wy: 656, ww: 48, wh: 36 },
  { id: 'p_ext2_sureste_1', nombre: 'Ensanche Residencial Sureste 4', zona: 'sureste', distrito: 'residencial', tipoParcela: 'residencial', clase: 'M', orden: 30, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_este_com', wx: 824, wy: 656, ww: 46, wh: 36 },
  { id: 'p_ext2_sureste_2', nombre: 'Ensanche Agrícola Sureste 2', zona: 'sureste', distrito: 'campos', tipoParcela: 'agricola', clase: 'XL', orden: 31, estadoInicial: 'sin_calle', tramoAperturaId: 'via_calle_este_com', wx: 882, wy: 656, ww: 76, wh: 44 },
];

const allParcelDefs: ScenarioParcelDef[] = [...baseParcelDefs, ...extraSinCalleDefs];

// Register new extra sin_calle parcels into their corresponding tramos.parcelasAbiertas cleanly
const extraIdsByTramo = new Map<string, string[]>();
for (const d of extraSinCalleDefs) {
  if (!d.tramoAperturaId) continue;
  const list = extraIdsByTramo.get(d.tramoAperturaId) ?? [];
  list.push(d.id);
  extraIdsByTramo.set(d.tramoAperturaId, list);
}
for (const t of tramos) {
  const cleaned = (t.parcelasAbiertas ?? []).filter((id) => !id.startsWith('p_ext2_'));
  const extras = extraIdsByTramo.get(t.id) ?? [];
  t.parcelasAbiertas = [...cleaned, ...extras];
}

// Convert definitions to Parcela objects to synchronize tile coordinates, lot classes, and baldosas
const runtimeParcelas: Parcela[] = allParcelDefs.map((def, idx) => {
  const tipoParcela: ParcelTipo =
    def.tipoParcela ??
    (def.houseType
      ? 'residencial'
      : def.edificioInicial === 'campo'
      ? 'agricola'
      : def.edificioInicial === 'fabrica'
      ? 'industrial'
      : def.edificioInicial === 'plaza' || def.edificioInicial === 'puerto' || def.edificioInicial === 'muelle_comercio'
      ? 'especial'
      : def.edificioInicial === 'hospital' ||
        def.edificioInicial === 'comisaria' ||
        def.edificioInicial === 'escuela' ||
        def.edificioInicial === 'oficina_publica' ||
        def.id.includes('libre') ||
        def.id.includes('hito')
      ? 'publica'
      : 'comercial');

  const minClassFromHint: LotClass | undefined = def.edificioInicial
    ? BUILDING_CATALOG[def.edificioInicial]?.claseMinima
    : def.houseType
    ? BUILDING_CATALOG[def.houseType]?.claseMinima
    : undefined;
  const inferred = inferLotClassFromParcel(
    {
      clase: def.clase,
      w: def.w,
      h: def.h,
      ww: def.ww,
      wh: def.wh,
      tipoParcela,
      edificio: null,
    },
    def.edificioInicial ?? def.houseType
  );
  const clase: LotClass =
    minClassFromHint && LOT_CLASS_RANK[minClassFromHint] > LOT_CLASS_RANK[inferred]
      ? minClassFromHint
      : inferred;

  return {
    id: def.id,
    nombre: def.nombre,
    zona: def.zona,
    distrito: def.distrito,
    tipoParcela,
    clase,
    orden: def.orden ?? idx + 1,
    wx: def.wx,
    wy: def.wy,
    ww: def.ww,
    wh: def.wh,
    estado: def.estadoInicial,
    tramoAperturaId: def.tramoAperturaId,
    nodoAcceso: def.nodoAcceso,
    edificio: null,
  };
});

const mapaGrid = buildTileGridAndSyncMap(zonas, runtimeParcelas, tramos, 100);
const runtimeById = new Map(runtimeParcelas.map((p) => [p.id, p]));

const syncedDefs: ScenarioParcelDef[] = allParcelDefs.map((def) => {
  const rp = runtimeById.get(def.id)!;
  return {
    ...def,
    clase: rp.clase,
    x: rp.x,
    y: rp.y,
    w: rp.w,
    h: rp.h,
    frente: rp.frente,
  };
});

const sinCalleCount = syncedDefs.filter((p) => p.estadoInicial === 'sin_calle').length;
const mapa = {
  ...mapaActual,
  version: 2,
  id: 'elecciones',
  zonas,
  tramos,
  mapaGrid,
  parcelas: syncedDefs,
};

fs.writeFileSync('presets/mapa_elecciones.json', JSON.stringify(mapa, null, 2));
console.log(
  'ok V2 mapa:',
  Object.keys(mapa.zonas).length,
  'zonas,',
  mapa.tramos.length,
  'tramos,',
  mapa.parcelas.length,
  `parcelas (${sinCalleCount} sin_calle = ${((sinCalleCount / mapa.parcelas.length) * 100).toFixed(1)}%), grid ${mapaGrid.ancho}x${mapaGrid.alto}`
);
