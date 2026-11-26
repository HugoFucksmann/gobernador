// Validador / generador de presets/mapa_elecciones.json en formato V2.
import fs from 'node:fs';
import { SCENARIO_PRESETS } from '../src/data/catalogs';

const preset = SCENARIO_PRESETS.elecciones;
const mapaActual = JSON.parse(fs.readFileSync('presets/mapa_elecciones.json', 'utf8'));

const mapa = {
  ...mapaActual,
  version: 2,
  id: 'elecciones',
  zonas: preset.zonas,
  tramos: preset.tramos ?? mapaActual.tramos ?? [],
  parcelas: preset.parcelas,
};

fs.writeFileSync('presets/mapa_elecciones.json', JSON.stringify(mapa, null, 2));
console.log('ok V2 mapa:', Object.keys(mapa.zonas).length, 'zonas,', mapa.tramos.length, 'tramos,', mapa.parcelas.length, 'parcelas');
