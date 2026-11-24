export type EconomyModule = 'simple' | 'individual' | 'fiscal';

export type RoleId =
  | 'estudiante'
  | 'agricultor'
  | 'obrero'
  | 'policia'
  | 'estatal'
  | 'comerciante'
  | 'tecnico'
  | 'docente'
  | 'periodista'
  | 'medico'
  | 'ingeniero'
  | 'desempleado'
  | 'jubilado';

export type PublicRoleId = 'policia' | 'estatal' | 'docente' | 'medico' | 'ingeniero';
export type PrivateRoleId = 'agricultor' | 'obrero' | 'comerciante' | 'tecnico' | 'periodista';
export type RoleGroupId = 'agro' | 'industria' | 'comercio' | 'publico' | 'sin_ingreso';
export type TaxableGroupId = 'agro' | 'industria' | 'comercio' | 'publico';
export type ServiceAreaId = 'salud' | 'seguridad' | 'infraestructura' | 'educacion';

export type PersonalityTrait = 'valentia' | 'laboriosidad' | 'codicia' | 'rebeldia' | 'resiliencia';
export type NpcVariable = 'salud' | 'hambre' | 'miedo' | 'satisfaccion' | 'lealtad';
export type ModifiableKey = PersonalityTrait | NpcVariable | 'productividad';

export interface RoleDefinition {
  id: RoleId;
  nombre: string;
  grupo: RoleGroupId;
  edadMin: number;
  edadMax: number | null;
  educMin: number;
  estudia?: boolean;
  publico?: boolean;
  afinidad?: PersonalityTrait;
  produce: Partial<Record<'alimento' | 'seguridad' | 'administracion' | 'comercio' | 'educacion' | 'informacion' | 'salud' | 'infraestructura', number>>;
  ingreso?: [number, number];
  color: string;
  distrito: DistrictId;
}

export type ZoneId = 'centro' | 'norte' | 'este' | 'sur' | 'oeste';

export type DistrictId = 'campos' | 'taller' | 'mercado' | 'civico' | 'residencial';

export interface DistrictZone {
  id: DistrictId;
  nombre: string;
  subtitulo: string;
  x: number; // 0..1000 map coords
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface Modifier {
  id: string;
  afecta: Partial<Record<ModifiableKey, number>>;
  duracionDias: number;
  diasRestantes: number;
  origen: string;
  texto: string;
}

export interface ActiveNpcAction {
  id: string;
  nombre: string;
  tipo: 'espontanea' | 'condicion';
  reemplazaTrabajo: boolean;
  zonaDestino?: ZoneId;
  diasRestantes: number;
  duracionTotal: number;
  origen: string;
  texto: string;
}

export interface NpcHospitalState {
  internado: boolean;
  esperandoCama: boolean;
  diasInternado: number;
}

export interface Npc {
  id: string;
  nombre: string;
  edad: number;
  educacion: {
    nivel: number; // 0..3
    progreso: number; // 0..100
  };
  personalidad: Record<PersonalityTrait, number>;
  variables: Record<NpcVariable, number>;
  economia: {
    ingresoPos: number; // 0..1
    dinero: number;
    ultimoIngresoNeto: number;
  };
  rol: RoleId;
  zona: ZoneId;
  hospital: NpcHospitalState;
  ultimoGolpeOrigen?: string;
  mapa: {
    x: number;
    y: number;
    destino: { x: number; y: number };
    accion: string;
  };
  accionIa: ActiveNpcAction | null;
  modificadores: Modifier[];
  pensamientoCache?: {
    texto: string;
    dia: number;
    fuente: 'ia' | 'plantilla';
  };
  vivo: boolean;
}

export interface ActionDefinition {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'espontanea' | 'condicion';
  textoBase: string;
  disparador?: {
    impago?: boolean;
    descontentosPctMayorA?: number;
    hambreCriticaPctMayorA?: number;
  };
  requisitos: {
    etapa?: 'menor' | 'adulto' | 'jubilado';
    publico?: boolean;
    rolNoEn?: RoleId[];
  };
  afinidad: Partial<Record<PersonalityTrait, '+' | '-'>>;
  efecto: {
    reemplazaTrabajo: boolean;
    zonaDestino?: ZoneId;
    variables?: Partial<Record<ModifiableKey, number>>;
    rumorSocial?: {
      afecta: Partial<Record<ModifiableKey, number>>;
      duracionDias: number;
      radioPct: number;
      texto: string;
    };
  };
  duracionDias: [number, number];
  contagio: number;
}

export type PhenomenonType = 'sequia' | 'plaga' | 'pandemia' | 'plaga_zombie';

export interface ClimatePhenomenon {
  id: string;
  tipo: PhenomenonType;
  nombre: string;
  intensidad: number; // 0..100
  inicioDia: number;
  duracionDias: number;
  avisoDias?: number;
  crecimientoDia?: number;
  origen?: ZoneId;
}

export interface MediaOutlet {
  id: string;
  nombre: string;
  lineaEditorial: {
    afinidadGobierno: number; // 0..100
    sensacionalismo: number; // 0..100
  };
  credibilidad: number; // 0..100
  alcancePct: number; // 0..100
  columnistas: string[]; // npc ids
  finanzas: {
    ingresosPropios: number;
    fondosEstado: number;
    dependenciaPct: number;
  };
  intervencion: {
    financiamiento: number; // share 0..100 summing to 100 across active outlets
    regulacion: number; // 0..100
  };
}

export type NewsTone = 'informativo' | 'alarmista' | 'critico' | 'favorable';

export interface NewsArticle {
  id: string;
  dia: number;
  medioId: string;
  medioNombre: string;
  autorId: string;
  autorNombre: string;
  tema: string;
  tono: NewsTone;
  alcance: number;
  credibilidad?: number;
  titulo: string;
  texto: string;
  origen: string;
  fuente: 'ia' | 'plantilla';
  zonaOrigen?: ZoneId;
  fenomenoId?: string;
  esAviso?: boolean;
  vigenteHastaDia?: number;
}

export interface GovernorLevers {
  recaudacion: {
    impuestoUnico: number; // 0..60 (simple)
    impuestoGrupo: Record<TaxableGroupId, number>; // 0..60 (individual/fiscal)
  };
  gasto: {
    salarioPublico: number; // 50..150 (%)
    presupuesto: Record<ServiceAreaId, number>; // % of disponible
    prensa: number; // % of disponible
    subsidios: Record<RoleGroupId, number>; // % of disponible
  };
  alimento: {
    racion: number; // 50..150 (simple)
    garantiaAlimentaria: number; // 0..100 (individual/fiscal)
    intercambio: number; // -100..100
  };
  finanzas: {
    topeEmision: number; // 0..30 (fiscal)
  };
  cupos: Record<PublicRoleId, number>;
}

export interface FiscalLedger {
  ingresos: number;
  impuestos: number;
  ventasAlimento: number;
  nomina: number;
  pensiones: number;
  garantiaAlimentaria: number;
  comprasAlimento: number;
  disponible: number;
  presupuestoAsignado: number;
  subsidiosAsignados: number;
  prensaAsignada: number;
  aReserva: number;
  deficit: number;
  emision: number;
  impago: boolean;
}

export interface GovernmentState {
  reserva: number;
  inflacion: number;
  finanzas: FiscalLedger;
  acumuladoPeriodo: {
    dias: number;
    impuestos: number;
    ventasAlimento: number;
    nomina: number;
    pensiones: number;
    garantiaAlimentaria: number;
    comprasAlimento: number;
  };
  indicadores: Record<ServiceAreaId, number>;
  coberturas: Record<PublicRoleId | 'comercio', number>;
  palancasVigentes: GovernorLevers;
  palancasObjetivo: GovernorLevers;
  prensaObjetivo: Record<string, { financiamiento: number; regulacion: number }>;
}

export interface EconomyOutput {
  accesoComida: Record<string, number>; // 0..1
  poderAdquisitivo: Record<string, number>; // 0..100
  disponibleDiarioEstimado: number;
  precioAlimento: number;
  inflacion: number;
}

export interface ChaosLimits {
  maxAccionesPorPeriodo: number;
  periodoDias: number;
  maxPctRolFueraDePuesto: number;
  duracionMaxDias: number;
  respiroSiSatisfaccionMediaMenorA: number;
}

export interface CommunityDerived {
  poblacion: number;
  vivos: number;
  bajas: number;
  satisfaccionMedia: number;
  apoyoPct: number;
  descontentosPct: number;
  hambreCriticaPct: number;
  sinDineroPct: number;
  hospitalOcupacionPct: number;
  camasHospital: number;
  internados: number;
  esperandoCama: number;
  defensa: Record<ZoneId, number>;
  amenazaPercibida: Record<ZoneId, number>;
  productividadTotal: number;
  roles: Record<RoleId, number>;
}

export interface ObjectiveCondition {
  metrica: 'apoyoPct' | 'hambreCriticaPct' | 'poblacion';
  op: '>=' | '>' | '<' | '<=';
  umbral: number;
  plazoDia?: number;
  descripcion: string;
}

export interface ScenarioPreset {
  id: 'elecciones' | 'zombies';
  nombre: string;
  subtitulo: string;
  historia: string;
  economiaDefault: EconomyModule;
  poblacionDefault: number;
  mediosDefault: number;
  inflacionInicial: number;
  reservaInicial: number;
  stockAlimentoInicial: number;
  topesPrivados: Record<PrivateRoleId, number>;
  cuposIniciales: Record<PublicRoleId, number>;
  objetivoCobertura?: Partial<Record<PublicRoleId | 'comercio', number>>;
  zonas: Record<ZoneId, { vecinas: ZoneId[] }>;
  zonaPorRol: Record<RoleId, ZoneId[]>;
  victoria: ObjectiveCondition;
  derrota: ObjectiveCondition;
  caosDefault: ChaosLimits;
}

export interface WorldConfig {
  escenarioId: 'elecciones' | 'zombies';
  economiaModulo: EconomyModule;
  cantidadMedios: number; // 1..3
  poblacionInicial: number;
  caos: ChaosLimits;
  usarIaGemini: boolean;
}

export interface PendingConditionWindow {
  id: string;
  disparador: 'impago' | 'descontento' | 'hambre';
  diaInicio: number;
  diaLimite: number;
  intensidadCantidad: number;
  candidatas: ActionDefinition[];
  npcIds: string[];
  estado: 'pendiente' | 'resuelta';
}

export interface EventLogEntry {
  id: string;
  dia: number;
  categoria: 'ia' | 'condicion' | 'economia' | 'clima' | 'prensa' | 'gobernador' | 'sistema';
  origen: string;
  titulo: string;
  detalle: string;
}

export type SimEvent =
  | {
      id: string;
      dia: number;
      tipo: 'ataque';
      zona: ZoneId;
      zonaOrigen?: ZoneId;
      zonaDestino: ZoneId;
      resultado: 'repelido' | 'golpe';
      npcId?: string;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'golpe';
      zona: ZoneId;
      npcId: string;
      dano: number;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'muerte';
      zona: ZoneId;
      npcId: string;
      causa: string;
      esperandoCama?: boolean;
    }
  | {
      id: string;
      dia: number;
      tipo: 'internacion';
      zona: ZoneId;
      npcId: string;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'alta';
      zona: ZoneId;
      npcId: string;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'accion_inicio';
      zona: ZoneId;
      accion: string;
      npcIds: string[];
      zonaDestino: ZoneId;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'accion_fin';
      zona: ZoneId;
      accion: string;
      npcIds: string[];
      zonaDestino: ZoneId;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'aviso';
      zona: ZoneId;
      fenomeno: string;
      diasRestantes: number;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'reubicacion';
      zona: ZoneId;
      npcs: string[];
      deZona: ZoneId;
      aZona: ZoneId;
      causa: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'defensa';
      zona: ZoneId;
      valor: number;
      causa: string;
    };

export interface HistoryPoint {
  dia: number;
  reserva: number;
  inflacion: number;
  satisfaccion: number;
  apoyo: number;
  hambreCritica: number;
  stockDias: number;
  poblacion: number;
}

export interface GameState {
  config: WorldConfig;
  esConfigDePrueba: boolean;
  reloj: {
    tick: number;
    dia: number;
    anio: number;
    periodoFiscal: number;
    diasEnPeriodoFiscal: number;
  };
  npcs: Npc[];
  gobierno: GovernmentState;
  alimento: {
    stock: number;
    consumoPorNpc: number;
    diasStock: number;
    precio: number;
    precioBase: number;
    produccionDiaria: number;
    consumoDiario: number;
  };
  clima: {
    fenomenos: ClimatePhenomenon[];
    proximoEventoDia: number;
  };
  medios: MediaOutlet[];
  noticias: NewsArticle[];
  ultimaSalidaEconomica: EconomyOutput;
  caosTracker: {
    ventanaInicioDia: number;
    accionesEnVentana: number;
    respiroActivo: boolean;
    ultimoIntentoDia: number;
  };
  ventanasCondicion: PendingConditionWindow[];
  cooldownsCondicion: {
    impago: number;
    descontento: number;
    hambre: number;
  };
  eventos: SimEvent[];
  eventosDiaActual: SimEvent[];
  golpesPorZonaHistorial: Record<ZoneId, number[]>;
  ultimaDefensaZona: Record<ZoneId, number>;
  avisosEmitidos: string[];
  bitacora: EventLogEntry[];
  historial: HistoryPoint[];
  resultado: {
    estado: 'jugando' | 'victoria' | 'derrota';
    razon?: string;
    diaFinal?: number;
  };
}
