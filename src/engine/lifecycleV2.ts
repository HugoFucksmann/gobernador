import {
  BUILDING_CATALOG,
  DEMOG_CONSTANTS,
  ECON_CONSTANTS,
  EDUCATION_CONSTANTS,
  FIRM_CONSTANTS,
  HOUSING_CONSTANTS,
  MIGRATION_CONSTANTS,
  PERIOD_DAYS,
  PERIOD_DAYS_DEMOG,
  ROLE_CATALOG,
  SPANISH_LAST_NAMES,
  SPANISH_NAMES,
  TRAINING_CONSTANTS,
  VIAL_CONSTANTS,
} from '../data/catalogs';
import {
  Casa,
  Firma,
  FirmPart,
  GameState,
  Hogar,
  Npc,
  PersonalityTrait,
  PublicRoleId,
  RoleId,
  ZoneId,
} from '../types/game';
import { getBuildingJobCaps, getGovernorLevel } from './policies';
import { nextSeqId, nextSubRand, subRandInt, subRandRange } from './rng';
import {
  buildSeededNpcRitmo,
  clamp,
  emitSimEvent,
  getEffectiveTrait,
  getFirmaRoleCaps,
  getZoneTravelCost,
  isLotIsolated,
} from './worldHelpers';

const TRAITS: PersonalityTrait[] = [
  'valentia',
  'laboriosidad',
  'codicia',
  'rebeldia',
  'resiliencia',
  'sociabilidad',
];

function normalizeFirmPartes(firma: Firma, npcsById: Map<string, Npc>): void {
  const valid = firma.partes.filter((p) => p.pct > 0.001);
  if (valid.length === 0) {
    firma.partes = [];
    return;
  }
  const sum = valid.reduce((s, p) => s + p.pct, 0);
  if (sum > 0 && Math.abs(sum - 100) > 0.001) {
    const scale = 100 / sum;
    for (const p of valid) p.pct = Number((p.pct * scale).toFixed(4));
  }
  firma.partes = valid;
  // Sync onto NPCs if referenced
  for (const p of firma.partes) {
    if (p.tipo === 'npc') {
      const owner = npcsById.get(p.id);
      if (owner && owner.vivo) {
        const idx = owner.partes.findIndex((x) => x.firmaId === firma.id);
        if (idx >= 0) owner.partes[idx].pct = p.pct;
        else owner.partes.push({ firmaId: firma.id, pct: p.pct });
      }
    }
  }
}

function addOrMergeFirmPart(
  firma: Firma,
  tipo: FirmPart['tipo'],
  id: string,
  pct: number,
  npcsById: Map<string, Npc>
): void {
  if (pct <= 0) return;
  const ex = firma.partes.find((p) => p.tipo === tipo && p.id === id);
  if (ex) ex.pct += pct;
  else firma.partes.push({ tipo, id, pct });

  if (tipo === 'npc') {
    const npc = npcsById.get(id);
    if (npc && npc.vivo) {
      const nPart = npc.partes.find((p) => p.firmaId === firma.id);
      if (nPart) nPart.pct += pct;
      else npc.partes.push({ firmaId: firma.id, pct });
    }
  }
}

function getLivingChildren(npcId: string, npcs: Npc[]): Npc[] {
  return npcs.filter((n) => n.vivo && n.padresIds.includes(npcId));
}

function findLivingAdultRelative(
  orphan: Npc,
  excludeHogarId: string,
  npcs: Npc[],
  hogarById: Map<string, Hogar>
): Npc | null {
  const candidates: Npc[] = [];
  // 1. Siblings who are adults in a valid non-acogida household
  for (const n of npcs) {
    if (!n.vivo || n.id === orphan.id || n.edad < 18 || n.hogarId === excludeHogarId) continue;
    const h = hogarById.get(n.hogarId);
    if (!h || h.estado === 'acogida') continue;
    if (
      orphan.padresIds.some((pid) => n.padresIds.includes(pid)) ||
      (orphan.apellido && n.apellido === orphan.apellido)
    ) {
      candidates.push(n);
    }
  }
  if (candidates.length === 0) return null;
  // Prefer same zone
  return candidates.find((c) => c.zona === orphan.zona) ?? candidates[0];
}

export function handleNpcDeathV2(
  state: GameState,
  npc: Npc,
  causa: string,
  opts: { isNatural: boolean; esperandoCama?: boolean }
): void {
  if (!npc.vivo) return;
  npc.vivo = false;
  npc.hospital.internado = false;
  npc.hospital.esperandoCama = false;
  npc.hospital.edificioId = undefined;
  npc.accionIa = null;

  state.mercadoStats.muertesAcum = (state.mercadoStats.muertesAcum || 0) + 1;

  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));

  // Vacate firm employment & gerente
  if (npc.empleadorId) {
    const f = state.firmas.find((x) => x.id === npc.empleadorId);
    if (f) {
      f.empleados = f.empleados.filter((id) => id !== npc.id);
      if (f.gerenteId === npc.id) {
        const nextMgr = f.partes.find((p) => p.tipo === 'npc' && p.id !== npc.id)?.id ?? f.empleados[0] ?? null;
        f.gerenteId = nextMgr;
      }
    }
    npc.empleadorId = null;
  }

  // Vacate media columnist slot
  for (const m of state.medios) {
    if (m.columnistas.includes(npc.id)) {
      m.columnistas = m.columnistas.filter((id) => id !== npc.id);
    }
    if (m.duenoNpcIds.includes(npc.id)) {
      m.duenoNpcIds = m.duenoNpcIds.filter((id) => id !== npc.id);
    }
  }

  // Detach partner + record family loss grief
  const partner = npc.parejaId ? npcById.get(npc.parejaId) : undefined;
  if (partner && partner.vivo) {
    partner.parejaId = null;
    partner.ultimaPerdidaFamiliarDia = state.reloj.dia;
  }
  npc.parejaId = null;

  const hogar = hogarById.get(npc.hogarId);
  if (hogar) {
    hogar.miembros = hogar.miembros.filter((id) => id !== npc.id);
    if (hogar.adultoIds) {
      hogar.adultoIds = hogar.adultoIds.filter((id) => id !== npc.id);
    }
    for (const mid of hogar.miembros) {
      const m = npcById.get(mid);
      if (m && m.vivo) m.ultimaPerdidaFamiliarDia = state.reloj.dia;
    }
  }

  // Immediate firm share inheritance
  const children = getLivingChildren(npc.id, state.npcs);
  const heirs: Npc[] = [];
  if (partner && partner.vivo) heirs.push(partner);
  for (const ch of children) {
    if (!heirs.some((x) => x.id === ch.id)) heirs.push(ch);
  }
  if (heirs.length === 0 && hogar) {
    for (const mid of hogar.miembros) {
      const m = npcById.get(mid);
      if (m && m.vivo && m.edad >= 18) heirs.push(m);
    }
  }

  const transferredPartes: Array<{ firmaId: string; pct: number }> = [];
  if (npc.partes.length > 0) {
    for (const part of npc.partes) {
      const firma = state.firmas.find((f) => f.id === part.firmaId && f.activa);
      if (!firma) continue;
      firma.partes = firma.partes.filter((p) => !(p.tipo === 'npc' && p.id === npc.id));
      if (heirs.length > 0) {
        const share = part.pct / heirs.length;
        for (const hNpc of heirs) {
          addOrMergeFirmPart(firma, 'npc', hNpc.id, share, npcById);
        }
      } else {
        addOrMergeFirmPart(firma, 'estado', 'estado', part.pct, npcById);
      }
      normalizeFirmPartes(firma, npcById);
      transferredPartes.push({ firmaId: part.firmaId, pct: Number(part.pct.toFixed(1)) });
    }
    npc.partes = [];
  }

  // Direct NPC-owned houses transfer to household or heirs
  for (const casa of state.casas) {
    if (casa.dueno.tipo === 'npc' && casa.dueno.id === npc.id) {
      if (heirs.length > 0) {
        casa.dueno = { tipo: 'npc', id: heirs[0].id };
      } else if (hogar && hogar.miembros.length > 0) {
        casa.dueno = { tipo: 'hogar', id: hogar.id };
      } else {
        casa.dueno = { tipo: 'estado', id: 'estado' };
      }
    }
  }

  emitSimEvent(state, {
    id: nextSeqId(state, 'ev_muerte'),
    dia: state.reloj.dia,
    tipo: 'muerte',
    zona: npc.zona,
    npcId: npc.id,
    esperandoCama: opts.esperandoCama,
    esNatural: opts.isNatural,
    causa,
  });

  // Check if hogar has remaining living adults
  let inheritedDinero = 0;
  let inheritedCasaId: string | undefined;
  const heirIds = heirs.map((h) => h.id);

  if (hogar) {
    const remainingLiving = hogar.miembros
      .map((id) => npcById.get(id))
      .filter((m): m is Npc => Boolean(m && m.vivo));
    const remainingAdults = remainingLiving.filter((m) => m.edad >= 18);

    if (remainingAdults.length === 0) {
      // Move any surviving minors to relative household or acogida
      const minors = remainingLiving.filter((m) => m.edad < 18);
      for (const minor of minors) {
        const rel = findLivingAdultRelative(minor, hogar.id, state.npcs, hogarById);
        if (rel) {
          const relHogar = hogarById.get(rel.hogarId);
          if (relHogar) {
            relHogar.miembros.push(minor.id);
            minor.hogarId = relHogar.id;
            minor.zona = relHogar.zona;
            continue;
          }
        }
        // Create or join acogida household in zone
        let acogida = state.hogares.find((h) => h.estado === 'acogida' && h.zona === hogar.zona);
        if (!acogida) {
          acogida = {
            id: nextSeqId(state, 'h_acogida'),
            miembros: [],
            adultoIds: [],
            esAcogida: true,
            casaId: null,
            dinero: 0,
            despensa: 0,
            estado: 'acogida',
            periodosSinPagar: 0,
            periodosHacinado: 0,
            zona: hogar.zona,
            ultimoIngresoNeto: 0,
            alquilerPagadoPeriodo: 0,
          };
          state.hogares.push(acogida);
          hogarById.set(acogida.id, acogida);
        }
        acogida.miembros.push(minor.id);
        minor.hogarId = acogida.id;
      }

      // Dissolve hogar and transfer money/house strictly without leaking cash
      const adultHeirHogares: Hogar[] = [];
      for (const hNpc of heirs) {
        if (hNpc.edad >= 18) {
          const hh = hogarById.get(hNpc.hogarId);
          if (hh && hh.id !== hogar.id && hh.estado !== 'acogida' && !adultHeirHogares.includes(hh)) {
            adultHeirHogares.push(hh);
          }
        }
      }

      if (adultHeirHogares.length > 0) {
        inheritedDinero = hogar.dinero;
        const perHogar = hogar.dinero / adultHeirHogares.length;
        const perDespensa = hogar.despensa / adultHeirHogares.length;
        for (const hh of adultHeirHogares) {
          hh.dinero += perHogar;
          hh.despensa += perDespensa;
        }
        hogar.dinero = 0;
        hogar.despensa = 0;

        for (const casa of state.casas) {
          if (casa.dueno.tipo === 'hogar' && casa.dueno.id === hogar.id) {
            casa.dueno = { tipo: 'hogar', id: adultHeirHogares[0].id };
            inheritedCasaId = casa.id;
          }
        }
      } else {
        // No adult heirs -> dinero goes to reserva (zero leakage!)
        inheritedDinero = hogar.dinero;
        state.gobierno.reserva += hogar.dinero;
        hogar.dinero = 0;
        hogar.despensa = 0;
        for (const casa of state.casas) {
          if (casa.dueno.tipo === 'hogar' && casa.dueno.id === hogar.id) {
            casa.dueno = { tipo: 'estado', id: 'estado' };
            inheritedCasaId = casa.id;
          }
        }
      }

      // Release occupied or squatted house
      if (hogar.casaId) {
        const occHouse = state.casas.find((c) => c.id === hogar.casaId);
        if (occHouse && occHouse.hogarId === hogar.id) {
          occHouse.hogarId = null;
        }
      }
      if (hogar.ocupandoCasaId) {
        const squatted = state.casas.find((c) => c.id === hogar.ocupandoCasaId);
        if (squatted) squatted.ocupadaPorAccion = false;
        hogar.ocupandoCasaId = null;
      }

      state.hogares = state.hogares.filter((h) => h.id !== hogar.id);
      state.mercadoStats.hogaresEnAcogida = state.hogares.filter((h) => h.estado === 'acogida').length;

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_hogar_dis'),
        dia: state.reloj.dia,
        tipo: 'hogar_disuelto',
        zona: hogar.zona,
        hogarId: hogar.id,
        herederos: heirIds,
        causa,
      });
    } else if (hogar.estado === 'acogida') {
      state.mercadoStats.hogaresEnAcogida = state.hogares.filter((h) => h.estado === 'acogida').length;
    }
  }

  if (transferredPartes.length > 0 || inheritedDinero > 0 || inheritedCasaId) {
    emitSimEvent(state, {
      id: nextSeqId(state, 'ev_herencia'),
      dia: state.reloj.dia,
      tipo: 'herencia',
      zona: npc.zona,
      deNpcId: npc.id,
      aIds: heirIds,
      dinero: Number(inheritedDinero.toFixed(2)),
      partes: transferredPartes,
      casaId: inheritedCasaId,
      causa,
    });
  }
}

function getReachableEduLimits(
  state: GameState,
  zone: ZoneId
): { maxLevel: 1 | 2 | 3; schoolRatio: number; univRatio: number } {
  let schoolSeats = 0;
  let univSeats = 0;
  const schoolCoveredZones = new Set<ZoneId>();
  const univCoveredZones = new Set<ZoneId>();

  for (const p of state.parcelas) {
    if (!p.edificio?.activo || isLotIsolated(state, p)) continue;
    if (p.edificio.tipo !== 'escuela' && p.edificio.tipo !== 'universidad') continue;
    const cost = getZoneTravelCost(state, zone, p.zona);
    if (!Number.isFinite(cost) || cost > EDUCATION_CONSTANTS.rutaMaxEducacion) continue;
    const seats = BUILDING_CATALOG[p.edificio.tipo].lugaresEstudio ?? (p.edificio.tipo === 'universidad' ? 40 : 50);
    if (p.edificio.tipo === 'escuela') {
      schoolSeats += seats;
      schoolCoveredZones.add(p.zona);
    } else {
      univSeats += seats;
      univCoveredZones.add(p.zona);
    }
  }

  let minorsInCovered = 0;
  let youthInCovered = 0;
  for (const n of state.npcs) {
    if (!n.vivo) continue;
    if (n.edad < EDUCATION_CONSTANTS.edadEgreso && (schoolCoveredZones.has(n.zona) || n.zona === zone)) {
      minorsInCovered++;
    } else if (
      n.edad >= EDUCATION_CONSTANTS.edadEgreso &&
      n.edad <= EDUCATION_CONSTANTS.edadMaxJovenUniv &&
      (univCoveredZones.has(n.zona) || n.zona === zone)
    ) {
      youthInCovered++;
    }
  }

  const schoolRatio =
    schoolSeats > 0
      ? clamp(schoolSeats / Math.max(1, minorsInCovered * EDUCATION_CONSTANTS.umbralCoberturaEscuela), 0.25, 1)
      : 0;
  const univRatio =
    univSeats > 0
      ? clamp(univSeats / Math.max(1, youthInCovered * EDUCATION_CONSTANTS.umbralCoberturaUniversidad), 0.25, 1)
      : 0;

  const maxLevel: 1 | 2 | 3 = schoolSeats === 0 ? 1 : univSeats === 0 ? 2 : 3;
  return { maxLevel, schoolRatio, univRatio };
}

export function runDailyLifecycleV2(state: GameState): void {
  const diaAnio = ((state.reloj.dia - 1) % 365) + 1;
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const govLevel = getGovernorLevel(state.config);
  const extraEduLever = govLevel === 'G3' ? (state.gobierno.extras?.vigentes?.nivelEducacion ?? 0) : 0;

  const vivosSnapshot = state.npcs.filter((n) => n.vivo);
  for (const npc of vivosSnapshot) {
    if (!npc.vivo) continue;

    // 1. Natural age mortality (0 guilt; M0-M4)
    let probMuerteDia = 0;
    if (npc.edad >= 85) probMuerteDia = 0.0028;
    else if (npc.edad >= 75) probMuerteDia = 0.00085;
    else if (npc.edad >= 65) probMuerteDia = 0.00028;
    else if (npc.edad >= 50) probMuerteDia = 0.00005;

    if (probMuerteDia > 0 && nextSubRand(state, 'vida') < probMuerteDia) {
      handleNpcDeathV2(state, npc, 'edad:mortalidad_natural', { isNatural: true });
      continue;
    }

    // 2. Active capacitacion countdown
    if (npc.capacitacion) {
      npc.capacitacion.diasRestantes -= 1;
      npc.capacitacion.periodosRestantes = Math.max(0, Math.ceil(npc.capacitacion.diasRestantes / PERIOD_DAYS));
      if (npc.capacitacion.diasRestantes <= 0) {
        const finished = npc.capacitacion;
        const { maxLevel } = getReachableEduLimits(state, npc.zona);
        const newLevel = clamp(
          Math.max(npc.educacion.nivel, Math.min(maxLevel, finished.educObjetivo)),
          0,
          3
        );
        npc.educacion.nivel = newLevel;
        npc.capacitacion = null;
        npc.mapa.accion = 'buscando empleo';
        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_cap_f'),
          dia: state.reloj.dia,
          tipo: 'capacitacion_fin',
          zona: npc.zona,
          npcId: npc.id,
          rolObjetivo: finished.rolObjetivo,
          educNivel: newLevel,
          causa: 'vida:capacitacion',
        });
      }
    }

    // 3. Birthday check
    if (npc.cumpleanosDia === diaAnio) {
      npc.edad += 1;

      // Graduation at 18: cap by road-reachable escuela (level 2) & universidad (level 3)
      if (npc.edad === EDUCATION_CONSTANTS.edadEgreso && npc.rol === 'estudiante') {
        npc.educacion.estudiando = false;
        const h = hogarById.get(npc.hogarId);
        if (h) {
          h.adultoIds = h.adultoIds ? [...new Set([...h.adultoIds, npc.id])] : [npc.id];
        }
        const { maxLevel, schoolRatio, univRatio } = getReachableEduLimits(state, npc.zona);
        const incomeScore = h ? clamp(h.ultimoIngresoNeto / 80, 0, 1) : 0.4;
        const aptScore =
          (npc.personalidad.laboriosidad * 0.6 + npc.personalidad.resiliencia * 0.4) / 100;
        const schoolBonus = schoolRatio * 0.14;
        const extraEduc = extraEduLever * 0.03;
        const score =
          aptScore * 0.55 +
          incomeScore * 0.35 +
          schoolBonus +
          extraEduc +
          nextSubRand(state, 'vida') * 0.15;

        let rawLevel = score >= 0.72 ? 3 : score >= 0.42 ? 2 : 1;
        if (maxLevel < 2 || (schoolRatio < 1 && nextSubRand(state, 'vida') > schoolRatio)) {
          rawLevel = Math.min(rawLevel, 1);
        } else if (maxLevel < 3 || (univRatio < 1 && nextSubRand(state, 'vida') > univRatio)) {
          rawLevel = Math.min(rawLevel, 2);
        }
        npc.educacion.nivel = rawLevel;
        npc.rol = 'desempleado';
      }

      // Retirement at 65
      if (npc.edad === 65 && npc.rol !== 'jubilado') {
        if (npc.capacitacion) npc.capacitacion = null;
        if (npc.empleadorId) {
          const f = state.firmas.find((x) => x.id === npc.empleadorId);
          if (f) {
            f.empleados = f.empleados.filter((id) => id !== npc.id);
            if (f.gerenteId === npc.id) {
              f.gerenteId =
                f.partes.find((p) => p.tipo === 'npc' && p.id !== npc.id)?.id ??
                f.empleados[0] ??
                null;
            }
          }
          npc.empleadorId = null;
        }
        npc.rol = 'jubilado';
      }
    }
  }
}

/**
 * Capacitación (MUNDO_V2 §5): si un rol crítico (educMin > 0) acumula vacantes sin candidatos
 * durante `periodosVacanteCritica`, un adulto apto se capacita pagando `costoCapacitacion`
 * al Estado (sin pérdida de dinero) hasta el tope que permiten escuela/universidad al alcance.
 */
export function runTrainingPeriodV2(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = vivos.length;
  if (pop === 0) return;

  if (!state.vacantesCriticasRachas) state.vacantesCriticasRachas = {};

  const caps = getBuildingJobCaps(
    state.parcelas,
    pop,
    state.gobierno.palancasVigentes.nivelObras,
    state.gobierno.cuposFijos
  );

  const demandByRole = Object.assign(Object.create(null), {
    medico: caps.medico,
    policia: caps.policia,
    ingeniero: caps.ingeniero,
    docente: caps.docente,
    estatal: caps.estatal,
  }) as Partial<Record<RoleId, number>>;
  for (const f of state.firmas) {
    if (!f.activa || f.locales.length === 0) continue;
    const fCaps = getFirmaRoleCaps(state, f);
    for (const [rStr, cnt] of Object.entries(fCaps)) {
      if (typeof cnt === 'number' && cnt > 0) {
        const r = rStr as RoleId;
        demandByRole[r] = (demandByRole[r] ?? 0) + cnt;
      }
    }
  }

  const filledByRole: Partial<Record<RoleId, number>> = {};
  for (const n of vivos) {
    filledByRole[n.rol] = (filledByRole[n.rol] ?? 0) + 1;
    if (n.capacitacion) {
      filledByRole[n.capacitacion.rolObjetivo] = (filledByRole[n.capacitacion.rolObjetivo] ?? 0) + 1;
    }
  }

  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const criticalRoles: RoleId[] = [
    'medico',
    'docente',
    'policia',
    'ingeniero',
    'estatal',
    'tecnico',
    'comerciante',
    'constructor',
    'inmobiliario',
    'periodista',
  ];

  for (const rol of criticalRoles) {
    const def = ROLE_CATALOG[rol];
    if (def.educMin <= 0) continue;
    const needed = (demandByRole[rol] ?? 0) - (filledByRole[rol] ?? 0);
    const hasEligibleUnemp = vivos.some(
      (n) =>
        n.rol === 'desempleado' &&
        !n.capacitacion &&
        n.edad >= 18 &&
        n.edad < 65 &&
        n.educacion.nivel >= def.educMin
    );

    if (needed > 0 && !hasEligibleUnemp) {
      state.vacantesCriticasRachas[rol] = (state.vacantesCriticasRachas[rol] ?? 0) + 1;
    } else {
      state.vacantesCriticasRachas[rol] = 0;
    }

    if ((state.vacantesCriticasRachas[rol] ?? 0) < TRAINING_CONSTANTS.periodosVacanteCritica) {
      continue;
    }

    let bestCand: Npc | null = null;
    let bestApt = -1;
    let bestReachMax = 1;
    for (const n of vivos) {
      if (
        n.edad < 18 ||
        n.edad >= TRAINING_CONSTANTS.edadMaxCapacitacion ||
        n.capacitacion ||
        n.hospital.internado
      ) {
        continue;
      }
      if (n.rol !== 'desempleado' && ROLE_CATALOG[n.rol].educMin > 0) continue;
      if (n.rol === 'estudiante') continue;
      if (n.educacion.nivel >= def.educMin) continue;

      const apt = (n.personalidad.laboriosidad + n.personalidad.resiliencia) * 0.5;
      if (apt < TRAINING_CONSTANTS.aptitudMinCapacitacion) continue;

      const { maxLevel } = getReachableEduLimits(state, n.zona);
      if (maxLevel < n.educacion.nivel + 1) continue;

      const h = hogarById.get(n.hogarId);
      if (!h || h.estado === 'acogida' || h.dinero < TRAINING_CONSTANTS.costoCapacitacion + 15) continue;

      const score = apt + (n.rol === 'desempleado' ? 15 : 0);
      if (score > bestApt) {
        bestApt = score;
        bestCand = n;
        bestReachMax = maxLevel;
      }
    }

    if (!bestCand) continue;
    const candH = hogarById.get(bestCand.hogarId);
    if (!candH) continue;

    candH.dinero -= TRAINING_CONSTANTS.costoCapacitacion;
    state.gobierno.reserva += TRAINING_CONSTANTS.costoCapacitacion;
    if (bestCand.empleadorId) {
      const f = state.firmas.find((x) => x.id === bestCand!.empleadorId);
      if (f) f.empleados = f.empleados.filter((id) => id !== bestCand!.id);
      bestCand.empleadorId = null;
    }
    bestCand.rol = 'desempleado';
    const diasCap = TRAINING_CONSTANTS.periodosCapacitacion * PERIOD_DAYS;
    bestCand.capacitacion = {
      rolObjetivo: rol,
      educObjetivo: Math.min(bestReachMax, Math.min(def.educMin, bestCand.educacion.nivel + 1)),
      periodosRestantes: TRAINING_CONSTANTS.periodosCapacitacion,
      diasRestantes: diasCap,
    };
    state.vacantesCriticasRachas[rol] = 0;

    emitSimEvent(state, {
      id: nextSeqId(state, 'ev_cap_i'),
      dia: state.reloj.dia,
      tipo: 'capacitacion_inicio',
      zona: bestCand.zona,
      npcId: bestCand.id,
      rolObjetivo: rol,
      educNivel: bestCand.capacitacion.educObjetivo,
      costo: TRAINING_CONSTANTS.costoCapacitacion,
      causa: 'mercado:vacante_critica',
    });
  }
}

function getFreeHousesByZone(state: GameState): Map<ZoneId, Casa[]> {
  const map = new Map<ZoneId, Casa[]>();
  for (const c of state.casas) {
    if (!c.hogarId && !c.ocupadaPorAccion && c.estado > HOUSING_CONSTANTS.umbralAbandonoCasa) {
      const arr = map.get(c.zona) ?? [];
      arr.push(c);
      map.set(c.zona, arr);
    }
  }
  return map;
}

function takeFreeHouse(
  freeByZone: Map<ZoneId, Casa[]>,
  zonas: GameState['zonas'],
  prefZone: ZoneId,
  maxRent: number
): Casa | null {
  const candidatesZones = [prefZone, ...(zonas[prefZone]?.vecinas ?? [])];
  for (const z of candidatesZones) {
    const arr = freeByZone.get(z);
    if (!arr || arr.length === 0) continue;
    const idx = arr.findIndex((c) => c.alquiler <= maxRent);
    if (idx >= 0) {
      const [picked] = arr.splice(idx, 1);
      return picked;
    }
  }
  return null;
}

export function runDemographicPeriodV2(state: GameState): void {
  if (state.reloj.dia < PERIOD_DAYS_DEMOG || state.reloj.dia % PERIOD_DAYS_DEMOG !== 0) {
    return;
  }

  const vivos = state.npcs.filter((n) => n.vivo);
  const vivosCount = vivos.length;
  if (vivosCount === 0) return;

  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const casaById = new Map(state.casas.map((c) => [c.id, c]));
  const freeHousesByZone = getFreeHousesByZone(state);

  // 1. Parejas (by zone, bounded)
  const singlesByZone = new Map<ZoneId, Npc[]>();
  for (const n of vivos) {
    if (n.edad >= 18 && n.edad <= 55 && !n.parejaId) {
      const h = hogarById.get(n.hogarId);
      if (!h || h.estado === 'acogida') continue;
      const arr = singlesByZone.get(n.zona) ?? [];
      arr.push(n);
      singlesByZone.set(n.zona, arr);
    }
  }

  let pairingsThisPeriod = 0;
  const maxPairings = Math.max(1, Math.ceil(vivosCount * 0.03));

  for (const [zona, pool] of singlesByZone.entries()) {
    if (pool.length < 2 || pairingsThisPeriod >= maxPairings) continue;
    const used = new Set<string>();
    for (let i = 0; i < pool.length - 1 && pairingsThisPeriod < maxPairings; i++) {
      const a = pool[i];
      if (used.has(a.id) || a.parejaId) continue;
      const socProbMult = 0.7 + (getEffectiveTrait(a, 'sociabilidad') / 100) * 0.65;
      if (nextSubRand(state, 'vida') >= DEMOG_CONSTANTS.probParejaPeriodo * socProbMult) continue;

      let best: Npc | null = null;
      let bestScore = -999;
      for (let j = i + 1; j < Math.min(pool.length, i + 12); j++) {
        const b = pool[j];
        if (used.has(b.id) || b.parejaId || b.hogarId === a.hogarId) continue;
        // Avoid close sibling/parent pairing
        if (
          a.padresIds.includes(b.id) ||
          b.padresIds.includes(a.id) ||
          (a.padresIds.length > 0 && a.padresIds.some((p) => b.padresIds.includes(p)))
        ) {
          continue;
        }
        const ageDiff = Math.abs(a.edad - b.edad);
        if (ageDiff > 14) continue;
        const socDiff = Math.abs((a.personalidad.sociabilidad ?? 50) - (b.personalidad.sociabilidad ?? 50));
        const score = 20 - ageDiff + (10 - socDiff * 0.12);
        if (score > bestScore) {
          bestScore = score;
          best = b;
        }
      }
      if (!best) continue;

      used.add(a.id);
      used.add(best.id);
      a.parejaId = best.id;
      best.parejaId = a.id;
      pairingsThisPeriod++;

      const hA = hogarById.get(a.hogarId);
      const hB = hogarById.get(best.hogarId);
      if (!hA || !hB || hA.id === hB.id) continue;

      const cA = hA.casaId ? casaById.get(hA.casaId) : undefined;
      const cB = hB.casaId ? casaById.get(hB.casaId) : undefined;

      // Move into a new combined household or the better house
      const combinedMembers = new Set<string>([a.id, best.id]);
      const hAAdults = hA.miembros.filter((id) => {
        const m = npcById.get(id);
        return m && m.vivo && m.edad >= 18 && id !== a.id;
      });
      const hBAdults = hB.miembros.filter((id) => {
        const m = npcById.get(id);
        return m && m.vivo && m.edad >= 18 && id !== best!.id;
      });

      const aShare = hA.miembros.length > 0 ? hA.dinero / Math.max(1, hA.miembros.length) : 0;
      const bShare = hB.miembros.length > 0 ? hB.dinero / Math.max(1, hB.miembros.length) : 0;
      const aFood = hA.miembros.length > 0 ? hA.despensa / Math.max(1, hA.miembros.length) : 0;
      const bFood = hB.miembros.length > 0 ? hB.despensa / Math.max(1, hB.miembros.length) : 0;

      // If both were sole adults in their households, pick larger house cleanly
      let targetHouse: Casa | null = null;
      if (hAAdults.length === 0 && cA && hBAdults.length === 0 && cB) {
        targetHouse = cB.capacidad > cA.capacidad ? cB : cA;
      } else if (hAAdults.length === 0 && cA) {
        targetHouse = cA;
      } else if (hBAdults.length === 0 && cB) {
        targetHouse = cB;
      } else {
        targetHouse = takeFreeHouse(
          freeHousesByZone,
          state.zonas,
          zona,
          Math.max(12, (a.economia.ultimoIngresoNeto + best.economia.ultimoIngresoNeto) * PERIOD_DAYS * 0.42)
        );
      }

      let targetMoney = 0;
      let targetFood = 0;
      if (hAAdults.length === 0) {
        targetMoney += hA.dinero;
        targetFood += hA.despensa;
        // Include any minors of hA
        for (const mid of hA.miembros) combinedMembers.add(mid);
        hA.dinero = 0;
        hA.despensa = 0;
        if (cA && cA !== targetHouse) {
          cA.hogarId = null;
        }
        if (hA.ocupandoCasaId) {
          const sq = casaById.get(hA.ocupandoCasaId);
          if (sq) sq.ocupadaPorAccion = false;
          hA.ocupandoCasaId = null;
        }
        state.hogares = state.hogares.filter((x) => x.id !== hA.id);
        hogarById.delete(hA.id);
      } else {
        targetMoney += aShare;
        targetFood += aFood;
        hA.dinero -= aShare;
        hA.despensa -= aFood;
        hA.miembros = hA.miembros.filter((id) => id !== a.id);
      }

      if (hBAdults.length === 0) {
        targetMoney += hB.dinero;
        targetFood += hB.despensa;
        for (const mid of hB.miembros) combinedMembers.add(mid);
        hB.dinero = 0;
        hB.despensa = 0;
        if (cB && cB !== targetHouse) {
          cB.hogarId = null;
        }
        if (hB.ocupandoCasaId) {
          const sq = casaById.get(hB.ocupandoCasaId);
          if (sq) sq.ocupadaPorAccion = false;
          hB.ocupandoCasaId = null;
        }
        state.hogares = state.hogares.filter((x) => x.id !== hB.id);
        hogarById.delete(hB.id);
      } else {
        targetMoney += bShare;
        targetFood += bFood;
        hB.dinero -= bShare;
        hB.despensa -= bFood;
        hB.miembros = hB.miembros.filter((id) => id !== best!.id);
      }

      const newHogar: Hogar = {
        id: nextSeqId(state, 'h'),
        miembros: [...combinedMembers],
        adultoIds: [...combinedMembers].filter((id) => (npcById.get(id)?.edad ?? 0) >= 18),
        esAcogida: false,
        casaId: targetHouse ? targetHouse.id : null,
        dinero: targetMoney,
        despensa: targetFood,
        estado: targetHouse ? 'con_casa' : 'calle',
        periodosSinPagar: 0,
        periodosHacinado: 0,
        zona: targetHouse ? targetHouse.zona : zona,
        ultimoIngresoNeto: (a.economia.ultimoIngresoNeto + best.economia.ultimoIngresoNeto) * PERIOD_DAYS,
        alquilerPagadoPeriodo: 0,
      };
      if (targetHouse) {
        targetHouse.hogarId = newHogar.id;
        targetHouse.ocupadaPorAccion = false;
        if (targetHouse.dueno.tipo === 'hogar' && !hogarById.has(targetHouse.dueno.id)) {
          targetHouse.dueno = { tipo: 'hogar', id: newHogar.id };
        }
      }

      state.hogares.push(newHogar);
      hogarById.set(newHogar.id, newHogar);

      for (const mid of newHogar.miembros) {
        const m = npcById.get(mid);
        if (m) {
          m.hogarId = newHogar.id;
          m.zona = newHogar.zona;
        }
      }

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_pareja'),
        dia: state.reloj.dia,
        tipo: 'pareja',
        zona: newHogar.zona,
        npcIds: [a.id, best.id],
        hogarNuevoId: newHogar.id,
        causa: 'vida:emparejamiento',
      });
      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_hnuevo'),
        dia: state.reloj.dia,
        tipo: 'hogar_nuevo',
        zona: newHogar.zona,
        hogarId: newHogar.id,
        miembros: [...newHogar.miembros],
        motivo: 'pareja',
        causa: 'vida:emparejamiento',
      });
    }
  }

  // 2. Nacimientos
  const maxBirths = Math.max(1, Math.floor((vivosCount * DEMOG_CONSTANTS.topeNatalidadPctPeriodo) / 100));
  let births = 0;

  for (const h of state.hogares) {
    if (births >= maxBirths) break;
    if (h.estado !== 'con_casa' || !h.casaId) continue;
    const casa = casaById.get(h.casaId);
    if (!casa || h.miembros.length >= casa.capacidad + 1) continue;

    // Check fertile couple inside household
    let p1: Npc | null = null;
    let p2: Npc | null = null;
    for (const mid of h.miembros) {
      const m = npcById.get(mid);
      if (
        m &&
        m.vivo &&
        m.parejaId &&
        h.miembros.includes(m.parejaId) &&
        m.edad >= DEMOG_CONSTANTS.edadFertilMin &&
        m.edad <= DEMOG_CONSTANTS.edadFertilMax
      ) {
        p1 = m;
        p2 = npcById.get(m.parejaId) ?? null;
        break;
      }
    }
    if (!p1 || !p2) continue;

    const avgSat = (p1.variables.satisfaccion + p2.variables.satisfaccion) * 0.5;
    if (avgSat < DEMOG_CONSTANTS.umbralNatalidadSatisfaccion) continue;
    const freeSpaceBonus = h.miembros.length < casa.capacidad ? 1 : 0.45;
    const avgSoc = ((p1.personalidad.sociabilidad ?? 50) + (p2.personalidad.sociabilidad ?? 50)) * 0.5;
    const socFertMult = clamp(0.85 + avgSoc / 300, 0.8, 1.25);
    const prob =
      DEMOG_CONSTANTS.probNacimientoBase *
      freeSpaceBonus *
      socFertMult *
      clamp(avgSat / 65, 0.6, 1.4);

    if (nextSubRand(state, 'vida') >= prob) continue;

    const childTraits = {} as Record<PersonalityTrait, number>;
    for (const tr of TRAITS) {
      const avg = ((p1.personalidad[tr] ?? 50) + (p2.personalidad[tr] ?? 50)) * 0.5;
      childTraits[tr] = Math.round(clamp(avg + subRandRange(state, 'vida', -14, 14), 5, 95));
    }

    const nameIdx = subRandInt(state, 'vida', 0, SPANISH_NAMES.length - 1);
    const babyId = nextSeqId(state, 'npc');
    const baby: Npc = {
      id: babyId,
      nombre: SPANISH_NAMES[nameIdx],
      apellido: p1.apellido,
      edad: 0,
      cumpleanosDia: ((state.reloj.dia - 1) % 365) + 1,
      hogarId: h.id,
      parejaId: null,
      padresIds: [p1.id, p2.id],
      rol: 'estudiante',
      empleadorId: null,
      partes: [],
      zona: h.zona,
      vivo: true,
      educacion: { nivel: 0, estudiando: true },
      personalidad: childTraits,
      ritmo: buildSeededNpcRitmo(babyId, 0, state.semilla, []),
      capacitacion: null,
      variables: {
        salud: 96,
        hambre: 8,
        miedo: 5,
        satisfaccion: clamp(avgSat + 10, 45, 95),
        lealtad: 60,
      },
      economia: {
        ingresoPos: subRandInt(state, 'vida', 25, 75),
        propensionGasto: Math.round(clamp(70 - childTraits.codicia * 0.35 + subRandRange(state, 'vida', -10, 10), 25, 90)),
        propensionEmprender: Math.round(clamp(childTraits.codicia * 0.45 + childTraits.rebeldia * 0.25 + subRandRange(state, 'vida', -10, 15), 10, 95)),
        ultimoIngresoNeto: 0,
      },
      hospital: { internado: false, esperandoCama: false, diasInternado: 0 },
      accionIa: null,
      modificadores: [],
      mapa: {
        x: p1.mapa.x,
        y: p1.mapa.y,
        destino: { x: p1.mapa.x, y: p1.mapa.y },
        accion: 'En casa',
      },
    };

    state.npcs.push(baby);
    npcById.set(baby.id, baby);
    h.miembros.push(baby.id);
    births++;
    state.mercadoStats.nacimientosAcum = (state.mercadoStats.nacimientosAcum || 0) + 1;

    emitSimEvent(state, {
      id: nextSeqId(state, 'ev_nac'),
      dia: state.reloj.dia,
      tipo: 'nacimiento',
      zona: h.zona,
      npcId: baby.id,
      hogarId: h.id,
      padresIds: [p1.id, p2.id],
      causa: 'vida:natalidad',
    });
  }

  // 3. Independizaciones & Hacinamiento splits
  const hogaresSnapshot = [...state.hogares];
  for (const h of hogaresSnapshot) {
    if (h.estado === 'acogida') continue;
    const casa = h.casaId ? casaById.get(h.casaId) : undefined;
    const adults = h.miembros
      .map((id) => npcById.get(id))
      .filter((m): m is Npc => Boolean(m && m.vivo && m.edad >= 18));
    if (adults.length < 2) continue;

    // Independizacion: adult child >= 21 with job/income & affordable free house
    const indepCandidate = adults.find(
      (a) =>
        a.edad >= DEMOG_CONSTANTS.edadIndependizacion &&
        !a.parejaId &&
        a.rol !== 'desempleado' &&
        a.rol !== 'estudiante' &&
        a.economia.ultimoIngresoNeto > 0 &&
        a.padresIds.some((pid) => h.miembros.includes(pid))
    );

    if (indepCandidate) {
      const budget = indepCandidate.economia.ultimoIngresoNeto * PERIOD_DAYS * (HOUSING_CONSTANTS.pctAlquilerMax / 100);
      const freeHouse = takeFreeHouse(freeHousesByZone, state.zonas, h.zona, budget);
      if (freeHouse) {
        const shareCash = h.dinero / Math.max(2, h.miembros.length);
        const shareFood = h.despensa / Math.max(2, h.miembros.length);
        h.dinero -= shareCash;
        h.despensa -= shareFood;
        h.miembros = h.miembros.filter((id) => id !== indepCandidate.id);
        if (h.adultoIds) h.adultoIds = h.adultoIds.filter((id) => id !== indepCandidate.id);

        const newHogar: Hogar = {
          id: nextSeqId(state, 'h'),
          miembros: [indepCandidate.id],
          adultoIds: [indepCandidate.id],
          esAcogida: false,
          casaId: freeHouse.id,
          dinero: shareCash,
          despensa: shareFood,
          estado: 'con_casa',
          periodosSinPagar: 0,
          periodosHacinado: 0,
          zona: freeHouse.zona,
          ultimoIngresoNeto: indepCandidate.economia.ultimoIngresoNeto * PERIOD_DAYS,
          alquilerPagadoPeriodo: 0,
        };
        freeHouse.hogarId = newHogar.id;
        freeHouse.ocupadaPorAccion = false;
        indepCandidate.hogarId = newHogar.id;
        indepCandidate.zona = freeHouse.zona;
        state.hogares.push(newHogar);
        hogarById.set(newHogar.id, newHogar);

        emitSimEvent(state, {
          id: nextSeqId(state, 'ev_indep'),
          dia: state.reloj.dia,
          tipo: 'hogar_nuevo',
          zona: newHogar.zona,
          hogarId: newHogar.id,
          miembros: [indepCandidate.id],
          motivo: 'independizacion',
          causa: 'vida:independizacion',
        });
        continue;
      }
    }

    // Hacinamiento split
    if (
      casa &&
      h.miembros.length > casa.capacidad &&
      h.periodosHacinado >= HOUSING_CONSTANTS.periodosHacinadoSeparacion
    ) {
      const mover = adults.find((a) => !a.parejaId || !h.miembros.includes(a.parejaId));
      if (mover && mover.economia.ultimoIngresoNeto > 0) {
        const freeHouse = takeFreeHouse(
          freeHousesByZone,
          state.zonas,
          h.zona,
          mover.economia.ultimoIngresoNeto * PERIOD_DAYS * 0.48
        );
        if (freeHouse) {
          const shareCash = h.dinero / Math.max(2, h.miembros.length);
          const shareFood = h.despensa / Math.max(2, h.miembros.length);
          h.dinero -= shareCash;
          h.despensa -= shareFood;
          h.miembros = h.miembros.filter((id) => id !== mover.id);
          if (h.adultoIds) h.adultoIds = h.adultoIds.filter((id) => id !== mover.id);
          h.periodosHacinado = 0;

          const newHogar: Hogar = {
            id: nextSeqId(state, 'h'),
            miembros: [mover.id],
            adultoIds: [mover.id],
            esAcogida: false,
            casaId: freeHouse.id,
            dinero: shareCash,
            despensa: shareFood,
            estado: 'con_casa',
            periodosSinPagar: 0,
            periodosHacinado: 0,
            zona: freeHouse.zona,
            ultimoIngresoNeto: mover.economia.ultimoIngresoNeto * PERIOD_DAYS,
            alquilerPagadoPeriodo: 0,
          };
          freeHouse.hogarId = newHogar.id;
          freeHouse.ocupadaPorAccion = false;
          mover.hogarId = newHogar.id;
          mover.zona = freeHouse.zona;
          state.hogares.push(newHogar);
          hogarById.set(newHogar.id, newHogar);

          emitSimEvent(state, {
            id: nextSeqId(state, 'ev_hac'),
            dia: state.reloj.dia,
            tipo: 'hogar_nuevo',
            zona: newHogar.zona,
            hogarId: newHogar.id,
            miembros: [mover.id],
            motivo: 'hacinamiento',
            causa: 'vivienda:hacinamiento',
          });
        }
      }
    }

    // 4. Separaciones
    const coupleAdults = adults.filter((a) => a.parejaId && h.miembros.includes(a.parejaId));
    if (coupleAdults.length >= 2) {
      const a = coupleAdults[0];
      const b = npcById.get(a.parejaId!);
      if (b && b.vivo) {
        const hacinado = casa ? h.miembros.length > casa.capacidad : h.estado === 'calle';
        const poor = h.dinero < 15;
        const pSep =
          DEMOG_CONSTANTS.probSeparacionBase +
          (hacinado ? DEMOG_CONSTANTS.probSeparacionHacinadoExtra : 0) +
          (poor ? 0.012 : 0);
        if (nextSubRand(state, 'vida') < pSep) {
          a.parejaId = null;
          b.parejaId = null;

          const maxSepRent = Math.max(
            10,
            b.economia.ultimoIngresoNeto * PERIOD_DAYS * (HOUSING_CONSTANTS.pctAlquilerMax / 100),
            h.dinero * 0.25
          );
          const freeHouse = takeFreeHouse(freeHousesByZone, state.zonas, h.zona, maxSepRent);
          const halfMoney = h.dinero * 0.5;
          const halfFood = h.despensa * 0.5;
          h.dinero -= halfMoney;
          h.despensa -= halfFood;
          h.miembros = h.miembros.filter((id) => id !== b.id);
          if (h.adultoIds) h.adultoIds = h.adultoIds.filter((id) => id !== b.id);

          // Split minor dependents equitably between partner A (stays) and B (moves)
          const minorsInH = h.miembros.filter((mid) => {
            const m = npcById.get(mid);
            return Boolean(m && m.vivo && m.edad < 18);
          });
          const moveMinors = minorsInH.filter((_, idx) => idx % 2 === 1);
          if (moveMinors.length > 0) {
            const moveSet = new Set(moveMinors);
            h.miembros = h.miembros.filter((id) => !moveSet.has(id));
          }

          const newMembers = [b.id, ...moveMinors];
          const newHogar: Hogar = {
            id: nextSeqId(state, 'h'),
            miembros: newMembers,
            adultoIds: [b.id],
            esAcogida: false,
            casaId: freeHouse ? freeHouse.id : null,
            dinero: halfMoney,
            despensa: halfFood,
            estado: freeHouse ? 'con_casa' : 'calle',
            periodosSinPagar: 0,
            periodosHacinado: 0,
            zona: freeHouse ? freeHouse.zona : h.zona,
            ultimoIngresoNeto: b.economia.ultimoIngresoNeto * PERIOD_DAYS,
            alquilerPagadoPeriodo: 0,
          };
          if (freeHouse) {
            freeHouse.hogarId = newHogar.id;
            freeHouse.ocupadaPorAccion = false;
          }
          for (const mid of newMembers) {
            const m = npcById.get(mid);
            if (m) {
              m.hogarId = newHogar.id;
              m.zona = newHogar.zona;
            }
          }
          state.hogares.push(newHogar);
          hogarById.set(newHogar.id, newHogar);

          emitSimEvent(state, {
            id: nextSeqId(state, 'ev_sep'),
            dia: state.reloj.dia,
            tipo: 'separacion',
            zona: h.zona,
            npcIds: [a.id, b.id],
            hogarIds: [h.id, newHogar.id],
            causa: hacinado ? 'vivienda:hacinamiento' : 'vida:separacion',
          });
        }
      }
    }
  }

  // 5. Migración (llegadas por casas libres + vacantes; salidas por calle o descontento sostenido)
  let openVacancies = 0;
  for (const f of state.firmas) {
    if (!f.activa || f.locales.length === 0) continue;
    const fCaps = getFirmaRoleCaps(state, f);
    const totalCap = Object.values(fCaps).reduce((s, c) => s + (c ?? 0), 0);
    openVacancies += Math.max(0, totalCap - f.empleados.length);
  }
  const habitPool = state.parcelas
    .filter((p) => p.edificio?.activo && (p.edificio.tipo === 'almacen' || p.edificio.tipo === 'tienda' || p.edificio.tipo === 'bar_cafe' || p.edificio.tipo === 'restoran' || p.edificio.tipo === 'cine_teatro'))
    .map((p) => p.id);

  // Llegadas
  let arrivals = 0;
  for (const [z, arr] of freeHousesByZone.entries()) {
    if (arrivals >= MIGRATION_CONSTANTS.maxLlegadas || openVacancies <= 0) break;
    while (arr.length > 0 && arrivals < MIGRATION_CONSTANTS.maxLlegadas && openVacancies > 0) {
      const house = arr.shift()!;
      const memberCount = house.capacidad >= 4 && nextSubRand(state, 'vida') < 0.45 ? 2 : 1;
      const surname = SPANISH_LAST_NAMES[subRandInt(state, 'vida', 0, SPANISH_LAST_NAMES.length - 1)];
      const newHId = nextSeqId(state, 'h_mig');
      const newMembers: string[] = [];
      const newAdults: string[] = [];
      for (let k = 0; k < memberCount; k++) {
        const mId = nextSeqId(state, 'npc');
        const edad = subRandInt(state, 'vida', 22, 42);
        const pers = {
          valentia: subRandInt(state, 'vida', 30, 82),
          laboriosidad: subRandInt(state, 'vida', 42, 88),
          codicia: subRandInt(state, 'vida', 25, 76),
          rebeldia: subRandInt(state, 'vida', 15, 58),
          resiliencia: subRandInt(state, 'vida', 38, 86),
          sociabilidad: subRandInt(state, 'vida', 28, 84),
        };
        const zRect = state.zonas[z]?.rect;
        const mx = zRect ? zRect.wx + zRect.ww * 0.5 : 420;
        const my = zRect ? zRect.wy + zRect.wh * 0.5 : 320;
        const migrant: Npc = {
          id: mId,
          nombre: SPANISH_NAMES[subRandInt(state, 'vida', 0, SPANISH_NAMES.length - 1)],
          apellido: surname,
          edad,
          cumpleanosDia: subRandInt(state, 'vida', 1, 365),
          hogarId: newHId,
          parejaId: null,
          padresIds: [],
          rol: 'desempleado',
          empleadorId: null,
          partes: [],
          zona: z,
          vivo: true,
          educacion: { nivel: subRandInt(state, 'vida', 1, 2), estudiando: false },
          personalidad: pers,
          ritmo: buildSeededNpcRitmo(mId, edad, state.semilla, habitPool),
          capacitacion: null,
          variables: {
            salud: subRandInt(state, 'vida', 82, 96),
            hambre: 14,
            miedo: 8,
            satisfaccion: 62,
            lealtad: 52,
          },
          economia: {
            ingresoPos: subRandInt(state, 'vida', 35, 75),
            propensionGasto: 62,
            propensionEmprender: Math.round(pers.codicia * 0.4 + pers.rebeldia * 0.2 + 12),
            ultimoIngresoNeto: 0,
          },
          hospital: { internado: false, esperandoCama: false, diasInternado: 0 },
          accionIa: null,
          modificadores: [],
          mapa: { x: mx, y: my, destino: { x: mx, y: my }, accion: 'recién llegado' },
        };
        state.npcs.push(migrant);
        npcById.set(migrant.id, migrant);
        newMembers.push(migrant.id);
        newAdults.push(migrant.id);
      }
      if (newMembers.length === 2) {
        const pA = npcById.get(newMembers[0])!;
        const pB = npcById.get(newMembers[1])!;
        pA.parejaId = pB.id;
        pB.parejaId = pA.id;
      }
      const migDinero = MIGRATION_CONSTANTS.dineroMigranteBase * memberCount;
      state.auditEntradasDia += migDinero;
      const migHogar: Hogar = {
        id: newHId,
        miembros: newMembers,
        adultoIds: newAdults,
        esAcogida: false,
        casaId: house.id,
        dinero: migDinero,
        despensa: memberCount * 2,
        estado: 'con_casa',
        periodosSinPagar: 0,
        periodosHacinado: 0,
        periodosEnCalle: 0,
        periodosDescontento: 0,
        zona: z,
        ultimoIngresoNeto: 0,
        alquilerPagadoPeriodo: 0,
      };
      house.hogarId = migHogar.id;
      house.ocupadaPorAccion = false;
      state.hogares.push(migHogar);
      hogarById.set(migHogar.id, migHogar);
      arrivals++;
      openVacancies = Math.max(0, openVacancies - memberCount);

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_mig_l'),
        dia: state.reloj.dia,
        tipo: 'migracion_llegada',
        zona: z,
        hogarId: migHogar.id,
        cantidad: memberCount,
        dinero: migDinero,
        causa: 'mercado:casas_y_vacantes',
      });
    }
  }

  // Salidas: track street & discontent streaks; emigrate if no owned house & no firm shares
  let departures = 0;
  const maxDepartures = 2;
  const livingNow = state.npcs.filter((n) => n.vivo).length;
  for (const h of [...state.hogares]) {
    if (h.estado === 'acogida') continue;
    const members = h.miembros.map((id) => npcById.get(id)).filter((m): m is Npc => Boolean(m && m.vivo));
    if (members.length === 0) continue;

    if (h.estado === 'calle' && !h.ocupandoCasaId) {
      h.periodosEnCalle = (h.periodosEnCalle ?? 0) + 1;
    } else {
      h.periodosEnCalle = 0;
    }
    const avgSat = members.reduce((s, m) => s + m.variables.satisfaccion, 0) / members.length;
    if (avgSat < MIGRATION_CONSTANTS.umbralEmigrarSatisfaccion) {
      h.periodosDescontento = (h.periodosDescontento ?? 0) + 1;
    } else {
      h.periodosDescontento = 0;
    }

    if (departures >= maxDepartures || livingNow - members.length < 25) continue;
    const shouldLeave =
      (h.periodosEnCalle ?? 0) >= MIGRATION_CONSTANTS.periodosParaEmigrar ||
      (h.periodosDescontento ?? 0) >= MIGRATION_CONSTANTS.periodosDescontentoEmigrar;
    if (!shouldLeave) continue;

    const ownsFirm = members.some((m) => m.partes.length > 0);
    const ownsHouse = state.casas.some(
      (c) =>
        (c.dueno.tipo === 'hogar' && c.dueno.id === h.id) ||
        (c.dueno.tipo === 'npc' && h.miembros.includes(c.dueno.id))
    );
    if (ownsFirm || ownsHouse) continue;

    const exitMoney = h.dinero;
    const motivo: 'calle' | 'descontento' =
      (h.periodosEnCalle ?? 0) >= MIGRATION_CONSTANTS.periodosParaEmigrar ? 'calle' : 'descontento';
    state.auditSalidasDia += exitMoney;
    h.dinero = 0;
    h.despensa = 0;
    if (h.casaId) {
      const occC = casaById.get(h.casaId);
      if (occC && occC.hogarId === h.id) occC.hogarId = null;
    }
    if (h.ocupandoCasaId) {
      const sq = casaById.get(h.ocupandoCasaId);
      if (sq) sq.ocupadaPorAccion = false;
      h.ocupandoCasaId = null;
    }
    for (const m of members) {
      m.vivo = false;
      m.hospital.internado = false;
      m.hospital.esperandoCama = false;
      m.accionIa = null;
      m.capacitacion = null;
      if (m.empleadorId) {
        const f = state.firmas.find((x) => x.id === m.empleadorId);
        if (f) f.empleados = f.empleados.filter((id) => id !== m.id);
        m.empleadorId = null;
      }
      if (m.parejaId) {
        const p = npcById.get(m.parejaId);
        if (p && !h.miembros.includes(p.id)) p.parejaId = null;
        m.parejaId = null;
      }
      for (const med of state.medios) {
        if (med.columnistas.includes(m.id)) med.columnistas = med.columnistas.filter((id) => id !== m.id);
        if (med.duenoNpcIds.includes(m.id)) med.duenoNpcIds = med.duenoNpcIds.filter((id) => id !== m.id);
      }
    }
    state.hogares = state.hogares.filter((x) => x.id !== h.id);
    departures++;

    emitSimEvent(state, {
      id: nextSeqId(state, 'ev_mig_s'),
      dia: state.reloj.dia,
      tipo: 'migracion_salida',
      zona: h.zona,
      hogarId: h.id,
      cantidad: members.length,
      dinero: Number(exitMoney.toFixed(2)),
      motivo,
      causa: motivo === 'calle' ? 'vivienda:calle_prolongada' : 'vida:descontento_sostenido',
    });
  }
}

export function assignRolesAndJobsV2(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = vivos.length;
  if (pop === 0) return;

  const caps = getBuildingJobCaps(
    state.parcelas,
    pop,
    state.gobierno.palancasVigentes.nivelObras,
    state.gobierno.cuposFijos
  );

  const pubTarget: Record<PublicRoleId, number> = {
    policia: caps.policia,
    medico: caps.medico,
    ingeniero: caps.ingeniero,
    estatal: caps.estatal,
    docente: caps.docente,
  };

  const pubCount: Record<PublicRoleId, number> = {
    policia: 0,
    medico: 0,
    ingeniero: 0,
    estatal: 0,
    docente: 0,
  };

  const unemployedAdults: Npc[] = [];
  for (const n of vivos) {
    if (ROLE_CATALOG[n.rol].publico) {
      pubCount[n.rol as PublicRoleId]++;
    } else if (n.rol === 'desempleado' && !n.capacitacion && n.edad >= 18 && n.edad < 65) {
      unemployedAdults.push(n);
    }
  }

  // 1. Fill public vacancies from unemployed (education >= educMin)
  const pubRolesOrder: PublicRoleId[] = ['medico', 'policia', 'ingeniero', 'docente', 'estatal'];
  for (const pRole of pubRolesOrder) {
    let needed = pubTarget[pRole] - pubCount[pRole];
    if (needed <= 0) continue;
    const educMin = ROLE_CATALOG[pRole].educMin;
    for (let i = 0; i < unemployedAdults.length && needed > 0; i++) {
      const cand = unemployedAdults[i];
      if (cand.rol !== 'desempleado' || cand.educacion.nivel < educMin) continue;
      cand.rol = pRole;
      cand.empleadorId = null;
      needed--;
      pubCount[pRole]++;
    }
  }

  // 2. Sync active private firms' employee lists & assign remaining unemployed to open private slots
  const remainingUnemp = unemployedAdults.filter((n) => n.rol === 'desempleado');
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));
  const npcById = new Map(vivos.map((n) => [n.id, n]));
  let remainingUnempCount = remainingUnemp.length;

  if (remainingUnempCount > 0) {
    const activeFirms = state.firmas.filter(
      (f) => f.activa && f.factor >= FIRM_CONSTANTS.factorMinContratacion && f.locales.length > 0
    );
    for (const f of activeFirms) {
      if (remainingUnempCount <= 0) break;
      const roleCaps = getFirmaRoleCaps(state, f);
      const currentByRole: Partial<Record<RoleId, number>> = Object.create(null);
      for (const eid of f.empleados) {
        const emp = npcById.get(eid);
        if (emp) currentByRole[emp.rol] = (currentByRole[emp.rol] ?? 0) + 1;
      }

      let hiredHere = 0;
      for (const [roleStr, cap] of Object.entries(roleCaps)) {
        const role = roleStr as RoleId;
        if (typeof cap !== 'number' || cap <= 0) continue;
        let openSlots = cap - (currentByRole[role] ?? 0);
        if (openSlots <= 0) continue;
        const educMin = ROLE_CATALOG[role].educMin;

        // Prefer reachable route within rutaMaxTrabajo, non-calle first
        for (const cand of remainingUnemp) {
          if (openSlots <= 0 || hiredHere >= ECON_CONSTANTS.maxContratacionesPorPeriodo || remainingUnempCount <= 0) break;
          if (cand.rol !== 'desempleado' || cand.educacion.nivel < educMin) continue;
          const h = hogarById.get(cand.hogarId);
          const isStreet = h?.estado === 'calle' && !h?.ocupandoCasaId;
          if (isStreet && nextSubRand(state, 'mercado') < 0.35) continue;
          const travelCost = getZoneTravelCost(state, cand.zona, f.zona);
          if (!Number.isFinite(travelCost) || travelCost > VIAL_CONSTANTS.rutaMaxTrabajo) continue;
          const sameOrNeighbor = cand.zona === f.zona || state.zonas[f.zona]?.vecinas.includes(cand.zona);
          if (!sameOrNeighbor && travelCost > 20 && nextSubRand(state, 'mercado') < 0.35) continue;

          cand.rol = role;
          cand.empleadorId = f.id;
          f.empleados.push(cand.id);
          openSlots--;
          hiredHere++;
          remainingUnempCount--;
        }
      }
    }
  }
}
