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
export type PrivateRoleId =
  | 'agricultor'
  | 'obrero'
  | 'comerciante'
  | 'empresario'
  | 'tecnico'
  | 'periodista';
export type RoleGroupId = 'agro' | 'industria' | 'comercio' | 'publico' | 'sin_ingreso';
export type TaxableGroupId = 'agro' | 'industria' | 'comercio' | 'publico';
export type ServiceAreaId = 'salud' | 'seguridad' | 'infraestructura' | 'educacion';

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
      | 'administracion'
      | 'comercio'
      | 'educacion'
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
  | 'resguarda'
  | 'cuida'
  | 'toma'
  | 'vandaliza';

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
    nivel: number; // 0..3
    progreso: number; // 0..100
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
  opcional?: boolean;
  textos: string[];
  disparador?: {
    impago?: boolean;
    descontentosPctMayorA?: number;
    hambreCriticaPctMayorA?: number;
    protestaEnCursoYOrdenMenorA?: number;
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
    fenomenoOOrdenMenorA?: { fenomeno: PhenomenonType; ordenMenorA: number };
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
  causa?: string;
  textoOrigen: 'plantilla' | 'generativo';
  zonaOrigen?: ZoneId;
  fenomenoId?: string;
  esAviso?: boolean;
  vigenteHastaDia?: number;
}

export interface GovernorLevers {
  recaudacion: {
    impuestoGrupo: Record<TaxableGroupId, number>; // 0..60
  };
  gasto: {
    salarioPublico: number; // 50..150 (%)
    presupuesto: Record<ServiceAreaId, number>; // % of disponible
    prensa: number; // % of disponible
    subsidios: Record<RoleGroupId, number>; // % of disponible
  };
  alimento: {
    precioMaximo: number; // 50..250 (% of precioBase; >=250 = sin tope)
    garantiaAlimentaria: number; // 0..100
    intercambio: number; // -100..100
  };
  finanzas: {
    topeEmision: number; // 0..30 (fiscal)
  };
  cupos: Record<PublicRoleId, number>;
}

export type EnterpriseResponseType = 'absorber' | 'recortar_sueldos' | 'despedir' | 'subir_margen';

export interface EnterpriseActiveResponse {
  tipo: EnterpriseResponseType;
  diasRestantes: number;
  duracionTotal: number;
  factorSueldo?: number; // e.g. 0.72 during recortar_sueldos
  margenExtraPct?: number; // e.g. 8 during subir_margen
  origen: string;
  causa?: string;
}

export interface FoodEnterpriseState {
  id: 'alimento';
  dueno: string | null;
  stock: number;
  diasStock: number;
  siloDias: number;
  ingresosAcum: number;
  sueldosAcum: number;
  diasPeriodo: number;
  ultimaGanancia: number;
  ultimoIngresoPeriodo: number;
  ultimoSueldosPeriodo: number;
  respuesta: EnterpriseActiveResponse | null;
}

export interface CommercialEnterpriseState {
  id: string;
  dueno: string | null;
  ingresosAcum: number;
  sueldosAcum: number;
  diasPeriodo: number;
  ultimaGanancia: number;
  ultimoIngresoPeriodo: number;
  ultimoSueldosPeriodo: number;
  respuesta: EnterpriseActiveResponse | null;
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
  integridad: Record<ZoneId, number>;
  coberturas: Record<PublicRoleId | 'comercio', number>;
  palancasVigentes: GovernorLevers;
  palancasObjetivo: GovernorLevers;
  palancasInicioPeriodo: GovernorLevers;
  prensaObjetivo: Record<string, { financiamiento: number; regulacion: number }>;
  prensaInicioPeriodo: Record<string, { financiamiento: number; regulacion: number }>;
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
  disturbiosActivos: boolean;
  semilla: number;
  usarIaGemini: boolean;
}

export interface PendingConditionWindow {
  id: string;
  disparador: 'impago' | 'descontento' | 'hambre' | 'disturbios';
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
      tipo: 'empresa_respuesta';
      zona: ZoneId;
      empresaId: string;
      duenoId?: string | null;
      respuesta: EnterpriseResponseType;
      deficit: number;
      origen: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'palanca';
      zona: ZoneId;
      palanca: string;
      valorAnterior: number;
      valorNuevo: number;
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
    periodoFiscal: number;
    diasEnPeriodoFiscal: number;
  };
  npcs: Npc[];
  gobierno: GovernmentState;
  empresas: {
    alimento: FoodEnterpriseState;
    comerciales: CommercialEnterpriseState[];
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
    disturbios: number;
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
