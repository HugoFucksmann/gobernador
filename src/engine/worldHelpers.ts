import {
  BUILDING_CATALOG,
  ECON_CONSTANTS,
  HOUSING_CONSTANTS,
  ROLE_CATALOG,
  VIAL_CONSTANTS,
} from '../data/catalogs';
import {
  BuildingInstance,
  Casa,
  ClimatePhenomenon,
  CommunityDerived,
  Firma,
  FirmRubro,
  GameState,
  Hogar,
  ModifiableKey,
  Modifier,
  Npc,
  Parcela,
  ParcelTipo,
  PersonalityTrait,
  RoleId,
  SimEvent,
  ViaTramo,
  ZoneId,
} from '../types/game';
import { computeMaintenanceBreakdown, getActiveBuildings, getBuildingRoleCapacity } from './policies';
import { nextSeqId } from './rng';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getStage(edad: number): 'menor' | 'adulto' | 'jubilado' {
  if (edad < 18) return 'menor';
  if (edad >= 65) return 'jubilado';
  return 'adulto';
}

export function getWorldZones(state: Pick<GameState, 'zonas'>): ZoneId[] {
  const keys = Object.keys(state.zonas || {}).filter(
    (z) => state.zonas[z]?.estado !== 'no_urbanizada'
  );
  return keys.length > 0 ? keys : ['centro'];
}

export function getAllZoneIds(state: Pick<GameState, 'zonas'>): ZoneId[] {
  const keys = Object.keys(state.zonas || {});
  return keys.length > 0 ? keys : ['centro'];
}

export function getEffectiveZone(npc: Npc, zonesCount: number, defaultZones?: ZoneId[]): ZoneId {
  if (npc.hospital.internado && npc.hospital.zonaHospital) {
    return npc.hospital.zonaHospital;
  }
  if (npc.accionIa?.zonaDestino) {
    return npc.accionIa.zonaDestino;
  }
  if (npc.accionIa?.esFoco && zonesCount > 1) {
    return defaultZones?.[0] ?? 'centro';
  }
  return npc.zona;
}

export function getModifierDelta(npc: Npc, key: ModifiableKey): number {
  let sum = 0;
  for (const m of npc.modificadores) {
    const d = m.afecta[key];
    if (typeof d === 'number') sum += d;
  }
  return sum;
}

export function getEffectiveTrait(npc: Npc, trait: PersonalityTrait): number {
  return clamp(npc.personalidad[trait] + getModifierDelta(npc, trait), 0, 100);
}

export function getEffectivePropensionGasto(npc: Npc): number {
  const base = npc.economia.propensionGasto;
  const delta = getModifierDelta(npc, 'propensionGasto');
  return clamp(base + delta * 100, ECON_CONSTANTS.propensionGastoMin * 100, ECON_CONSTANTS.propensionGastoMax * 100);
}

export function getEffectivePropensionEmprender(npc: Npc): number {
  return clamp(npc.economia.propensionEmprender + getModifierDelta(npc, 'propensionEmprender'), 0, 100);
}

export function getActivePhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter(
    (f) => dia >= f.inicioDia && dia < f.inicioDia + f.duracionDias
  );
}

export function getAnnouncedPhenomena(state: GameState): ClimatePhenomenon[] {
  const dia = state.reloj.dia;
  return state.clima.fenomenos.filter(
    (f) => typeof f.avisoDias === 'number' && dia >= f.inicioDia - f.avisoDias && dia < f.inicioDia
  );
}

export function shortestZonePath(
  zonas: GameState['zonas'],
  from: ZoneId,
  to: ZoneId
): ZoneId[] {
  if (from === to) return [from];
  const visited = new Set<ZoneId>([from]);
  const queue: ZoneId[][] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    const neighbors = zonas[last]?.vecinas ?? [];
    for (const next of neighbors) {
      if (next === to) return [...path, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [from];
}

export function buildZoneStepMap(
  zonas: GameState['zonas']
): Record<ZoneId, Record<ZoneId, number>> {
  const zoneIds = Object.keys(zonas);
  const dist: Record<ZoneId, Record<ZoneId, number>> = {};
  for (const start of zoneIds) {
    dist[start] = { [start]: 0 };
    const queue: ZoneId[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = dist[start][cur];
      for (const nb of zonas[cur]?.vecinas ?? []) {
        if (dist[start][nb] === undefined) {
          dist[start][nb] = d + 1;
          queue.push(nb);
        }
      }
    }
  }
  return dist;
}

export function getViaTramoCost(tramo: ViaTramo): number {
  if (!tramo.construida || tramo.estado <= 0) return Infinity;
  return tramo.longitud * (1 + VIAL_CONSTANTS.kVial * (1 - clamp(tramo.estado, 0, 100) / 100));
}

export function getBuiltNetworkNodes(state: Pick<GameState, 'zonas' | 'tramos'>): Set<string> {
  const nodes = new Set<string>();
  for (const [zId, z] of Object.entries(state.zonas || {})) {
    if (z.estado !== 'no_urbanizada') {
      nodes.add(z.nodoPrincipal ?? `n_${zId}`);
    }
  }
  for (const t of state.tramos || []) {
    if (t.construida && t.estado > 0) {
      nodes.add(t.nodoA);
      nodes.add(t.nodoB);
    }
  }
  return nodes;
}

export function isViaConnectableToNetwork(
  state: Pick<GameState, 'zonas' | 'tramos'>,
  tramo: ViaTramo
): boolean {
  if (tramo.construida || tramo.enObra) return false;
  const builtNodes = getBuiltNetworkNodes(state);
  return builtNodes.has(tramo.nodoA) || builtNodes.has(tramo.nodoB);
}

export function recomputeRoadDistances(state: GameState): void {
  const adj: Record<string, Array<{ to: string; cost: number }>> = {};
  const addEdge = (a: string, b: string, cost: number) => {
    if (!adj[a]) adj[a] = [];
    adj[a].push({ to: b, cost });
  };

  for (const t of state.tramos || []) {
    const cost = getViaTramoCost(t);
    if (!Number.isFinite(cost)) continue;
    addEdge(t.nodoA, t.nodoB, cost);
    addEdge(t.nodoB, t.nodoA, cost);
  }

  const zoneIds = Object.keys(state.zonas || {});
  const matrix: Record<ZoneId, Record<ZoneId, number>> = {};

  for (const zA of zoneIds) {
    matrix[zA] = {};
    const startNode = state.zonas[zA]?.nodoPrincipal ?? `n_${zA}`;
    const distNode: Record<string, number> = { [startNode]: 0 };
    const visited = new Set<string>();
    const queue: string[] = [startNode];

    while (queue.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if ((distNode[queue[i]] ?? Infinity) < (distNode[queue[bestIdx]] ?? Infinity)) {
          bestIdx = i;
        }
      }
      const u = queue.splice(bestIdx, 1)[0];
      if (visited.has(u)) continue;
      visited.add(u);
      const du = distNode[u] ?? Infinity;
      for (const edge of adj[u] ?? []) {
        const nd = du + edge.cost;
        if (nd < (distNode[edge.to] ?? Infinity)) {
          distNode[edge.to] = nd;
          queue.push(edge.to);
        }
      }
    }

    for (const zB of zoneIds) {
      if (zA === zB) {
        matrix[zA][zB] = VIAL_CONSTANTS.costoInternoZona;
      } else {
        const endNode = state.zonas[zB]?.nodoPrincipal ?? `n_${zB}`;
        const d = distNode[endNode];
        matrix[zA][zB] =
          typeof d === 'number' && Number.isFinite(d)
            ? Number((d + VIAL_CONSTANTS.costoInternoZona).toFixed(2))
            : Infinity;
      }
    }
  }

  state.distanciasZonas = matrix;
}

export function getZoneTravelCost(state: GameState, from: ZoneId, to: ZoneId): number {
  if (from === to) return VIAL_CONSTANTS.costoInternoZona;
  const cached = state.distanciasZonas?.[from]?.[to];
  if (typeof cached === 'number') return cached;
  const steps = buildZoneStepMap(state.zonas);
  const stepDist = steps[from]?.[to];
  return typeof stepDist === 'number'
    ? stepDist * 10 + VIAL_CONSTANTS.costoInternoZona
    : Infinity;
}

export function getCommuteProductivityFactor(state: GameState, npc: Npc): number {
  if (!npc.empleadorId) return 1;
  const firma = state.firmas.find((f) => f.id === npc.empleadorId);
  if (!firma) return 1;
  const cost = getZoneTravelCost(state, npc.zona, firma.zona);
  if (!Number.isFinite(cost)) return 0.65;
  const extra = Math.max(0, cost - VIAL_CONSTANTS.costoInternoZona);
  return clamp(1 - extra * VIAL_CONSTANTS.kTraslado, 0.72, 1);
}

export function computeDemandaSuelo(state: GameState): Record<string, number> {
  const result: Record<string, number> = {};
  const activeZones = getWorldZones(state);
  const parcelTipos: ParcelTipo[] = ['residencial', 'comercial', 'industrial', 'agricola'];

  const casaById = new Map(state.casas.map((c) => [c.id, c]));
  const freeCountByZoneTipo = new Map<string, number>();
  for (const p of state.parcelas) {
    if (p.estado === 'libre') {
      const k = `${p.zona}:${p.tipoParcela}`;
      freeCountByZoneTipo.set(k, (freeCountByZoneTipo.get(k) ?? 0) + 1);
    }
  }

  for (const z of activeZones) {
    const zHogares = state.hogares.filter((h) => h.zona === z);
    const streetOrCrowded = zHogares.filter(
      (h) => h.estado === 'calle' || isHogarHacinado(h, h.casaId ? casaById.get(h.casaId) : undefined)
    ).length;

    const expandingCom = state.firmas.filter(
      (f) =>
        f.activa &&
        f.zona === z &&
        f.rubro !== 'agro' &&
        f.rubro !== 'industria' &&
        f.rubro !== 'medio' &&
        f.factor > 1.02 &&
        f.caja >= 220
    ).length;

    const expandingAgro = state.firmas.filter(
      (f) => f.activa && f.zona === z && f.rubro === 'agro' && f.factor > 1.02 && f.caja >= 260
    ).length;

    const expandingInd = state.firmas.filter(
      (f) => f.activa && f.zona === z && f.rubro === 'industria' && f.factor > 1.02 && f.caja >= 340
    ).length;

    const demandByTipo: Record<ParcelTipo, number> = {
      residencial: streetOrCrowded,
      comercial: expandingCom,
      industrial: expandingInd,
      agricola: expandingAgro,
      publica: 0,
      especial: 0,
    };

    for (const pt of parcelTipos) {
      const key = `${z}:${pt}`;
      const libres = freeCountByZoneTipo.get(key) ?? 0;
      const dem = demandByTipo[pt];
      result[key] = Number((dem / Math.max(0.5, libres)).toFixed(2));
    }
  }

  return result;
}

export function computeTotalWorldMoney(state: GameState): number {
  let total = state.gobierno.reserva;
  for (const h of state.hogares) {
    total += h.dinero;
  }
  for (const f of state.firmas) {
    total += f.caja + f.ventas;
  }
  return total;
}

export function computeDailyFoodPriceForZone(state: GameState, zona: ZoneId): number {
  const agroFirmas = state.firmas.filter((f) => f.activa && f.rubro === 'agro');
  const zonePop = Math.max(
    1,
    state.npcs.filter((n) => n.vivo && n.zona === zona).length
  );
  const agroZone = agroFirmas.filter((f) => f.zona === zona);
  const stockZone =
    agroZone.length > 0
      ? agroZone.reduce((s, f) => s + (f.stock ?? 0), 0)
      : state.alimento.stock / Math.max(1, getWorldZones(state).length);
  const diasStockZone = stockZone / Math.max(1, zonePop * ECON_CONSTANTS.consumoPorNpc);
  const globalDays = Math.max(0.2, state.alimento.diasStock);
  const effDays = agroZone.length > 0 ? (diasStockZone * 0.6 + globalDays * 0.4) : globalDays;

  const scarcityFactor = clamp(10 / Math.max(1.5, effDays), 0.72, 2.4);

  let climateMult = 1;
  for (const fen of getActivePhenomena(state)) {
    const fInt = fen.intensidad / 100;
    if (fen.tipo === 'sequia') {
      climateMult *= 1 + ECON_CONSTANTS.coefSequiaPrecio * fInt;
    } else if (fen.tipo === 'plaga') {
      climateMult *= 1 + ECON_CONSTANTS.coefPlagaPrecio * fInt;
    }
  }

  const inflFactor = 1 + (state.gobierno.inflacion || 0) / 100;
  const comerciosZona = state.firmas.filter(
    (f) => f.activa && f.rubro === 'comercio' && f.zona === zona
  );
  const maxMargen = comerciosZona.reduce((m, f) => Math.max(m, f.margenPoder || 0), 0);
  const rawPrice =
    ECON_CONSTANTS.precioBaseAlimento * scarcityFactor * climateMult * inflFactor * (1 + maxMargen);

  const capMode = state.gobierno.palancasVigentes.precioMaximo;
  const capFactor = capMode === 'moderado' ? 1.25 : capMode === 'estricto' ? 0.6 : null;
  if (capFactor !== null) {
    return Number(Math.min(rawPrice, ECON_CONSTANTS.precioBaseAlimento * capFactor * inflFactor).toFixed(3));
  }
  return Number(rawPrice.toFixed(3));
}

export function getFirmaLocales(state: GameState, firma: Firma): Parcela[] {
  if (!firma.locales || firma.locales.length === 0) return [];
  const set = new Set(firma.locales);
  return state.parcelas.filter((p) => set.has(p.id) && p.edificio && p.edificio.activo);
}

export function getFirmaRoleCaps(state: GameState, firma: Firma): Partial<Record<RoleId, number>> {
  const total: Partial<Record<RoleId, number>> = {};
  for (const p of getFirmaLocales(state, firma)) {
    if (!p.edificio) continue;
    const caps = getBuildingRoleCapacity(p.edificio);
    for (const [role, val] of Object.entries(caps)) {
      if (typeof val === 'number' && val > 0) {
        total[role as RoleId] = (total[role as RoleId] ?? 0) + val;
      }
    }
  }
  return total;
}

export function getHouseEffectiveCapacity(casa: Casa): number {
  const stateFactor = clamp(casa.estado / 100, 0.4, 1);
  return Math.max(1, Math.round(casa.capacidad * stateFactor));
}

export function isHogarHacinado(hogar: Hogar, casa: Casa | undefined): boolean {
  if (!casa) return false;
  return hogar.miembros.length > getHouseEffectiveCapacity(casa);
}

export interface HospitalFacilityInfo {
  edificioId: string;
  parcelaId: string;
  nombre: string;
  zona: ZoneId;
  tipo: 'hospital' | 'hospital_campana';
  esCampana: boolean;
  medicosAsignados: number;
  camasFisicas: number;
  camasEfectivas: number;
  ocupadas: number;
  libres: number;
  diasRestantesCampana?: number;
}

export function computeHospitalFacilities(
  parcelas: Parcela[],
  npcs: Npc[],
  zonas?: GameState['zonas']
): HospitalFacilityInfo[] {
  const active = getActiveBuildings(parcelas).filter(
    (b) => b.tipo === 'hospital' || b.tipo === 'hospital_campana'
  );
  if (active.length === 0) return [];

  const vivos = npcs.filter((n) => n.vivo);
  const medicosPorZona: Record<string, number> = {};
  for (const n of vivos) {
    if (n.rol === 'medico' && !n.hospital.internado && !n.accionIa?.fueraDePuesto) {
      medicosPorZona[n.zona] = (medicosPorZona[n.zona] || 0) + 1;
    }
  }

  const hospitalesPermanentesPorZona: Record<string, BuildingInstance[]> = {};
  for (const b of active) {
    if (b.tipo === 'hospital') {
      if (!hospitalesPermanentesPorZona[b.zona]) hospitalesPermanentesPorZona[b.zona] = [];
      hospitalesPermanentesPorZona[b.zona].push(b);
    }
  }

  const parcelNameById = new Map<string, string>();
  for (const p of parcelas) parcelNameById.set(p.id, p.nombre);

  const zoneSteps = zonas ? buildZoneStepMap(zonas) : null;
  const totalMedicos = Object.values(medicosPorZona).reduce((s, c) => s + c, 0);
  const totalPerm = active.filter((b) => b.tipo === 'hospital').length;

  const facilities: HospitalFacilityInfo[] = active.map((b) => {
    const def = BUILDING_CATALOG[b.tipo];
    const camasFisicas = def.camasHospital ?? 0;
    let medicosAsignados = 0;
    let camasEfectivas = camasFisicas;

    if (b.tipo === 'hospital') {
      const sameZoneHosp = hospitalesPermanentesPorZona[b.zona]?.length ?? 1;
      const medsLocal = medicosPorZona[b.zona] || 0;
      medicosAsignados =
        medsLocal > 0
          ? Math.round(medsLocal / sameZoneHosp)
          : totalPerm > 0
          ? Math.round(totalMedicos / totalPerm)
          : 0;
      // Fallback: count all active medicos across reachable zones if local has none
      if (medicosAsignados === 0 && totalMedicos > 0 && zoneSteps) {
        const anyMeds = Object.values(medicosPorZona).reduce((a, c) => a + c, 0);
        medicosAsignados = Math.max(1, Math.round(anyMeds / totalPerm));
      }
      camasEfectivas = Math.min(camasFisicas, medicosAsignados * ECON_CONSTANTS.pacientesPorMedico);
    }

    const ocupadas = vivos.filter(
      (n) => n.hospital.internado && n.hospital.edificioId === b.id
    ).length;

    return {
      edificioId: b.id,
      parcelaId: b.parcelaId,
      nombre: parcelNameById.get(b.parcelaId) || def.nombre,
      zona: b.zona,
      tipo: b.tipo as 'hospital' | 'hospital_campana',
      esCampana: b.tipo === 'hospital_campana',
      medicosAsignados,
      camasFisicas,
      camasEfectivas,
      ocupadas,
      libres: Math.max(0, camasEfectivas - ocupadas),
      diasRestantesCampana: b.diasRestantesCampana,
    };
  });

  // Unassigned internados fall back to first available facility
  const internadosSinEdificio = vivos.filter(
    (n) => n.hospital.internado && !n.hospital.edificioId
  ).length;
  if (internadosSinEdificio > 0 && facilities.length > 0) {
    facilities[0].ocupadas += internadosSinEdificio;
    facilities[0].libres = Math.max(0, facilities[0].camasEfectivas - facilities[0].ocupadas);
  }

  return facilities;
}

export function computeNpcVariableTargets(
  npc: Npc,
  hogar: Hogar | undefined,
  casa: Casa | undefined,
  state: GameState
): {
  satisfaccion: number;
  lealtad: number;
} {
  const vivosCount = Math.max(1, state.npcs.filter((n) => n.vivo).length);
  const hospitalCap = computeHospitalFacilities(state.parcelas, state.npcs, state.zonas).reduce(
    (s, f) => s + f.camasEfectivas,
    0
  );
  const internadosCount = state.npcs.filter((n) => n.vivo && n.hospital.internado).length;
  const hospitalFull = hospitalCap > 0 && internadosCount >= hospitalCap;

  const isStreet = hogar?.estado === 'calle';
  const isOwner =
    Boolean(casa && hogar) &&
    ((casa!.dueno.tipo === 'hogar' && casa!.dueno.id === hogar!.id) ||
      (casa!.dueno.tipo === 'npc' && hogar!.miembros.includes(casa!.dueno.id)));
  const isCrowded = isHogarHacinado(hogar ?? ({ miembros: [] } as unknown as Hogar), casa);
  const houseBadState = casa ? casa.estado < HOUSING_CONSTANTS.umbralEstadoCasaMalo : false;
  const rentBurden =
    hogar && casa && !isOwner && hogar.ultimoIngresoNeto > 0
      ? casa.alquiler / Math.max(1, hogar.ultimoIngresoNeto)
      : 0;

  const powerAdq = state.ultimaSalidaEconomica?.poderAdquisitivo?.[npc.hogarId] ?? 65;
  const empBonus = npc.rol === 'desempleado' ? -12 : 4;
  const healthBonus = (npc.variables.salud - 70) * 0.28;
  const hungerPenalty = npc.variables.hambre * 0.42;
  const fearPenalty = npc.variables.miedo * 0.2;
  const housingDelta =
    (isOwner ? 6 : 0) +
    (isStreet ? -22 : 0) +
    (isCrowded ? -8 : 0) +
    (houseBadState ? -6 : 0) +
    (rentBurden > 0.4 ? -clamp((rentBurden - 0.4) * 28, 0, 14) : 0);

  const familySize = hogar?.miembros.length ?? 1;
  const familyBonus = (npc.parejaId ? 3 : 0) + (familySize >= 3 ? 2.5 : 0);
  const recentLossPenalty =
    npc.ultimaPerdidaFamiliarDia && state.reloj.dia - npc.ultimaPerdidaFamiliarDia <= 14
      ? -clamp(14 - (state.reloj.dia - npc.ultimaPerdidaFamiliarDia), 2, 12)
      : 0;

  const hungryKidsPenalty =
    hogar && hogar.noPudoPagarComida ? -8 : 0;

  const resilFactor = (getEffectiveTrait(npc, 'resiliencia') - 50) * 0.14;
  const modSat = getModifierDelta(npc, 'satisfaccion');

  const satisfaccion = clamp(
    46 +
      (powerAdq - 50) * 0.3 +
      empBonus +
      healthBonus -
      hungerPenalty -
      fearPenalty +
      housingDelta +
      familyBonus +
      recentLossPenalty +
      hungryKidsPenalty +
      resilFactor +
      modSat,
    0,
    100
  );

  const pubBonus = ROLE_CATALOG[npc.rol].publico ? 8 : 0;
  const taxDrag = (state.gobierno.palancasVigentes.impuesto - 36) * -0.25;
  const servQuality =
    (state.gobierno.indicadores.salud +
      state.gobierno.indicadores.seguridad +
      state.gobierno.indicadores.infraestructura) /
      3 -
    55;
  const modLealtad = getModifierDelta(npc, 'lealtad');
  const lealtad = clamp(
    52 +
      (satisfaccion - 50) * 0.55 +
      pubBonus +
      taxDrag +
      servQuality * 0.25 -
      (hospitalFull && vivosCount > 0 ? 4 : 0) +
      modLealtad,
    0,
    100
  );

  return { satisfaccion, lealtad };
}

export function getNpcProductivity(npc: Npc, state: GameState): number {
  if (!npc.vivo || npc.hospital.internado || npc.accionIa?.fueraDePuesto) return 0;
  const hogar = state.hogares.find((h) => h.id === npc.hogarId);
  const streetFactor = hogar?.estado === 'calle' ? HOUSING_CONSTANTS.calleProdFactor : 1;
  const commuteFactor = getCommuteProductivityFactor(state, npc);
  const modProd = getModifierDelta(npc, 'productividad');
  const base = clamp(
    (45 + npc.variables.salud * 0.4 + npc.personalidad.laboriosidad * 0.15 - npc.variables.hambre * 0.35) *
      streetFactor *
      commuteFactor +
      modProd,
    15,
    125
  );
  return Number(base.toFixed(1));
}

export function syncLegacyEnterprisesView(state: GameState): void {
  const agroFirms = state.firmas.filter((f) => f.activa && f.rubro === 'agro');
  const comFirms = state.firmas.filter((f) => f.activa && f.rubro === 'comercio');

  const agg = (
    list: Firma[],
    target: GameState['empresas']['alimento'],
    isAgro: boolean
  ) => {
    if (list.length === 0) {
      target.ventasAcum = 0;
      target.factor = 1;
      target.ultimoIngresoPeriodo = 0;
      target.ultimoSueldosPeriodo = 0;
      target.ultimaGanancia = 0;
      if (isAgro) target.stock = state.alimento.stock;
      return;
    }
    const lead = list[0];
    const owners = new Set<string>();
    for (const f of list) {
      for (const p of f.partes) {
        if (p.tipo === 'npc') owners.add(p.id);
      }
    }
    target.dueno = lead.gerenteId ?? ([...owners][0] || null);
    target.socios = [...owners];
    target.ventasAcum = list.reduce((s, f) => s + f.ventas, 0);
    target.factor = Number((list.reduce((s, f) => s + f.factor, 0) / list.length).toFixed(3));
    target.ultimoIngresoPeriodo = list.reduce((s, f) => s + f.ultimoIngresoPeriodo, 0);
    target.ultimoSueldosPeriodo = list.reduce((s, f) => s + f.ultimoSueldosPeriodo, 0);
    target.ultimaGanancia = list.reduce((s, f) => s + f.ultimaGanancia, 0);
    target.periodosFactorAlto = lead.periodosFactorAlto;
    target.periodosFactorBajo = lead.periodosFactorBajo;
    target.ultimoTramo = lead.ultimoTramo;
    target.despidosPendientes = list.reduce((s, f) => s + f.despidosPendientes, 0);
    target.ultimaCausa = lead.ultimaCausa;
    if (isAgro) {
      target.stock = list.reduce((s, f) => s + (f.stock ?? 0), 0);
      target.siloDias = state.alimento.siloDias;
    }
  };

  agg(agroFirms, state.empresas.alimento, true);
  agg(comFirms, state.empresas.comercio, false);
}

export function deriveCommunityStats(state: GameState): CommunityDerived {
  const total = Math.max(1, state.config.poblacionInicial);
  const vivos = state.npcs.filter((n) => n.vivo);
  const vivosCount = vivos.length;
  const bajas = Math.max(0, state.npcs.length - vivosCount);

  const roles: Record<RoleId, number> = {
    estudiante: 0,
    agricultor: 0,
    obrero: 0,
    policia: 0,
    estatal: 0,
    comerciante: 0,
    empresario: 0,
    tecnico: 0,
    docente: 0,
    periodista: 0,
    medico: 0,
    ingeniero: 0,
    constructor: 0,
    inmobiliario: 0,
    desempleado: 0,
    jubilado: 0,
  };

  const hogarById = new Map<string, Hogar>();
  for (const h of state.hogares) hogarById.set(h.id, h);
  const casaById = new Map<string, Casa>();
  for (const c of state.casas) casaById.set(c.id, c);

  let satSum = 0;
  let apoyoCount = 0;
  let descCount = 0;
  let hambreCrit = 0;
  let sinDinero = 0;
  let internados = 0;
  let esperandoCama = 0;
  let prodSum = 0;
  let edadSum = 0;
  let menores = 0;
  let jubilados = 0;
  let laborales = 0;

  for (const n of vivos) {
    roles[n.rol] = (roles[n.rol] ?? 0) + 1;
    satSum += n.variables.satisfaccion;
    if (n.variables.lealtad >= 50) apoyoCount++;
    if (n.variables.satisfaccion < 35) descCount++;
    if (n.variables.hambre >= 70) hambreCrit++;
    const h = hogarById.get(n.hogarId);
    if (!h || h.dinero <= 1) sinDinero++;
    if (n.hospital.internado) internados++;
    if (n.hospital.esperandoCama) esperandoCama++;
    prodSum += getNpcProductivity(n, state);
    edadSum += n.edad;
    if (n.edad < 18) menores++;
    else if (n.edad >= 65) jubilados++;
    else if (n.rol !== 'estudiante') laborales++;
  }

  const hogCount = Math.max(1, state.hogares.length);
  let calleCount = 0;
  let conCasaCount = 0;
  let hacinadosCount = 0;
  let despensaSum = 0;
  let rentLoadSum = 0;
  let rentLoadCount = 0;

  for (const h of state.hogares) {
    if (h.estado === 'calle') calleCount++;
    if (h.estado === 'con_casa') {
      conCasaCount++;
      const casa = h.casaId ? casaById.get(h.casaId) : undefined;
      if (isHogarHacinado(h, casa)) hacinadosCount++;
      if (casa && casa.alquiler > 0) {
        const isOwner =
          (casa.dueno.tipo === 'hogar' && casa.dueno.id === h.id) ||
          (casa.dueno.tipo === 'npc' && h.miembros.includes(casa.dueno.id));
        if (!isOwner && h.ultimoIngresoNeto > 0) {
          rentLoadSum += (casa.alquiler / Math.max(1, h.ultimoIngresoNeto)) * 100;
          rentLoadCount++;
        }
      }
    }
    const miembros = Math.max(1, h.miembros.length);
    despensaSum += h.despensa / miembros;
  }

  const hospFacilities = computeHospitalFacilities(state.parcelas, state.npcs, state.zonas);
  const camasHospital = hospFacilities.reduce((s, f) => s + f.camasEfectivas, 0);
  const capacidadHospitalTotal = hospFacilities.reduce((s, f) => s + f.camasFisicas, 0);
  const hospitalesLlenos = hospFacilities.filter(
    (f) => f.camasEfectivas > 0 && f.libres === 0
  ).length;
  const hospitalOcupacionPct =
    camasHospital > 0
      ? Number((((internados + esperandoCama) / camasHospital) * 100).toFixed(1))
      : internados + esperandoCama > 0
      ? 100
      : 0;

  const zoneIds = getWorldZones(state);
  const defensa: Record<ZoneId, number> = {};
  const orden: Record<ZoneId, number> = {};
  const amenazaPercibida: Record<ZoneId, number> = {};

  const activeBuildings = getActiveBuildings(state.parcelas);
  const zombieActive = getActivePhenomena(state).some((f) => f.tipo === 'plaga_zombie');

  for (const z of zoneIds) {
    const zNpcs = vivos.filter((n) => getEffectiveZone(n, zoneIds.length, zoneIds) === z);
    const zPol = zNpcs.filter((n) => n.rol === 'policia' && !n.hospital.internado && !n.accionIa?.fueraDePuesto).length;
    const bonusComisaria = activeBuildings
      .filter((b) => b.zona === z && b.tipo === 'comisaria')
      .reduce((s, b) => s + (BUILDING_CATALOG[b.tipo].bonusDefensa ?? 0), 0);
    const bonusMuralla = activeBuildings
      .filter((b) => b.zona === z && b.tipo === 'muralla')
      .reduce((s, b) => s + (BUILDING_CATALOG[b.tipo].defensaMuralla ?? 0), 0);
    const integ = state.gobierno.integridad[z] ?? 100;
    defensa[z] = Number(clamp(zPol * 10 + bonusComisaria + bonusMuralla + (integ - 100) * 0.25, 0, 100).toFixed(1));

    const zStreet = state.hogares.filter((h) => h.zona === z && h.estado === 'calle').length;
    const zOut = zNpcs.filter((n) => n.accionIa?.fueraDePuesto).length;
    const zFear = zNpcs.length > 0 ? zNpcs.reduce((s, n) => s + n.variables.miedo, 0) / zNpcs.length : 0;
    const neededPol = Math.max(1, zNpcs.length * ECON_CONSTANTS.objetivoOrden);
    const ordRatio = clamp(zPol / neededPol, 0, 1.3);
    orden[z] = Number(clamp(48 + ordRatio * 42 - zOut * 5 - zStreet * 3 - zFear * 0.15, 0, 100).toFixed(1));

    const hits = state.golpesPorZonaHistorial[z] ?? [];
    const recentHits = hits.filter((d) => state.reloj.dia - d <= ECON_CONSTANTS.golpeAmenazaVentanaDias).length;
    amenazaPercibida[z] = Number(
      clamp((zombieActive ? 25 : 0) + recentHits * ECON_CONSTANTS.golpeAmenazaPeso, 0, 100).toFixed(1)
    );
  }

  const activeFirmas = state.firmas.filter((f) => f.activa);
  let cuotaMayorPct = 0;
  for (const f of activeFirmas) {
    for (const q of Object.values(f.cuotaZona || {})) {
      if (q * 100 > cuotaMayorPct) cuotaMayorPct = q * 100;
    }
  }

  const yearsElapsed = Math.max(1 / 365, state.reloj.dia / 365);
  const natalidad = Number(
    ((state.mercadoStats.nacimientosAcum / Math.max(1, vivosCount)) * 100 / Math.max(0.2, yearsElapsed)).toFixed(2)
  );
  const mortalidad = Number(
    ((state.mercadoStats.muertesAcum / Math.max(1, vivosCount)) * 100 / Math.max(0.2, yearsElapsed)).toFixed(2)
  );

  const tramos = state.tramos ?? [];
  const parcelasSinCalle = state.parcelas.filter((p) => p.estado === 'sin_calle').length;
  const zonasNoUrbanizadas = Object.values(state.zonas).filter(
    (z) => z.estado === 'no_urbanizada'
  ).length;
  const tramosEnMalEstado = tramos.filter(
    (t) => t.construida && t.estado > 0 && t.estado < VIAL_CONSTANTS.umbralMalEstadoVia
  ).length;
  const tramosCortados = tramos.filter((t) => t.construida && t.estado <= 0).length;
  const maint = computeMaintenanceBreakdown(
    state.parcelas,
    state.gobierno.palancasVigentes.nivelObras,
    vivosCount,
    state.config.poblacionInicial,
    tramos
  );
  const constrFirms = activeFirmas.filter((f) => f.rubro === 'construccion');
  const constructoraSalud = {
    firmas: constrFirms.length,
    ventasPeriodo: Number(
      constrFirms.reduce((s, f) => s + (f.ultimoIngresoPeriodo || f.ventas || 0), 0).toFixed(1)
    ),
    factorMedio:
      constrFirms.length > 0
        ? Number((constrFirms.reduce((s, f) => s + f.factor, 0) / constrFirms.length).toFixed(2))
        : 0,
    empleos: constrFirms.reduce((s, f) => s + f.empleados.length, 0),
  };

  return {
    poblacion: vivosCount,
    poblacionPct: Number(((vivosCount / total) * 100).toFixed(1)),
    vivos: vivosCount,
    bajas,
    satisfaccionMedia: vivosCount > 0 ? Number((satSum / vivosCount).toFixed(1)) : 0,
    apoyoPct: vivosCount > 0 ? Number(((apoyoCount / vivosCount) * 100).toFixed(1)) : 0,
    descontentosPct: vivosCount > 0 ? Number(((descCount / vivosCount) * 100).toFixed(1)) : 0,
    desempleoPct:
      laborales > 0 ? Number(((roles.desempleado / laborales) * 100).toFixed(1)) : 0,
    hambreCriticaPct: vivosCount > 0 ? Number(((hambreCrit / vivosCount) * 100).toFixed(1)) : 0,
    sinDineroPct: vivosCount > 0 ? Number(((sinDinero / vivosCount) * 100).toFixed(1)) : 0,
    despensaMediaDias: Number((despensaSum / hogCount).toFixed(2)),
    hospitalOcupacionPct,
    camasHospital,
    capacidadHospitalTotal,
    hospitalesLlenos,
    internados,
    esperandoCama,
    edificiosActivos: activeBuildings.length,
    parcelasLibres: state.parcelas.filter((p) => p.estado === 'libre').length,
    parcelasSinCalle,
    zonasNoUrbanizadas,
    tramosEnMalEstado,
    tramosCortados,
    mantenimientoTotalPeriodo: maint.mantenimientoTotal,
    hogares: state.hogares.length,
    callePct: Number(((calleCount / hogCount) * 100).toFixed(1)),
    hacinamientoPct:
      conCasaCount > 0 ? Number(((hacinadosCount / conCasaCount) * 100).toFixed(1)) : 0,
    alquilerCargaMediaPct:
      rentLoadCount > 0 ? Number((rentLoadSum / rentLoadCount).toFixed(1)) : 0,
    natalidad,
    mortalidad,
    edadMedia: vivosCount > 0 ? Number((edadSum / vivosCount).toFixed(1)) : 0,
    pctMenores: vivosCount > 0 ? Number(((menores / vivosCount) * 100).toFixed(1)) : 0,
    pctJubilados: vivosCount > 0 ? Number(((jubilados / vivosCount) * 100).toFixed(1)) : 0,
    defensa,
    orden,
    amenazaPercibida,
    productividadTotal: Number(prodSum.toFixed(1)),
    roles,
    mercado: {
      firmas: activeFirmas.length,
      cuotaMayorPct: Number(cuotaMayorPct.toFixed(1)),
      quiebrasPeriodo: state.mercadoStats.quiebrasPeriodo,
      fundacionesPeriodo: state.mercadoStats.fundacionesPeriodo,
    },
    constructoraSalud,
  };
}

export const ROOT_EVENT_TYPES = new Set<string>([
  'control',
  'obra_inicio',
  'demolicion',
  'fenomeno_inicio',
  'aviso',
  'muerte',
  'nacimiento',
  'pareja',
  'herencia',
  'desalojo',
  'firma_fundada',
  'firma_compra',
  'firma_quiebra',
  'monopolio',
  'impago',
  'hito',
  'victoria',
  'objetivo_perdido',
  'fin_partida',
]);

export function compactEvents(state: GameState): void {
  const cutoff = state.reloj.dia - ECON_CONSTANTS.ventanaEventosDias;
  if (cutoff <= 1 && state.eventos.length <= 1500) return;
  const kept: SimEvent[] = [];
  const aggByDayZone: Record<string, { dia: number; zona: ZoneId; conteos: Record<string, number> }> = {};

  const byId = new Map<string, SimEvent>();
  for (const e of state.eventos) byId.set(e.id, e);
  const pinned = new Set<string>();
  for (const e of state.eventos) {
    if (e.tipo === 'agregado' || e.dia < cutoff) continue;
    let cur: string | undefined = e.causa;
    for (let depth = 0; depth < 6 && cur; depth++) {
      const parent = byId.get(cur);
      if (!parent || pinned.has(parent.id)) break;
      if (parent.dia < cutoff) pinned.add(parent.id);
      cur = parent.causa;
    }
  }

  for (const ev of state.eventos) {
    if (ev.dia >= cutoff || ROOT_EVENT_TYPES.has(ev.tipo) || pinned.has(ev.id)) {
      kept.push(ev);
    } else if (ev.tipo === 'agregado') {
      const key = `${ev.dia}:${ev.zona}`;
      const cur = aggByDayZone[key];
      if (cur) {
        for (const [k, v] of Object.entries(ev.conteos)) cur.conteos[k] = (cur.conteos[k] ?? 0) + v;
      } else {
        aggByDayZone[key] = { dia: ev.dia, zona: ev.zona, conteos: { ...ev.conteos } };
      }
    } else {
      const key = `${ev.dia}:${ev.zona}`;
      if (!aggByDayZone[key]) {
        aggByDayZone[key] = { dia: ev.dia, zona: ev.zona, conteos: {} };
      }
      aggByDayZone[key].conteos[ev.tipo] = (aggByDayZone[key].conteos[ev.tipo] ?? 0) + 1;
    }
  }

  for (const bucket of Object.values(aggByDayZone)) {
    kept.push({
      id: nextSeqId(state, 'ev_agg'),
      dia: bucket.dia,
      tipo: 'agregado',
      zona: bucket.zona,
      conteos: bucket.conteos,
    });
  }

  const pinnedRoots: SimEvent[] = [];
  const aggEvents: SimEvent[] = [];
  const recentOthers: SimEvent[] = [];

  for (const ev of kept) {
    if (ROOT_EVENT_TYPES.has(ev.tipo) || pinned.has(ev.id)) {
      pinnedRoots.push(ev);
    } else if (ev.tipo === 'agregado') {
      aggEvents.push(ev);
    } else {
      recentOthers.push(ev);
    }
  }

  pinnedRoots.sort((a, b) => b.dia - a.dia);
  aggEvents.sort((a, b) => b.dia - a.dia);
  recentOthers.sort((a, b) => b.dia - a.dia);

  const maxEvents = 1500;
  const keptRoots = pinnedRoots.slice(0, maxEvents);
  const remainingAfterRoots = Math.max(0, maxEvents - keptRoots.length);
  const minAggReserve = Math.min(aggEvents.length, Math.min(600, remainingAfterRoots));
  const recentBudget = Math.max(0, remainingAfterRoots - minAggReserve);
  const keptRecent = recentOthers.slice(0, recentBudget);
  const aggBudget = Math.max(minAggReserve, remainingAfterRoots - keptRecent.length);
  const keptAgg = aggEvents.slice(0, aggBudget);

  const finalEvents = [...keptRoots, ...keptRecent, ...keptAgg];
  finalEvents.sort((a, b) => b.dia - a.dia);
  state.eventos = finalEvents;
}

export function emitSimEvent(state: GameState, event: SimEvent): void {
  state.eventosDiaActual.push(event);
  state.eventos.unshift(event);
  if (state.eventos.length > 1500) {
    compactEvents(state);
  }
}

export function addNpcModifier(npc: Npc, mod: Modifier): void {
  const existingIdx = npc.modificadores.findIndex((m) => m.id === mod.id);
  if (existingIdx >= 0) {
    npc.modificadores[existingIdx] = mod;
  } else {
    npc.modificadores.push(mod);
  }
}

export function checkEngineInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const isM4 = state.config.nivelMundo === 'M4' || state.config.economiaModulo === 'fiscal';
  if (!isM4) {
    const actualMoney = computeTotalWorldMoney(state);
    const expectedMoney =
      state.ultimoDineroTotal + state.auditEntradasDia - state.auditSalidasDia;
    if (Math.abs(actualMoney - expectedMoney) > 0.25) {
      errors.push(
        `Dinero total derivó día ${state.reloj.dia}: actual=${actualMoney.toFixed(2)} esperado=${expectedMoney.toFixed(2)}`
      );
    }
  }

  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const casaById = new Map(state.casas.map((c) => [c.id, c]));
  const firmaById = new Map(state.firmas.map((f) => [f.id, f]));

  for (const h of state.hogares) {
    if (h.estado !== 'acogida') {
      const hasAdult = h.miembros.some((id) => {
        const m = npcById.get(id);
        return m && m.vivo && m.edad >= 18;
      });
      if (!hasAdult) {
        errors.push(`Hogar ${h.id} sin adulto vivo`);
      }
    }
  }

  for (const n of state.npcs) {
    if (!n.vivo) continue;
    const h = hogarById.get(n.hogarId);
    if (!h || !h.miembros.includes(n.id)) {
      errors.push(`NPC ${n.id} sin hogar válido (${n.hogarId})`);
    }
    if (n.empleadorId) {
      const f = firmaById.get(n.empleadorId);
      if (!f || !f.activa || !f.empleados.includes(n.id)) {
        errors.push(`NPC ${n.id} tiene empleadorId ${n.empleadorId} pero no figura en nómina`);
      }
    }
  }

  for (const c of state.casas) {
    if (c.hogarId) {
      const h = hogarById.get(c.hogarId);
      if (!h || h.casaId !== c.id || h.estado !== 'con_casa') {
        errors.push(`Casa ${c.id} ocupada inconsistente con hogar ${c.hogarId}`);
      }
    }
  }

  for (const f of state.firmas) {
    if (!f.activa) continue;
    const isState = f.partes.some((p) => p.tipo === 'estado');
    if (!isState && f.partes.length > 0) {
      const sum = f.partes.reduce((s, p) => s + p.pct, 0);
      if (Math.abs(sum - 100) > 0.2) {
        errors.push(`Firma ${f.id} partes suman ${sum.toFixed(2)}`);
      }
    }
  }

  for (const p of state.parcelas) {
    if (p.estado === 'sin_calle' && p.edificio) {
      errors.push(`Parcela sin calle ${p.id} tiene edificio`);
    }
  }

  void casaById;
  return errors;
}

export function getRubroDisplayName(rubro: FirmRubro): string {
  switch (rubro) {
    case 'agro':
      return 'Agroalimentaria';
    case 'industria':
      return 'Industria';
    case 'comercio':
      return 'Comercio';
    case 'gastronomia':
      return 'Gastronomía';
    case 'servicios':
      return 'Servicios';
    case 'entretenimiento':
      return 'Entretenimiento';
    case 'construccion':
      return 'Construcción';
    case 'inmobiliaria':
      return 'Inmobiliaria';
    case 'medio':
      return 'Medio de Prensa';
    case 'banco':
      return 'Banca y Crédito';
  }
}
