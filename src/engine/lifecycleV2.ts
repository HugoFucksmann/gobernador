import {
  DEMOG_CONSTANTS,
  ECON_CONSTANTS,
  HOUSING_CONSTANTS,
  PERIOD_DAYS_DEMOG,
  ROLE_CATALOG,
  SPANISH_NAMES,
} from '../data/catalogs';
import {
  Casa,
  Firma,
  FirmPart,
  GameState,
  Hogar,
  Npc,
  OwnerRef,
  PersonalityTrait,
  PublicRoleId,
  RoleId,
  ZoneId,
} from '../types/game';
import { getBuildingJobCaps } from './policies';
import { nextSeqId, nextSubRand, subRandInt, subRandRange } from './rng';
import {
  clamp,
  emitSimEvent,
  getFirmaRoleCaps,
  getStage,
  getWorldZones,
} from './worldHelpers';

const TRAITS: PersonalityTrait[] = [
  'valentia',
  'laboriosidad',
  'codicia',
  'rebeldia',
  'resiliencia',
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

export function addOrMergeFirmPart(
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
  if (npc.parejaId) {
    const partner = npcById.get(npc.parejaId);
    if (partner && partner.vivo) {
      partner.parejaId = null;
      partner.ultimaPerdidaFamiliarDia = state.reloj.dia;
    }
  }

  const hogar = hogarById.get(npc.hogarId);
  if (hogar) {
    hogar.miembros = hogar.miembros.filter((id) => id !== npc.id);
    for (const mid of hogar.miembros) {
      const m = npcById.get(mid);
      if (m && m.vivo) m.ultimaPerdidaFamiliarDia = state.reloj.dia;
    }
  }

  // Immediate firm share inheritance
  const children = getLivingChildren(npc.id, state.npcs);
  const partner = npc.parejaId ? npcById.get(npc.parejaId) : undefined;
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

      // Release occupied house
      if (hogar.casaId) {
        const occHouse = state.casas.find((c) => c.id === hogar.casaId);
        if (occHouse && occHouse.hogarId === hogar.id) {
          occHouse.hogarId = null;
        }
      }

      state.hogares = state.hogares.filter((h) => h.id !== hogar.id);

      emitSimEvent(state, {
        id: nextSeqId(state, 'ev_hogar_dis'),
        dia: state.reloj.dia,
        tipo: 'hogar_disuelto',
        zona: hogar.zona,
        hogarId: hogar.id,
        herederos: heirIds,
        causa,
      });
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

export function runDailyLifecycleV2(state: GameState): void {
  const diaAnio = ((state.reloj.dia - 1) % 365) + 1;
  const escuelasPorZona = new Map<ZoneId, number>();
  for (const p of state.parcelas) {
    if (p.edificio?.activo && p.edificio.tipo === 'escuela') {
      escuelasPorZona.set(p.zona, (escuelasPorZona.get(p.zona) ?? 0) + 1);
    }
  }
  const hogarById = new Map(state.hogares.map((h) => [h.id, h]));

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

    // 2. Birthday check
    if (npc.cumpleanosDia === diaAnio) {
      npc.edad += 1;

      // Graduation at 18
      if (npc.edad === 18 && npc.rol === 'estudiante') {
        npc.educacion.estudiando = false;
        const h = hogarById.get(npc.hogarId);
        const incomeScore = h ? clamp(h.ultimoIngresoNeto / 80, 0, 1) : 0.4;
        const aptScore =
          (npc.personalidad.laboriosidad * 0.6 + npc.personalidad.resiliencia * 0.4) / 100;
        const schoolBonus = (escuelasPorZona.get(npc.zona) ?? 0) > 0 ? 0.12 : 0;
        const extraEduc = state.gobierno.extras?.vigentes?.nivelEducacion ?? 0;
        const score =
          aptScore * 0.55 +
          incomeScore * 0.35 +
          schoolBonus +
          extraEduc * 0.03 +
          nextSubRand(state, 'vida') * 0.15;
        npc.educacion.nivel = score >= 0.72 ? 3 : score >= 0.42 ? 2 : 1;
        npc.rol = 'desempleado';
      }

      // Retirement at 65
      if (npc.edad === 65 && npc.rol !== 'jubilado') {
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
      if (nextSubRand(state, 'vida') >= DEMOG_CONSTANTS.probParejaPeriodo) continue;

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
        const score = 20 - ageDiff;
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

      // If both were sole adults in their households, merge cleanly
      let targetHouse: Casa | null = null;
      if (hAAdults.length === 0 && cA) {
        targetHouse = cA;
      } else if (hBAdults.length === 0 && cB) {
        targetHouse = cB;
      } else {
        targetHouse = takeFreeHouse(
          freeHousesByZone,
          state.zonas,
          zona,
          Math.max(12, (a.economia.ultimoIngresoNeto + best.economia.ultimoIngresoNeto) * 7 * 0.42)
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
        casaId: targetHouse ? targetHouse.id : null,
        dinero: targetMoney,
        despensa: targetFood,
        estado: targetHouse ? 'con_casa' : 'calle',
        periodosSinPagar: 0,
        periodosHacinado: 0,
        zona: targetHouse ? targetHouse.zona : zona,
        ultimoIngresoNeto: a.economia.ultimoIngresoNeto + best.economia.ultimoIngresoNeto,
        alquilerPagadoPeriodo: 0,
      };
      if (targetHouse) {
        targetHouse.hogarId = newHogar.id;
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
    const prob =
      DEMOG_CONSTANTS.probNacimientoBase *
      freeSpaceBonus *
      clamp(avgSat / 65, 0.6, 1.4);

    if (nextSubRand(state, 'vida') >= prob) continue;

    const childTraits = {} as Record<PersonalityTrait, number>;
    for (const tr of TRAITS) {
      const avg = (p1.personalidad[tr] + p2.personalidad[tr]) * 0.5;
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
      const budget = indepCandidate.economia.ultimoIngresoNeto * 7 * (HOUSING_CONSTANTS.pctAlquilerMax / 100);
      const freeHouse = takeFreeHouse(freeHousesByZone, state.zonas, h.zona, budget);
      if (freeHouse) {
        const shareCash = h.dinero / Math.max(2, h.miembros.length);
        const shareFood = h.despensa / Math.max(2, h.miembros.length);
        h.dinero -= shareCash;
        h.despensa -= shareFood;
        h.miembros = h.miembros.filter((id) => id !== indepCandidate.id);

        const newHogar: Hogar = {
          id: nextSeqId(state, 'h'),
          miembros: [indepCandidate.id],
          casaId: freeHouse.id,
          dinero: shareCash,
          despensa: shareFood,
          estado: 'con_casa',
          periodosSinPagar: 0,
          periodosHacinado: 0,
          zona: freeHouse.zona,
          ultimoIngresoNeto: indepCandidate.economia.ultimoIngresoNeto * 7,
          alquilerPagadoPeriodo: 0,
        };
        freeHouse.hogarId = newHogar.id;
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
          mover.economia.ultimoIngresoNeto * 7 * 0.48
        );
        if (freeHouse) {
          const shareCash = h.dinero / Math.max(2, h.miembros.length);
          const shareFood = h.despensa / Math.max(2, h.miembros.length);
          h.dinero -= shareCash;
          h.despensa -= shareFood;
          h.miembros = h.miembros.filter((id) => id !== mover.id);
          h.periodosHacinado = 0;

          const newHogar: Hogar = {
            id: nextSeqId(state, 'h'),
            miembros: [mover.id],
            casaId: freeHouse.id,
            dinero: shareCash,
            despensa: shareFood,
            estado: 'con_casa',
            periodosSinPagar: 0,
            periodosHacinado: 0,
            zona: freeHouse.zona,
            ultimoIngresoNeto: mover.economia.ultimoIngresoNeto * 7,
            alquilerPagadoPeriodo: 0,
          };
          freeHouse.hogarId = newHogar.id;
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

          const freeHouse = takeFreeHouse(freeHousesByZone, state.zonas, h.zona, 28);
          const halfMoney = h.dinero * 0.5;
          const halfFood = h.despensa * 0.5;
          h.dinero -= halfMoney;
          h.despensa -= halfFood;
          h.miembros = h.miembros.filter((id) => id !== b.id);

          const newHogar: Hogar = {
            id: nextSeqId(state, 'h'),
            miembros: [b.id],
            casaId: freeHouse ? freeHouse.id : null,
            dinero: halfMoney,
            despensa: halfFood,
            estado: freeHouse ? 'con_casa' : 'calle',
            periodosSinPagar: 0,
            periodosHacinado: 0,
            zona: freeHouse ? freeHouse.zona : h.zona,
            ultimoIngresoNeto: b.economia.ultimoIngresoNeto * 7,
            alquilerPagadoPeriodo: 0,
          };
          if (freeHouse) freeHouse.hogarId = newHogar.id;
          b.hogarId = newHogar.id;
          b.zona = newHogar.zona;
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
}

export function assignRolesAndJobsV2(state: GameState): void {
  const vivos = state.npcs.filter((n) => n.vivo);
  const pop = vivos.length;
  if (pop === 0) return;

  const caps = getBuildingJobCaps(
    state.parcelas,
    pop,
    state.gobierno.palancasVigentes.nivelObras,
    state.config.poblacionInicial,
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
    } else if (n.rol === 'desempleado' && n.edad >= 18 && n.edad < 65) {
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

  if (remainingUnemp.length > 0) {
    const activeFirms = state.firmas.filter((f) => f.activa && f.factor >= 0.85 && f.locales.length > 0);
    for (const f of activeFirms) {
      if (remainingUnemp.every((u) => u.rol !== 'desempleado')) break;
      const roleCaps = getFirmaRoleCaps(state, f);
      const currentByRole: Partial<Record<RoleId, number>> = {};
      for (const eid of f.empleados) {
        const emp = vivos.find((n) => n.id === eid);
        if (emp) currentByRole[emp.rol] = (currentByRole[emp.rol] ?? 0) + 1;
      }

      let hiredHere = 0;
      for (const [roleStr, cap] of Object.entries(roleCaps)) {
        const role = roleStr as RoleId;
        if (typeof cap !== 'number' || cap <= 0) continue;
        let openSlots = cap - (currentByRole[role] ?? 0);
        if (openSlots <= 0) continue;
        const educMin = ROLE_CATALOG[role].educMin;

        // Prefer same zone / neighbor zone, non-calle first (calle reduces hiring chance slightly)
        for (const cand of remainingUnemp) {
          if (openSlots <= 0 || hiredHere >= ECON_CONSTANTS.maxContratacionesPorPeriodo) break;
          if (cand.rol !== 'desempleado' || cand.educacion.nivel < educMin) continue;
          const h = hogarById.get(cand.hogarId);
          if (h?.estado === 'calle' && nextSubRand(state, 'mercado') < 0.35) continue;
          const zoneMatch = cand.zona === f.zona || state.zonas[f.zona]?.vecinas.includes(cand.zona);
          if (!zoneMatch && nextSubRand(state, 'mercado') < 0.5) continue;

          cand.rol = role;
          cand.empleadorId = f.id;
          f.empleados.push(cand.id);
          openSlots--;
          hiredHere++;
        }
      }
    }
  }
}

export function getZoneNamesAvailable(zones: ZoneId[]): ZoneId {
  return zones[0] ?? 'centro';
}
