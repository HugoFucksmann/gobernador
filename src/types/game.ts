export type EconomyModule = 'base' | 'fiscal';

export type RoleId =
  | 'estudiante'
  | 'agricultor'
  | 'obrero'
  | 'policia'
  | 'estatal'
  | 'comerciante'
  | 'empresario'
  | 'tecnico'
  | 'docente'
  | 'periodista'
  | 'medico'
  | 'ingeniero'
  | 'desempleado'
  | 'jubilado';

export type PublicRoleId = 'policia' | 'estatal' | 'docente' | 'medico' | 'ingeniero';
export type ServicePublicRoleId = 'policia' | 'medico' | 'ingeniero';
export type FixedPublicRoleId = 'estatal' | 'docente';

export type PrivateRoleId =
  | 'agricultor'
  | 'obrero'
  | 'comerciante'
  | 'empresario'
  | 'tecnico'
  | 'periodista';
export type RoleGroupId = 'agro' | 'industria' | 'comercio' | 'publico' | 'sin_ingreso';
export type ServiceAreaId = 'seguridad' | 'salud' | 'infraestructura';
export type ServiceLeverId = 'seguridad' | 'salud' | 'obras';
export type ServiceLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type PriceCapMode = 'libre' | 'moderado' | 'estricto';
export type ForeignTradeStep = -100 | -50 | 0 | 50 | 100;

export type PersonalityTrait = 'valentia' | 'laboriosidad' | 'codicia' | 'rebeldia' | 'resiliencia';
export type NpcVariable = 'salud' | 'hambre' | 'miedo' | 'satisfaccion' | 'lealtad';
export type ModifiableKey = PersonalityTrait | NpcVariable | 'productividad' | 'propensionGasto';

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
  produce: Partial<
    Record<
      | 'alimento'
      | 'tecnificacion'
      | 'seguridad'
      | 'comercio'
      | 'informacion'
      | 'salud'
      | 'infraestructura',
      number
    >
  >;
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
  x: number;
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
  causa?: string;
  texto: string;
}

export interface CausalStep {
  id: string;
  dia: number;
  tipo: string;
  titulo: string;
  detalle: string;
  zona?: ZoneId;
  npcId?: string;
}

export type ActionEffectId =
  | 'fuera_de_puesto'
  | 'anima'
  | 'agita'
  | 'acapara'
  | 'moviliza'
  | 'decorativa'
  | 'gasta'
  | 'ahorra'
  | 'comparte'
  | 'difunde'
  | 'repara'
  | 'cuida'
  | 'toma';

export type EffectIntensity = 'baja' | 'media' | 'alta';
export type RumorTheme = 'miedo' | 'descontento' | 'esperanza';

export interface ActionEffectSpec {
  id: ActionEffectId;
  intensidad?: EffectIntensity;
  signo?: 1 | -1;
  alcance?: 'participante' | 'zona';
  temaRumor?: RumorTheme;
}

export interface ActiveNpcAction {
  id: string;
  nombre: string;
  tipo: 'espontanea' | 'condicion';
  efectos: ActionEffectSpec[];
  fueraDePuesto: boolean;
  zonaDestino?: ZoneId;
  diasRestantes: number;
  duracionTotal: number;
  esFoco: boolean;
  focoNpcId?: string;
  focoEventId?: string;
  origen: string;
  causa?: string;
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
  cumpleanosDia: number; // 1..365 seeded birthday
  educacion: {
    nivel: number; // 0..3 fixed at worldgen (v1)
  };
  personalidad: Record<PersonalityTrait, number>;
  variables: Record<NpcVariable, number>;
  economia: {
    ingresoPos: number; // 0..1
    dinero: number;
    ultimoIngresoNeto: number;
    despensa: number; // days of food at home (0..despensaMaxDias)
    propensionGasto: number; // fraction of net income spent on living expenses
    noPudoPagarComida?: boolean;
  };
  rol: RoleId;
  zona: ZoneId;
  hospital: NpcHospitalState;
  ultimoGolpeOrigen?: string;
  ultimoGolpeCausaId?: string;
  mapa: {
    x: number;
    y: number;
    destino: { x: number; y: number };
    accion: string;
  };
  accionIa: ActiveNpcAction | null;
  modificadores: Modifier[];
  vivo: boolean;
}

export type PhenomenonType = 'sequia' | 'plaga' | 'pandemia' | 'plaga_zombie';

export interface ActionDefinition {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'espontanea' | 'condicion';
  textos: string[];
  disparador?: {
    impagoNomina?: boolean;
    descontentosPctMayorA?: number;
    hambreCriticaPctMayorA?: number;
  };
  requisitos: {
    etapa?: 'menor' | 'adulto' | 'jubilado';
    publico?: boolean;
    rolNoEn?: RoleId[];
    conEmpleo?: boolean;
    conDinero?: boolean;
    conDespensa?: boolean;
    conHambre?: boolean;
  };
  contexto?: {
    fenomeno?: PhenomenonType;
    fenomenoAnunciadoOActivo?: PhenomenonType;
    zonaIntegridadMenorA?: number;
    vecinoDespensaBaja?: boolean;
    vecinoSaludBaja?: boolean;
  };
  afinidad: Partial<Record<PersonalityTrait, '+' | '-'>>;
  efectos: ActionEffectSpec[];
  zonaDestino?: ZoneId;
  duracionDias: [number, number];
  contagio: number;
}

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
  afinidadBase: number; // 0..100
  credibilidad: number; // 0..100
  alcancePct: number; // 0..100
  columnistas: string[]; // npc ids
  finanzas: {
    ingresosPropios: number;
    fondosEstado: number;
    dependenciaPct: number;
  };
}

export type NewsTone = 'favorable' | 'neutral' | 'critico' | 'alarmista';

export type NewsTopic =
  | 'aviso'
  | 'clima'
  | 'ataque'
  | 'salud'
  | 'hambre'
  | 'precio'
  | 'impago'
  | 'conflicto'
  | 'empresas'
  | 'gobierno'
  | 'vecinos'
  | 'objetivo';

export type PressValence = 'buena' | 'mala' | 'neutra';

export interface PressFactData {
  zona?: ZoneId;
  fenomeno?: string;
  fenomenoId?: string;
  dias?: number;
  cifra?: string;
  empresa?: string;
  palanca?: string;
  valorAnterior?: string;
  valorNuevo?: string;
  esAviso?: boolean;
  vigenteHastaDia?: number;
}

export interface PressFact {
  id: string;
  dia: number;
  tema: NewsTopic;
  relevancia: number;
  obligatoria?: boolean;
  valencia: PressValence;
  esDelGobierno: boolean;
  zona: ZoneId;
  origen: string;
  causa?: string;
  datos: PressFactData;
}

export interface ClassifierRecord {
  dia: number;
  npcId: string;
  accionId: string;
  tipo: 'espontanea' | 'condicion';
  origen: 'motor' | 'clasificador';
  latenciaMs?: number;
  rechazada?: boolean;
}

export interface NewsArticle {
  id: string;
  dia: number;
  medioId: string;
  medioNombre: string;
  autorId: string;
  autorNombre: string;
  tema: NewsTopic;
  tono: NewsTone;
  alcance: number;
  credibilidad?: number;
  titulo: string;
  texto: string;
  origen: string;
  causa?: string;
  textoOrigen: 'plantilla' | 'generativo';
  zona?: ZoneId;
  zonaOrigen?: ZoneId;
  fenomenoId?: string;
  esAviso?: boolean;
  vigenteHastaDia?: number;
}

export interface GovernorLevers {
  impuesto: number; // 0..60 (%) flat tax on all income
  salarioPublico: number; // 50..150 (%)
  servicios: Record<ServiceLeverId, ServiceLevel>; // 0..5
  ayudaSocial: number; // 0..10 ($/day for desempleado & jubilado)
  garantiaAlimentaria: number; // 0..100 (%)
  precioMaximo: PriceCapMode; // 'libre' | 'moderado' | 'estricto'
  comercioExterior: ForeignTradeStep; // -100 | -50 | 0 | 50 | 100
  prensa: number; // 0..100 ($/period split evenly across outlets)
  topeEmision: number; // 0..30 (% of period income, fiscal only)
}

export type EnterpriseTramo = 'aumento' | 'normal' | 'recorte' | 'despido';

export interface FoodEnterpriseState {
  id: 'alimento';
  dueno: string | null;
  stock: number;
  diasStock: number;
  siloDias: number;
  ventasAcum: number;
  parteSueldos: number;
  factor: number;
  ultimoTramo: EnterpriseTramo;
  despidosPendientes: number;
  refPorEmpleado: Record<string, number>;
  ultimaGanancia: number;
  ultimoIngresoPeriodo: number;
  ultimoSueldosPeriodo: number;
  ultimaCausa?: string;
}

export interface CommercialEnterpriseState {
  id: 'comercio';
  socios: string[]; // living comerciantes
  ventasAcum: number;
  parteSueldos: number;
  factor: number;
  ultimoTramo: EnterpriseTramo;
  despidosPendientes: number;
  refPorEmpleado: Record<string, number>;
  ultimaGanancia: number;
  ultimoIngresoPeriodo: number;
  ultimoSueldosPeriodo: number;
  ultimaCausa?: string;
}

export interface FiscalLedger {
  ingresos: number;
  nomina: number;
  pensiones: number;
  garantiaAlimentaria: number;
  garantiaImpaga: number;
  comidaMenores: number;
  ayudaSocial: number;
  operacion: number;
  prensa: number;
  saldo: number;
  emision: number;
  importaciones: number; // paid directly from reserva
  exportaciones: number; // paid directly to food enterprise
  impago: boolean;
  alcanzaNomina: boolean;
  prorrateoDiscrecional: number;
  prorrateoNomina: number;
  prorrateoPensionGarantia: number;
}

export interface GovernmentState {
  reserva: number;
  inflacion: number;
  finanzas: FiscalLedger;
  acumuladoPeriodo: {
    dias: number;
    impuestos: number;
    nominaPorNpc: Record<string, number>;
    pensionesPorNpc: Record<string, number>;
    ayudaPorNpc: Record<string, number>;
    periodistasPorNpc: Record<string, number>;
    nominaDevengada: number;
    pensionesDevengadas: number;
    ayudaDevengada: number;
    garantiaAlimentaria: number;
    garantiaImpaga: number;
    comidaMenores: number;
    operacion: number;
    operacionPorArea: Record<ServiceAreaId, number>;
    prensa: number;
    importaciones: number;
    exportaciones: number;
  };
  indicadores: Record<ServiceAreaId, number>;
  integridad: Record<ZoneId, number>;
  coberturas: Record<ServicePublicRoleId, number>;
  cuposFijos: Record<FixedPublicRoleId, number>;
  palancasVigentes: GovernorLevers;
  palancasObjetivo: GovernorLevers;
}

export interface EconomyOutput {
  accesoComida: Record<string, number>; // 0..1
  poderAdquisitivo: Record<string, number>; // 0..100
  saldoDiarioEstimado: number;
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
  poblacionPct: number;
  vivos: number;
  bajas: number;
  satisfaccionMedia: number;
  apoyoPct: number;
  descontentosPct: number;
  hambreCriticaPct: number;
  sinDineroPct: number;
  despensaMediaDias: number;
  hospitalOcupacionPct: number;
  camasHospital: number;
  internados: number;
  esperandoCama: number;
  defensa: Record<ZoneId, number>;
  orden: Record<ZoneId, number>;
  amenazaPercibida: Record<ZoneId, number>;
  productividadTotal: number;
  roles: Record<RoleId, number>;
}

export interface ObjectiveCondition {
  metrica: 'apoyoPct' | 'hambreCriticaPct' | 'poblacion' | 'poblacionPct';
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
  cuposFijos: Record<FixedPublicRoleId, number>;
  serviciosIniciales: Record<ServiceLeverId, ServiceLevel>;
  initialLevers: GovernorLevers;
  objetivoCobertura?: Partial<Record<ServicePublicRoleId, number>>;
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
  semilla: number;
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
  causaId?: string;
}

export interface EventLogEntry {
  id: string;
  dia: number;
  categoria: 'caos' | 'condicion' | 'economia' | 'clima' | 'prensa' | 'gobernador' | 'sistema';
  origen: string;
  causa?: string;
  simEventId?: string;
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
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'golpe';
      zona: ZoneId;
      npcId: string;
      dano: number;
      origen?: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'muerte';
      zona: ZoneId;
      npcId: string;
      causa?: string;
      esperandoCama?: boolean;
    }
  | {
      id: string;
      dia: number;
      tipo: 'internacion';
      zona: ZoneId;
      npcId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'alta';
      zona: ZoneId;
      npcId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'accion_inicio';
      zona: ZoneId;
      accion: string;
      npcIds: string[];
      zonaDestino: ZoneId;
      origen?: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'accion_fin';
      zona: ZoneId;
      accion: string;
      npcIds: string[];
      zonaDestino: ZoneId;
      origen?: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'aviso';
      zona: ZoneId;
      fenomeno: string;
      zonaOrigen?: ZoneId;
      diasRestantes: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'reubicacion';
      zona: ZoneId;
      npcs: string[];
      deZona: ZoneId;
      aZona: ZoneId;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'defensa';
      zona: ZoneId;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'orden';
      zona: ZoneId;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'integridad';
      zona: ZoneId;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'fenomeno_inicio';
      zona: ZoneId;
      fenomenoId: string;
      fenomeno: string;
      zonaOrigen?: ZoneId;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'fenomeno_fin';
      zona: ZoneId;
      fenomenoId: string;
      fenomeno: string;
      zonaOrigen?: ZoneId;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'impago';
      zona: ZoneId;
      faltante: number;
      alcanzaNomina: boolean;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'impago_fin';
      zona: ZoneId;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'hospital_saturado';
      zona: ZoneId;
      ocupacionPct: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'noticia';
      zona: ZoneId;
      noticiaId: string;
      medio: string;
      tema: string;
      titulo: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'empresa_aumento';
      zona: ZoneId;
      empresaId: 'alimento' | 'comercio';
      factor: number;
      origen: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'empresa_recorte';
      zona: ZoneId;
      empresaId: 'alimento' | 'comercio';
      factor: number;
      origen: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'empresa_despido';
      zona: ZoneId;
      empresaId: 'alimento' | 'comercio';
      cantidad: number;
      factor: number;
      origen: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'palanca';
      zona: ZoneId;
      palanca: string;
      valorAnterior: number | string;
      valorNuevo: number | string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'victoria';
      zona: ZoneId;
      metrica: string;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'objetivo_perdido';
      zona: ZoneId;
      metrica: string;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'fin_partida';
      zona: ZoneId;
      metrica: string;
      valor: number;
      causa?: string;
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
  semanal?: boolean;
}

export interface GameState {
  versionFormato: number;
  semilla: number;
  rngState: number;
  idSeq: number;
  config: WorldConfig;
  esConfigDePrueba: boolean;
  reloj: {
    tick: number;
    dia: number;
    anio: number;
    periodo: number;
    diasEnPeriodo: number;
  };
  npcs: Npc[];
  gobierno: GovernmentState;
  empresas: {
    alimento: FoodEnterpriseState;
    comercio: CommercialEnterpriseState;
  };
  alimento: {
    stock: number;
    consumoPorNpc: number;
    diasStock: number;
    siloDias: number;
    precio: number;
    precioMercado: number;
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
  ultimaOrdenZona: Record<ZoneId, number>;
  ultimaIntegridadZona: Record<ZoneId, number>;
  fenomenosIniciadosIds: string[];
  avisosEmitidos: string[];
  ultimaCausaPalanca?: string;
  ultimoEventoClimaId?: string;
  ultimoEventoEmpresaId?: string;
  hospitalSaturadoDia?: number;
  auditEntradasDia: number;
  auditSalidasDia: number;
  ultimoDineroTotal?: number;
  precioAyer: number;
  hambreAyerPct: number;
  ultimoSaldoCierre: number;
  colaHechosDia: PressFact[];
  ultimaVariantePorAccion: Record<string, number>;
  clasificadorRegistro: ClassifierRecord[];
  metricasBaseObjetivo: {
    victoriaInicial: number;
    derrotaInicial: number;
  };
  metricasPeriodoAnterior: {
    apoyoPct: number;
    hambreCriticaPct: number;
    poblacion: number;
    satisfaccionMedia: number;
  };
  bitacora: EventLogEntry[];
  historial: HistoryPoint[];
  resultado: {
    estado: 'jugando' | 'victoria' | 'derrota';
    victoriaCumplida?: boolean;
    diaVictoria?: number;
    razon?: string;
    diaFinal?: number;
  };
}
