// Genera presets/mapa_elecciones.json desde las parcelas actuales del catálogo + posiciones 3D.
// Uso único (migración). El archivo resultante es la fuente de verdad de zonas y parcelas.
import fs from 'node:fs';
import { SCENARIO_PRESETS } from '../src/data/catalogs';

const POS: Record<string, [number, number, number, number, number]> = {
  // id: [x, z, ancho, fondo, rotacionGrados]
  p_hospital_centro: [-18, -16, 18, 14, 0],
  p_comisaria_centro: [-18, 14, 16, 13, 0],
  p_oficina_centro: [18, 16, 16, 12, 0],
  p_comercio_1: [6, -27, 14, 10, 0],
  p_comercio_2: [22, -14, 14, 10, 90],
  p_centro_libre: [3, 0, 14, 12, 0],
  p_campo_1: [-24, -58, 24, 16, 0],
  p_campo_2: [6, -58, 24, 16, 0],
  p_norte_libre: [-8, -84, 18, 12, 0],
  p_campo_3: [-64, -26, 22, 16, 90],
  p_campo_4: [-62, 4, 22, 16, 90],
  p_campo_5: [-66, 32, 22, 14, 90],
  p_oeste_libre: [-92, -8, 16, 12, 90],
  p_comercio_3: [-26, 62, 22, 14, 0],
  p_comercio_4: [8, 62, 22, 14, 0],
  p_sur_libre: [-8, 88, 18, 12, 0],
  p_escuela_este: [62, -30, 24, 16, 90],
  p_este_libre: [94, -30, 14, 12, 90],
  p_hito_este_1: [92, 4, 14, 12, 90],
  p_hito_este_2: [64, 32, 16, 14, 90],
};

const preset = SCENARIO_PRESETS.elecciones;
const mapa = {
  version: 1,
  id: 'elecciones',
  unidad: 'm',
  descripcion:
    'Fuente de verdad de zonas y parcelas. El motor lee id, zona, estado y vecindad; la vista lee pos/tam/rot. Para agregar parcelas basta sumar una entrada.',
  isla: { radio: 128, ruido: 0.18, semilla: 7 },
  zonas: {
    centro: { vecinas: preset.zonas.centro.vecinas, centro: [0, 0], caracter: 'civico' },
    norte: { vecinas: preset.zonas.norte.vecinas, centro: [0, -72], caracter: 'campos' },
    este: { vecinas: preset.zonas.este.vecinas, centro: [72, 0], caracter: 'residencial' },
    sur: { vecinas: preset.zonas.sur.vecinas, centro: [0, 72], caracter: 'taller' },
    oeste: { vecinas: preset.zonas.oeste.vecinas, centro: [-72, 0], caracter: 'campos' },
  },
  parcelas: preset.parcelas.map((p) => {
    const [x, z, w, d, rot] = POS[p.id];
    return {
      id: p.id,
      nombre: p.nombre,
      zona: p.zona,
      distrito: p.distrito,
      estadoInicial: p.estadoInicial,
      ...(p.edificioInicial ? { edificioInicial: p.edificioInicial } : {}),
      ...(p.hitoRequerido ? { hitoRequerido: p.hitoRequerido } : {}),
      pos: [x, z],
      tam: [w, d],
      rot,
      wx: p.wx,
      wy: p.wy,
      ww: p.ww,
      wh: p.wh,
    };
  }),
};
fs.writeFileSync('presets/mapa_elecciones.json', JSON.stringify(mapa, null, 2));
console.log('ok', mapa.parcelas.length);
