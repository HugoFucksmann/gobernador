export type ScenarioId = 'elecciones' | 'zombies';

export type EconomyModule = 'base' | 'fiscal';
export type WorldComplexityLevel = 'M0' | 'M1' | 'M2' | 'M3' | 'M4';
export type GovernorComplexityLevel = 'G0' | 'G1' | 'G2' | 'G3';
export type PriceCapMode = 'libre' | 'moderado' | 'estricto';
export type ForeignTradeStep = -100 | -50 | 0 | 50 | 100;
export type ServiceLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type EnterpriseTramo = 'aumento' | 'normal' | 'recorte' | 'despido';
export type DemandId =
  | 'bajen_impuestos'
  | 'liberen_precio'
  | 'abran_exportacion'
  | 'mas_pauta'
  | 'silencio_pagado'
  | 'sindicato_salarios'
  | 'vecinos_comida'
  | 'vecinos_obras';

export type ZoneId = string;

export type ZoneCharacter = 'centro' | 'comercial' | 'residencial' | 'agricola' | 'industrial';
export type ZoneState = 'activa' | 'no_urbanizada';

export type ViaTipo = 'calle' | 'camino' | 'puente';

export type LotClass = 'S' | 'M' | 'L' | 'XL';
export type TerrenoTile = '.' | '%' | '~' | '^';
export type FranjaDiaId = 'noche' | 'manana' | 'mediodia' | 'tarde' | 'anochecer';

export interface NpcAgendaSlot {
  franja: FranjaDiaId;
  horario: string;
  actividad: string;
  destinoTipo: 'casa' | 'trabajo' | 'parcela' | 'zona' | 'hospital';
  zona: ZoneId;
  parcelaId?: string;
  wx?: number;
  wy?: number;
}

export interface MapaV2Grid {
  version: 1;
  ancho: number;
  alto: number;
  terreno: string[];
  altura?: string[];
  vias: string[];
  zonas: string[];
  sueloUtilPct?: number;
  zonas_info: Record<
    string,
    {
      id: ZoneId;
      codigo: string;
      nombre: string;
      estado: ZoneState;
      nodoPrincipal: string;
    }
  >;
}

export interface ViaTramo {
  id: string;
  nombre: string;
  tipo: ViaTipo;
  nodoA: string;
  nodoB: string;
  zonaA: ZoneId;
  zonaB?: ZoneId;
  longitud: number;
  estado: number; // 0-100
  construida: boolean;
  enObra: boolean;
  diasObraTotal: number;
  diasObraRestantes: number;
  costoObra: number;
  mantenimientoPeriodo: number;
  parcelasAbiertas: string[];
  zonaAbierta?: ZoneId;
  barreraNatural?: boolean;
  puntos?: Array<{ wx: number; wy: number }>;
  baldosas?: Array<[number, number]>;
}

export interface ZoneDefinition {
  id: ZoneId;
  nombre: string;
  caracter: ZoneCharacter;
  estado?: ZoneState;
  viaAperturaId?: string;
  nodoPrincipal?: string;
  barreraNatural?: boolean;
  vecinas: ZoneId[];
  demandaAlquilerIndice: number;
  rect: { wx: number; wy: number; ww: number; wh: number };
}

export type DistrictId = 'campos' | 'taller' | 'mercado' | 'civico' | 'residencial';

export type PersonalityTrait =
  | 'valentia'
  | 'laboriosidad'
  | 'codicia'
  | 'rebeldia'
  | 'resiliencia'
  | 'sociabilidad';

export type NpcVariable =
  | 'salud'
  | 'hambre'
  | 'miedo'
  | 'satisfaccion'
  | 'lealtad';

export type ModifiableKey =
  | PersonalityTrait
  | NpcVariable
  | 'productividad'
  | 'propensionGasto'
  | 'propensionEmprender';

export type PrivateRoleId =
  | 'agricultor'
  | 'obrero'
  | 'comerciante'
  | 'empresario'
  | 'tecnico'
  | 'periodista'
  | 'constructor'
  | 'inmobiliario';

export type PublicRoleId =
  | 'policia'
  | 'estatal'
  | 'docente'
  | 'medico'
  | 'ingeniero';

export type FixedPublicRoleId = 'estatal' | 'docente';
export type ServicePublicRoleId = 'policia' | 'medico' | 'ingeniero';
export type ServiceAreaId = 'seguridad' | 'salud' | 'infraestructura';

export type NonWorkingRoleId = 'estudiante' | 'desempleado' | 'jubilado';

export type RoleId = PrivateRoleId | PublicRoleId | NonWorkingRoleId;

export type SpendCategory = 'bienes' | 'gastronomia' | 'servicios' | 'entretenimiento';

export interface RoleDefinition {
  id: RoleId;
  nombre: string;
  color: string;
  edadMin: number;
  edadMax: number | null;
  educMin: number;
  afinidad: PersonalityTrait | null;
  publico: boolean;
  estudia?: boolean;
  gerencia?: boolean;
  rubro?: string;
  grupo: 'privado' | 'publico' | 'sin_ingreso';
  ingreso: [number, number] | null;
  produce: string | null;
}

export type ParcelTipo =
  | 'residencial'
  | 'comercial'
  | 'industrial'
  | 'agricola'
  | 'publica'
  | 'especial';

export type HouseType = 'casa_chica' | 'casa_mediana' | 'casa_grande';

export type PrivateLocalBuildingType =
  | 'campo'
  | 'fabrica'
  | 'almacen'
  | 'supermercado'
  | 'tienda'
  | 'kiosco'
  | 'restoran'
  | 'bar_cafe'
  | 'peluqueria'
  | 'taller'
  | 'gimnasio'
  | 'cine_teatro'
  | 'club'
  | 'oficina_constructora'
  | 'oficina_inmobiliaria'
  | 'oficina_medio';

export type PublicBuildingType =
  | 'hospital'
  | 'comisaria'
  | 'escuela'
  | 'universidad'
  | 'oficina_publica'
  | 'muralla'
  | 'silo'
  | 'riego'
  | 'hospital_campana';

export type SpecialBuildingType = 'plaza' | 'puerto' | 'muelle_comercio';

export type BuildingType =
  | HouseType
  | PrivateLocalBuildingType
  | PublicBuildingType
  | SpecialBuildingType;

export type BuildingOwner = 'estado' | 'alimento' | 'comercio' | string;
export type ParcelState = 'sin_calle' | 'libre' | 'en_obra' | 'ocupada';

export type OwnerRef = {
  tipo: 'hogar' | 'npc' | 'firma' | 'estado';
  id: string;
};

export interface BuildingDefinition {
  tipo: BuildingType;
  nombre: string;
  parcelTipo: ParcelTipo;
  claseMinima: LotClass;
  categoria: 'vivienda' | 'privado' | 'publico' | 'suceso' | 'especial';
  rubro?: FirmRubro;
  categoriaGasto?: SpendCategory;
  vendeComida?: boolean;
  margenAjustePct?: number;
  construibleGobernador: boolean;
  requiereG2: boolean;
  costoObra: number;
  mantenimientoPeriodo: number;
  diasObra: number;
  capacidadCasa?: number;
  alquilerBase?: number;
  capacidadVentasDiaria?: number;
  areaServicio?: ServiceAreaId;
  puestos: Partial<Record<RoleId, number>>;
  camasHospital?: number;
  lugaresEstudio?: number;
  bonusDefensa?: number;
  defensaMuralla?: number;
  siloExtraDias?: number;
  reduccionSequiaPct?: number;
  diasCampana?: number;
}

export interface BuildingInstance {
  id: string;
  tipo: BuildingType;
  parcelaId: string;
  dueno: BuildingOwner;
  duenoRef?: OwnerRef;
  firmaId?: string;
  casaId?: string;
  estado: 'en_obra' | 'ocupada';
  activo: boolean;
  estadoSalud: number; // 0-100
  diasObraRestantes: number;
  diasObraTotal: number;
  diasRestantesCampana?: number;
  ventasHoy?: number;
  zona: ZoneId;
}

export interface Parcela {
  id: string;
  nombre: string;
  zona: ZoneId;
  distrito: DistrictId;
  tipoParcela: ParcelTipo;
  clase?: LotClass;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  frente?: [number, number];
  orden: number;
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  estado: ParcelState;
  tramoAperturaId?: string;
  nodoAcceso?: string;
  edificio: BuildingInstance | null;
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

export type ActionEffectId =
  | 'fuera_de_puesto'
  | 'moviliza'
  | 'anima'
  | 'agita'
  | 'acapara'
  | 'comparte'
  | 'cuida'
  | 'gasta'
  | 'ahorra'
  | 'repara'
  | 'toma'
  | 'difunde'
  | 'decorativa'
  | 'ocupa'
  | 'boicotea'
  | 'emprendedor';

export interface ActionEffectSpec {
  id: ActionEffectId;
  intensidad?: 'baja' | 'media' | 'alta';
  alcance?: 'persona' | 'hogar' | 'zona';
  signo?: 1 | -1;
  temaRumor?: 'miedo' | 'esperanza' | 'descontento';
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
  firmaObjetivoId?: string;
  casaObjetivoId?: string;
  origen: string;
  causa?: string;
  texto: string;
}

export interface NpcRitmo {
  cronotipo: number; // -2 a +2 horas
  gustos: Record<SpendCategory, number>; // pesos suman ~100
  habitos: string[]; // 2-3 parcelaIds de ocio/compras habituales
  turno: number; // 0 | 1 | 2 según rubro
  diasDescanso: number[]; // días de semana (0-6)
  faltandoHoy?: boolean;
  llegadaRetrasoHoras?: number;
  libreHoyActividad?: 'casa' | 'ocio' | 'compras' | 'visita' | 'pasear';
  libreHoyParcelaId?: string;
  visitaHoyId?: string;
}

export interface NpcCapacitacion {
  rolObjetivo: RoleId;
  educObjetivo: number;
  periodosRestantes: number;
  diasRestantes: number;
}

export interface Npc {
  id: string;
  nombre: string;
  apellido: string;
  edad: number;
  cumpleanosDia: number;
  hogarId: string;
  parejaId: string | null;
  padresIds: string[];
  rol: RoleId;
  empleadorId: string | null;
  partes: Array<{ firmaId: string; pct: number }>;
  zona: ZoneId;
  vivo: boolean;
  educacion: {
    nivel: number;
    estudiando: boolean;
  };
  personalidad: Record<PersonalityTrait, number>;
  variables: Record<NpcVariable, number>;
  economia: {
    ingresoPos: number;
    propensionGasto: number;
    propensionEmprender: number;
    ultimoIngresoNeto: number;
  };
  ritmo: NpcRitmo;
  capacitacion?: NpcCapacitacion | null;
  hospital: {
    internado: boolean;
    esperandoCama: boolean;
    diasInternado: number;
    edificioId?: string;
    zonaHospital?: ZoneId;
  };
  accionIa: ActiveNpcAction | null;
  modificadores: Modifier[];
  ultimoGolpeOrigen?: string;
  ultimoGolpeCausaId?: string;
  ultimaPerdidaFamiliarDia?: number;
  commuteBaldosas?: number;
  commutePenalty?: number;
  extra?: Record<string, number | string | boolean>;
  mapa: {
    x: number;
    y: number;
    destino: { x: number; y: number };
    accion: string;
    ruta?: Array<{ x: number; y: number }>;
    zonaDestino?: ZoneId;
    parcelaDestinoId?: string;
    franja?: FranjaDiaId;
  };
}

export interface Hogar {
  id: string;
  miembros: string[];
  adultoIds?: string[];
  esAcogida?: boolean;
  casaId: string | null;
  dinero: number;
  despensa: number;
  estado: 'con_casa' | 'calle' | 'acogida';
  periodosSinPagar: number;
  periodosHacinado: number;
  zona: ZoneId;
  ultimoIngresoNeto: number;
  alquilerPagadoPeriodo: number;
  noPudoPagarComida?: boolean;
  ocupandoCasaId?: string | null;
  periodosEnCalle?: number;
  periodosDescontento?: number;
  creditoDeuda?: number;
}

export interface Casa {
  id: string;
  tipo: HouseType;
  parcelaId: string;
  zona: ZoneId;
  capacidad: number;
  estado: number; // 0-100
  dueno: OwnerRef;
  alquiler: number;
  hogarId: string | null;
  ocupadaPorAccion?: boolean;
  diasVaciaSinMantenimiento: number;
  alquilerCobradoPeriodo: number;
}

export type FirmRubro =
  | 'agro'
  | 'industria'
  | 'comercio'
  | 'gastronomia'
  | 'servicios'
  | 'entretenimiento'
  | 'construccion'
  | 'inmobiliaria'
  | 'medio';

export interface FirmPart {
  tipo: 'npc' | 'hogar' | 'firma' | 'estado';
  id: string;
  pct: number;
}

export interface Firma {
  id: string;
  rubro: FirmRubro;
  nombre: string;
  zona: ZoneId;
  activa: boolean;
  partes: FirmPart[];
  gerenteId: string | null;
  locales: string[];
  empleados: string[];
  ventas: number;
  caja: number;
  parteSueldos: number;
  factor: number;
  cuotaZona: Record<ZoneId, number>;
  margenPoder: number;
  stock?: number;
  stockBienes?: number;
  capacidadDiaria?: number;
  siloDias?: number;
  periodosEnPerdida: number;
  periodosSinDueno: number;
  periodosFactorAlto: number;
  periodosFactorBajo: number;
  ultimoTramo: EnterpriseTramo;
  despidosPendientes: number;
  refPorEmpleado: Record<string, number>;
  ultimoIngresoPeriodo: number;
  ultimoSueldosPeriodo: number;
  ultimaGanancia: number;
  historialGanancias: number[];
  ultimaCausa?: string;
  esFilialDe?: string | null;
  creditoDeuda?: number;
}

export type ClimatePhenomenonType = 'sequia' | 'plaga' | 'pandemia';
export type PhenomenonType = ClimatePhenomenonType | 'plaga_zombie';

export interface ClimatePhenomenon {
  id: string;
  tipo: PhenomenonType;
  nombre: string;
  intensidad: number;
  inicioDia: number;
  duracionDias: number;
  avisoDias?: number;
  origen?: ZoneId;
  crecimientoDia?: number;
}

export interface ClimateState {
  fenomenos: ClimatePhenomenon[];
  proximoEventoDia: number;
}

export interface MediaOutlet {
  id: string;
  firmaId?: string;
  nombre: string;
  zona?: ZoneId;
  activa?: boolean;
  duenoNpcIds: string[];
  columnistas: string[];
  alcancePct: number;
  credibilidad: number;
  afinidadBase: number;
  lineaEditorial: {
    afinidadGobierno: number;
    sensacionalismo: number;
  };
  ingresos: {
    publicidad: number;
    fondosEstado: number;
    dependenciaPct: number;
  };
  finanzas: {
    ingresosPropios: number;
    fondosEstado: number;
    dependenciaPct: number;
  };
  caja: number;
  periodosEnPerdida: number;
}

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
  | 'obras'
  | 'presiones'
  | 'vecinos'
  | 'objetivo'
  | 'vivienda'
  | 'firmas'
  | 'demografia'
  | 'familia';

export type NewsTone = 'neutral' | 'alarmista' | 'critico' | 'favorable';
export type PressValence = 'buena' | 'mala' | 'neutra';

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
  datos: {
    zona?: ZoneId;
    fenomeno?: string;
    fenomenoId?: string;
    dias?: number;
    cifra?: string;
    empresa?: string;
    firma?: string;
    dueno?: string;
    persona?: string;
    hogar?: string;
    familia?: string;
    control?: string;
    palanca?: string;
    valorAnterior?: string;
    valorNuevo?: string;
    edificio?: string;
    parcela?: string;
    tramo?: string;
    tipoVia?: string;
    rubro?: string;
    actor?: string;
    demanda?: string;
    medida?: string;
    esAviso?: boolean;
    vigenteHastaDia?: number;
  };
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
  credibilidad: number;
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
  impuesto: number;
  salarioPublico: number;
  nivelObras: ServiceLevel;
  ayudaSocial: number;
  garantiaAlimentaria: number;
  precioMaximo: PriceCapMode;
  comercioExterior: ForeignTradeStep;
  prensa: number;
  topeEmision: number;
}

export type LeverKey = keyof GovernorLevers;

export interface LeverLock {
  palanca: LeverKey;
  actorId: string;
  actorNombre: string;
  demandaId: DemandId;
  hastaDia: number;
  motivo: string;
}

export interface ActiveDemand {
  id: string;
  actorId: string;
  actorNombre: string;
  demandaId: DemandId;
  titulo: string;
  razon: string;
  amenaza: string;
  pedido: {
    palanca: LeverKey;
    nuevoValor: number | string;
    etiqueta: string;
  };
  diaCreada: number;
  diasRestantes: number;
  diasCompromiso: number;
  causaId?: string;
}

export interface ActorMeasure {
  id: string;
  actorId: string;
  actorNombre: string;
  tipo: 'retencion_stock' | 'despido_forzado' | 'sin_inversion' | 'campana';
  descripcion: string;
  hastaDia: number;
  empresaId?: 'alimento' | 'comercio' | string;
  medioId?: string;
  tema?: NewsTopic;
  tono?: NewsTone;
  causaId?: string;
}

export interface GovernmentState {
  reserva: number;
  inflacion: number;
  cuposFijos: Record<FixedPublicRoleId, number>;
  indicadores: {
    seguridad: number;
    salud: number;
    infraestructura: number;
  };
  coberturas: {
    policia: number;
    medico: number;
    ingeniero: number;
  };
  integridad: Record<ZoneId, number>;
  palancasVigentes: GovernorLevers;
  palancasObjetivo: GovernorLevers;
  extras?: {
    vigentes: { subsidioAlimento: number; presion: number; acceso: number; nivelEducacion: number };
    objetivo: { subsidioAlimento: number; presion: number; acceso: number; nivelEducacion: number };
  };
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
    acogidaMenores: number;
    mantenimiento: number;
    mantenimientoVias?: number;
    operacionObras: number;
    operacion: number;
    obras: number;
    operacionPorArea: Record<ServiceAreaId, number>;
    prensa: number;
    subsidios?: number;
    importaciones: number;
    exportaciones: number;
  };
  finanzas: {
    ingresos: number;
    nomina: number;
    pensiones: number;
    garantiaAlimentaria: number;
    garantiaImpaga: number;
    comidaMenores: number;
    acogidaMenores: number;
    ayudaSocial: number;
    mantenimiento: number;
    mantenimientoVias?: number;
    mantenimientoEdificios?: number;
    operacionObras: number;
    operacion: number;
    obras: number;
    prensa: number;
    subsidios?: number;
    saldo: number;
    emision: number;
    importaciones: number;
    exportaciones: number;
    impago: boolean;
    alcanzaNomina: boolean;
    prorrateoDiscrecional: number;
    prorrateoNomina: number;
    prorrateoPensionGarantia: number;
  };
}

export interface HistoryPoint {
  dia: number;
  reserva: number;
  inflacion: number;
  satisfaccion: number;
  apoyo: number;
  hambreCritica: number;
  stockDias: number;
  poblacion: number;
  callePct: number;
  edadMedia: number;
  cuotaMayorPct: number;
  semanal?: boolean;
}

export interface ActionDefinition {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'espontanea' | 'condicion';
  requisitos: {
    etapa?: 'adulto' | 'jubilado' | 'menor';
    publico?: boolean;
    conEmpleo?: boolean;
    conDinero?: boolean;
    conDespensa?: boolean;
    conHambre?: boolean;
    conCasa?: boolean;
    sinCasa?: boolean;
    conHogarGrande?: boolean;
    conJubiladoEnHogar?: boolean;
    casaEnMalEstado?: boolean;
    rolNoEn?: RoleId[];
  };
  contexto?: {
    fenomeno?: PhenomenonType;
    fenomenoAnunciadoOActivo?: PhenomenonType;
    zonaIntegridadMenorA?: number;
    vecinoDespensaBaja?: boolean;
    vecinoSaludBaja?: boolean;
    vecinoEnCalle?: boolean;
    firmaEnRecorte?: boolean;
  };
  afinidad: Partial<Record<PersonalityTrait, '+' | '-'>>;
  efectos: ActionEffectSpec[];
  duracionDias: [number, number];
  contagio: number;
  zonaDestino?: ZoneId;
  textos: string[];
}

export type ConditionTriggerType =
  | 'impago'
  | 'descontento'
  | 'hambre'
  | 'paro_firma'
  | 'ocupacion'
  | 'boicot';

export interface ConditionWindow {
  id: string;
  disparador: ConditionTriggerType;
  diaInicio: number;
  diaLimite: number;
  intensidadCantidad: number;
  candidatas: ActionDefinition[];
  npcIds: string[];
  firmaObjetivoId?: string;
  estado: 'pendiente' | 'resuelta';
  causaId?: string;
}

export interface ClassifierRecord {
  dia: number;
  npcId: string;
  accionId: string;
  tipo: 'espontanea' | 'condicion';
  origen: 'clasificador' | 'motor';
  latenciaMs?: number;
  rechazada?: boolean;
}

export interface ChaosSettings {
  maxAccionesPorPeriodo: number;
  periodoDias: number;
  maxPctRolFueraDePuesto: number;
  duracionMaxDias: number;
  respiroSiSatisfaccionMediaMenorA: number;
}

export interface WorldConfig {
  escenarioId: ScenarioId;
  economiaModulo: EconomyModule;
  nivelMundo: WorldComplexityLevel;
  nivelGobernador?: GovernorComplexityLevel;
  estadoAutomatico?: boolean;
  cantidadMedios: number;
  poblacionInicial: number;
  caos: ChaosSettings;
  semilla: number;
  usarIaGemini: boolean;
  lecturaActiva?: boolean;
}

export interface ObjectiveCondition {
  metrica: 'apoyoPct' | 'hambreCriticaPct' | 'poblacionPct' | 'poblacion';
  op: '>=' | '>' | '<' | '<=';
  umbral: number;
  plazoDia?: number;
  descripcion: string;
}

export type HitoMetric =
  | 'satisfaccionMedia'
  | 'apoyoPct'
  | 'desempleoPct'
  | 'hambreCriticaPct'
  | 'poblacionPct'
  | 'ingresosEstado';

export interface HitoDefinition {
  id: string;
  nombre: string;
  descripcion: string;
  parcelaId: string;
  condicion: {
    metrica: HitoMetric;
    op: '>=' | '<=';
    umbral: number;
  };
}

export interface ScenarioParcelDef {
  id: string;
  nombre: string;
  zona: ZoneId;
  distrito: DistrictId;
  tipoParcela?: ParcelTipo;
  clase?: LotClass;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  frente?: [number, number];
  orden: number;
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  estadoInicial: ParcelState;
  tramoAperturaId?: string;
  nodoAcceso?: string;
  edificioInicial?: BuildingType;
  duenoInicial?: BuildingOwner;
  houseType?: HouseType;
}

export interface ScenarioPreset {
  id: ScenarioId;
  nombre: string;
  subtitulo: string;
  historia: string;
  poblacionDefault: number;
  mediosDefault: number;
  reservaInicial: number;
  stockAlimentoInicial: number;
  inflacionInicial: number;
  proporciones: Record<RoleId, number>;
  topesPrivados: Record<string, number>;
  cuposFijos: Record<FixedPublicRoleId, number>;
  nivelObrasInicial: ServiceLevel;
  parcelas: ScenarioParcelDef[];
  hitos: HitoDefinition[];
  zonaPorRol: Record<RoleId, ZoneId[]>;
  zonas: Record<ZoneId, ZoneDefinition>;
  tramos?: ViaTramo[];
  mapaGrid?: MapaV2Grid;
  mediosCatalog: Array<{
    id: string;
    nombre: string;
    afinidadGobierno: number;
    sensacionalismo: number;
    credibilidad: number;
    alcancePct: number;
    ingresosPropios: number;
  }>;
  caosDefault: ChaosSettings;
  initialLevers: GovernorLevers;
  fenomenosIniciales: ClimatePhenomenon[];
  proximoEventoDiaInicial: number;
  victoria: ObjectiveCondition;
  derrota: ObjectiveCondition;
  derrotasExtra?: ObjectiveCondition[];
}

export interface EventLogEntry {
  id: string;
  dia: number;
  categoria: 'sistema' | 'gobernador' | 'economia' | 'clima' | 'caos' | 'prensa';
  origen: string;
  causa?: string;
  simEventId?: string;
  titulo: string;
  detalle: string;
}

export type SimEvent = (
  | {
      id: string;
      dia: number;
      tipo: 'control';
      zona: ZoneId;
      control: string;
      palanca?: string;
      valorAnterior: number | string;
      valorNuevo: number | string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'fenomeno_inicio' | 'fenomeno_fin';
      zona: ZoneId;
      fenomenoId: string;
      fenomeno: string;
      zonaOrigen?: ZoneId;
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
      tipo: 'ataque';
      zona: ZoneId;
      zonaOrigen?: ZoneId;
      zonaDestino?: ZoneId;
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
      esperandoCama?: boolean;
      esNatural?: boolean;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'internacion' | 'alta';
      zona: ZoneId;
      npcId: string;
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
      tipo: 'empresa_aumento' | 'empresa_recorte';
      zona: ZoneId;
      empresaId: string;
      factor: number;
      origen: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'empresa_despido';
      zona: ZoneId;
      empresaId: string;
      cantidad: number;
      factor: number;
      origen: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'noticia';
      zona: ZoneId;
      medio: string;
      tema: NewsTopic;
      tono: NewsTone;
      titulo: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'accion_inicio' | 'accion_fin';
      zona: ZoneId;
      accion: string;
      npcIds: string[];
      zonaDestino: ZoneId;
      origen: string;
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
      tipo: 'defensa' | 'orden' | 'integridad';
      zona: ZoneId;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'victoria' | 'objetivo_perdido' | 'fin_partida';
      zona: ZoneId;
      metrica: string;
      valor: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'obra_inicio' | 'obra_fin';
      zona: ZoneId;
      parcelaId: string;
      edificio: BuildingType;
      dueno: BuildingOwner;
      costo?: number;
      diasObra?: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'demolicion';
      zona: ZoneId;
      parcelaId: string;
      edificio: BuildingType;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'hito';
      zona: ZoneId;
      hitoId: string;
      nombre: string;
      parcelaId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'demanda';
      zona: ZoneId;
      actorId: string;
      demandaId: DemandId;
      diasRespuesta: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'demanda_aceptada';
      zona: ZoneId;
      actorId: string;
      demandaId: DemandId;
      palanca: LeverKey;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'demanda_rechazada';
      zona: ZoneId;
      actorId: string;
      demandaId: DemandId;
      porVencimiento: boolean;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'medida';
      zona: ZoneId;
      actorId: string;
      medida: ActorMeasure['tipo'];
      hastaDia: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'contraoferta';
      zona: ZoneId;
      actorId: string;
      demandaId: DemandId;
      aceptada: boolean;
      palanca: LeverKey;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'agregado';
      zona: ZoneId;
      conteos: Record<string, number>;
      causa?: string;
    }
  // --- V2 Events (CONTROLES_V2 §5) ---
  | {
      id: string;
      dia: number;
      tipo: 'nacimiento';
      zona: ZoneId;
      npcId: string;
      hogarId: string;
      padresIds: string[];
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'pareja';
      zona: ZoneId;
      npcIds: string[];
      hogarNuevoId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'separacion';
      zona: ZoneId;
      npcIds: string[];
      hogarIds: string[];
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'hogar_nuevo';
      zona: ZoneId;
      hogarId: string;
      miembros: string[];
      motivo: 'independizacion' | 'pareja' | 'hacinamiento' | 'separacion';
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'hogar_disuelto';
      zona: ZoneId;
      hogarId: string;
      herederos: string[];
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'herencia';
      zona: ZoneId;
      deNpcId: string;
      aIds: string[];
      dinero: number;
      partes: Array<{ firmaId: string; pct: number }>;
      casaId?: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'mudanza';
      zona: ZoneId;
      hogarId: string;
      deCasaId: string | null;
      aCasaId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'desalojo';
      zona: ZoneId;
      hogarId: string;
      casaId: string;
      periodosSinPagar: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'calle_inicio' | 'calle_fin';
      zona: ZoneId;
      hogarId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'casa_construida';
      zona: ZoneId;
      parcelaId: string;
      casaId: string;
      dueno: OwnerRef;
      tipoCasa: HouseType;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'casa_estado';
      zona: ZoneId;
      casaId: string;
      estado: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'firma_fundada';
      zona: ZoneId;
      firmaId: string;
      rubro: FirmRubro;
      duenoId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'firma_compra';
      zona: ZoneId;
      compradorId: string;
      firmaId: string;
      precio: number;
      modo: 'absorcion' | 'filial';
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'firma_quiebra';
      zona: ZoneId;
      firmaId: string;
      cantidadDespedidos: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'monopolio';
      zona: ZoneId;
      rubro: FirmRubro;
      firmaId: string;
      cuota: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'medio_cambio_linea';
      zona: ZoneId;
      medioId: string;
      lineaAnterior: { afinidadGobierno: number; sensacionalismo: number };
      lineaNueva: { afinidadGobierno: number; sensacionalismo: number };
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'medio_cierre';
      zona: ZoneId;
      medioId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'via_inicio' | 'via_fin';
      zona: ZoneId;
      tramoId: string;
      tramoNombre: string;
      tipoVia: ViaTipo;
      parcelasAbiertas: string[];
      costo?: number;
      diasObra?: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'via_estado';
      zona: ZoneId;
      tramoId: string;
      estado: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'ruta_cortada';
      zona: ZoneId;
      tramoId: string;
      parcelasAisladas: string[];
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'zona_abierta';
      zona: ZoneId;
      viaId: string;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'migracion_llegada';
      zona: ZoneId;
      hogarId: string;
      cantidad: number;
      dinero: number;
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'migracion_salida';
      zona: ZoneId;
      hogarId: string;
      cantidad: number;
      dinero: number;
      motivo: 'calle' | 'descontento';
      causa?: string;
    }
  | {
      id: string;
      dia: number;
      tipo: 'capacitacion_inicio' | 'capacitacion_fin';
      zona: ZoneId;
      npcId: string;
      rolObjetivo: RoleId;
      educNivel: number;
      costo?: number;
      causa?: string;
    }
) & { notable?: boolean };

export interface CausalStep {
  id: string;
  dia: number;
  tipo: string;
  zona?: ZoneId;
  npcId?: string;
  titulo: string;
  detalle: string;
}

export interface EconomyOutput {
  accesoComida: Record<string, number>;
  poderAdquisitivo: Record<string, number>;
  precioAlimento: Record<ZoneId, number>;
  alquilerMedio: Record<ZoneId, number>;
  cuotaMercado: Record<string, { firma: string; cuota: number }>;
  saldoDiarioEstimado: number;
  inflacion: number;
  precioGlobal: number;
  gastoVidaPorCategoria?: Record<SpendCategory, number>;
  bienesImportadosDia?: number;
  industriaExportDia?: number;
}

export interface SubsystemRngState {
  terreno: number;
  clima: number;
  caos: number;
  vida: number;
  mercado: number;
  prensa: number;
  ritmo: number;
}

export type LecturaIndicadorId =
  | 'poblacion'
  | 'vivienda'
  | 'comida'
  | 'empleo'
  | 'estado'
  | 'animo'
  | 'orden';

export type LecturaEstado = 'bien' | 'atencion' | 'mal';

export interface LecturaTexto {
  clave: string;
  params: Record<string, string | number>;
}

export interface LecturaCausaTop {
  causa: string;
  peso: number;
  eventoRaizId: string;
}

export interface LecturaIndicador {
  id: LecturaIndicadorId;
  valor: number;
  referencia: number;
  estado: LecturaEstado;
  tendencia: {
    dir: -1 | 0 | 1;
    magnitud: number;
  };
  serie: number[];
  seriePeriodos?: Array<{ periodo: number; valor: number }>;
  serieAnios?: Array<{ anio: number; valor: number }>;
  seriesPorZona: Record<ZoneId, number[]>;
  causasTop: LecturaCausaTop[];
  texto: LecturaTexto;
}

export interface LecturaAlerta {
  id: string;
  severidad: 1 | 2 | 3;
  indicador: LecturaIndicadorId;
  entidad: string;
  causa?: string;
  dia: number;
  activa: boolean;
  texto: LecturaTexto;
}

export interface LecturaNotable {
  npcId: string;
  nombre: string;
  tipo: 'empresario' | 'medio';
  motivo: string;
  peso: number;
  diaIngreso: number;
  zona: ZoneId;
  firmaId?: string;
  medioId?: string;
}

export interface LecturaInterlocutor {
  npcId: string;
  tipo: 'empresario' | 'medio';
  posturaHaciaEstado: number; // -100 a 100
  intereses: string[];
  pedidos: Array<Record<string, unknown>>;
}

export interface LecturaInformeCambio {
  indicador: LecturaIndicadorId;
  antes: number;
  despues: number;
  estadoAntes: LecturaEstado;
  estadoDespues: LecturaEstado;
  causaPrincipal?: string;
  eventoRaizId?: string;
  entidades: string[];
  texto: LecturaTexto;
}

export interface LecturaInforme {
  periodo: number;
  dia: number;
  cambios: LecturaInformeCambio[];
  hechosNotables: Array<{
    eventoId: string;
    dia: number;
    tipo: string;
    npcId?: string;
    zona: ZoneId;
    texto: LecturaTexto;
  }>;
}

export interface LecturaState {
  indicadores: Record<LecturaIndicadorId, LecturaIndicador>;
  ordenIndicadores: LecturaIndicadorId[];
  alertas: LecturaAlerta[];
  ultimoAlertaDiaPorClave: Record<string, number>;
  rachasTendenciaMala: Record<LecturaIndicadorId, number>;
  notables: LecturaNotable[];
  informes: LecturaInforme[];
  ultimoDiaActualizado: number;
  ultimoPeriodoActualizado: number;
}

export interface GameState {
  versionFormato: number;
  semilla: number;
  config: WorldConfig;
  devMode?: boolean;
  rngState: number;
  rng: SubsystemRngState;
  idSeq: number;
  reloj: {
    dia: number;
    anio: number;
    periodo: number;
    diasEnPeriodo: number;
    tick: number;
    ticksPorDia: number;
    velocidad: 1 | 2 | 4 | 5 | 8 | 20;
    pausado: boolean;
  };
  mapaGrid?: MapaV2Grid;
  zonas: Record<ZoneId, ZoneDefinition>;
  tramos: ViaTramo[];
  distanciasZonas: Record<ZoneId, Record<ZoneId, number>>;
  distanciasLotes?: Record<string, number>;
  demandaSuelo: Record<string, number>;
  demandaSueloRachas: Record<string, number>;
  npcs: Npc[];
  hogares: Hogar[];
  casas: Casa[];
  firmas: Firma[];
  alimento: {
    stock: number;
    produccionDiaria: number;
    consumoDiario: number;
    diasStock: number;
    siloDias: number;
    precio: number;
    precioMercado: number;
  };
  gobierno: GovernmentState;
  parcelas: Parcela[];
  hitosCumplidos: string[];
  demandasActivas: ActiveDemand[];
  medidasVigentes: ActorMeasure[];
  bloqueosPalanca: LeverLock[];
  cooldownActorDemanda: Record<string, number>;
  clima: ClimateState;
  medios: MediaOutlet[];
  noticias: NewsArticle[];
  colaHechosDia: PressFact[];
  ventanasCondicion: ConditionWindow[];
  clasificadorRegistro: ClassifierRecord[];
  caosTracker: {
    ventanaInicioDia: number;
    accionesEnVentana: number;
    respiroActivo: boolean;
  };
  cooldownsCondicion: {
    impago: number;
    descontento: number;
    hambre: number;
    paroFirma: number;
    ocupacion: number;
    boicot: number;
  };
  golpesPorZonaHistorial: Record<ZoneId, number[]>;
  avisosEmitidos: string[];
  fenomenosIniciadosIds: string[];
  ultimaIntegridadZona: Record<ZoneId, number>;
  ultimaDefensaZona: Record<ZoneId, number>;
  ultimaOrdenZona?: Record<ZoneId, number>;
  ultimaVariantePorAccion?: Record<string, number>;
  hospitalSaturadoDia?: number;
  precioAyer: number;
  hambreAyerPct: number;
  ultimoSaldoCierre: number;
  ultimoEventoClimaId?: string;
  ultimoEventoEmpresaId?: string;
  ultimaCausaPalanca?: string;
  ultimaSalidaEconomica: EconomyOutput;
  metricasPeriodoAnterior: {
    apoyoPct: number;
    hambreCriticaPct: number;
    poblacion: number;
    satisfaccionMedia: number;
  };
  mercadoStats: {
    quiebrasPeriodo: number;
    fundacionesPeriodo: number;
    comprasPeriodo: number;
    construccionesPeriodo: number;
    nacimientosAcum: number;
    muertesAcum: number;
    hogaresEnAcogida: number;
    ultimaActualizacionDemogDia: number;
  };
  autopilotLastBuildDay?: number;
  autopilotLastViaDay?: number;
  vacantesCriticasRachas?: Record<string, number>;
  lectura?: LecturaState;
  auditEntradasDia: number;
  auditSalidasDia: number;
  ultimoDineroTotal: number;
  eventosDiaActual: SimEvent[];
  eventos: SimEvent[];
  historial: HistoryPoint[];
  bitacora: EventLogEntry[];
  resultado: {
    estado: 'jugando' | 'victoria' | 'derrota';
    victoriaCumplida?: boolean;
    diaVictoria?: number;
    razon?: string;
    diaFinal?: number;
  };
}

export interface CommunityDerived {
  poblacion: number;
  poblacionPct: number;
  vivos: number;
  bajas: number;
  satisfaccionMedia: number;
  apoyoPct: number;
  descontentosPct: number;
  desempleoPct: number;
  hambreCriticaPct: number;
  sinDineroPct: number;
  despensaMediaDias: number;
  hospitalOcupacionPct: number;
  camasHospital: number;
  capacidadHospitalTotal: number;
  hospitalesLlenos: number;
  internados: number;
  esperandoCama: number;
  edificiosActivos: number;
  parcelasLibres: number;
  parcelasSinCalle?: number;
  zonasNoUrbanizadas?: number;
  tramosEnMalEstado?: number;
  tramosCortados?: number;
  mantenimientoTotalPeriodo?: number;
  hogares: number;
  callePct: number;
  hacinamientoPct: number;
  alquilerCargaMediaPct: number;
  natalidad: number;
  mortalidad: number;
  edadMedia: number;
  pctMenores: number;
  pctJubilados: number;
  defensa: Record<ZoneId, number>;
  orden: Record<ZoneId, number>;
  amenazaPercibida: Record<ZoneId, number>;
  productividadTotal: number;
  roles: Record<RoleId, number>;
  mercado: {
    firmas: number;
    cuotaMayorPct: number;
    quiebrasPeriodo: number;
    fundacionesPeriodo: number;
  };
  constructoraSalud?: {
    firmas: number;
    ventasPeriodo: number;
    factorMedio: number;
    empleos: number;
  };
}

export interface WorldCreationOptions {
  escenarioId: ScenarioId;
  economiaModulo: EconomyModule;
  nivelMundo?: WorldComplexityLevel;
  nivelGobernador?: GovernorComplexityLevel;
  estadoAutomatico?: boolean;
  cantidadMedios: number;
  poblacionInicial: number;
  caos: ChaosSettings;
  semilla: number;
  usarIaGemini: boolean;
}
