import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Briefcase,
  CheckCircle2,
  CloudRain,
  Coins,
  Download,
  EyeOff,
  FileBarChart2,
  Home,
  Pause,
  Play,
  Shield,
  Skull,
  Smile,
  StepForward,
  TrendingUp,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Wheat,
  X,
} from 'lucide-react';
import { ECON_CONSTANTS, PERIOD_DAYS, SCENARIO_PRESETS } from '../../data/catalogs';
import {
  alertas_visibles,
  formatLecturaTexto,
  indicadores_resumen,
} from '../../engine/lecturaV2';
import { estimatePeriodBudget, getGovernorLevel, isObserverMode, sumPeriodExpenses } from '../../engine/policies';
import { getActivePhenomena, getAnnouncedPhenomena } from '../../engine/simulation';
import {
  CommunityDerived,
  GameState,
  GovernorComplexityLevel,
  LecturaIndicadorId,
  PhenomenonType,
  WorldComplexityLevel,
  ZoneId,
} from '../../types/game';
import { AiStatus, DespachoTab, MonthlySummary, PaydaySummary } from '../../types/ui';
import { INDICATOR_LABELS, SparklineSvg } from './TemaDrawer';
import { UiTooltip } from './UiTooltip';

interface GameHudTopProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiBusy: boolean;
  aiStatus: AiStatus;
  devMode: boolean;
  noRender: boolean;
  simStepMs: number;
  soundMuted: boolean;
  activeTemaId: LecturaIndicadorId | null;
  paydaySummary: PaydaySummary | null;
  monthlySummary: MonthlySummary | null;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onStepDay: () => void;
  onToggleSoundMute: () => void;
  onDismissPayday: () => void;
  onDismissMonthly: () => void;
  onSetDevPopulation: (pop: number) => void;
  onSetDevSeed: (semilla: number) => void;
  onSetLecturaActiva: (enabled: boolean) => void;
  onSetDevComplexity: (nivelMundo: WorldComplexityLevel, nivelGobernador: GovernorComplexityLevel) => void;
  onSetEstadoAutomatico: (enabled: boolean) => void;
  onSetNoRender: (enabled: boolean) => void;
  onForceClimate: (tipo: PhenomenonType, zona: ZoneId) => void;
  onExportSaveJson: () => string;
  onImportSaveJson: (raw: string) => { ok: boolean; error?: string };
  onExportMetricsJson: () => string;
  onOpenObjetivo: () => void;
  onOpenEconomia: () => void;
  onOpenDemandas: () => void;
  onOpenTema: (id: LecturaIndicadorId) => void;
  onOpenDespacho: (tab?: DespachoTab) => void;
}

const SPEEDS = [1, 2, 5, 20] as const;

const GLANCE_META: Record<
  LecturaIndicadorId,
  { short: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  poblacion: { short: 'Pob', Icon: Users },
  vivienda: { short: 'Viv', Icon: Home },
  comida: { short: 'Com', Icon: Wheat },
  empleo: { short: 'Emp', Icon: Briefcase },
  estado: { short: 'Est', Icon: Activity },
  animo: { short: 'Áni', Icon: Smile },
  orden: { short: 'Ord', Icon: Shield },
};

export const GameHudTop: React.FC<GameHudTopProps> = ({
  state,
  derived,
  paused,
  speed,
  aiBusy,
  aiStatus,
  devMode,
  noRender,
  simStepMs,
  soundMuted,
  activeTemaId,
  paydaySummary,
  monthlySummary,
  onTogglePause,
  onSetSpeed,
  onStepDay,
  onToggleSoundMute,
  onDismissPayday,
  onDismissMonthly,
  onSetDevPopulation,
  onSetDevSeed,
  onSetLecturaActiva,
  onSetDevComplexity,
  onSetEstadoAutomatico,
  onSetNoRender,
  onForceClimate,
  onExportSaveJson,
  onImportSaveJson,
  onExportMetricsJson,
  onOpenObjetivo,
  onOpenEconomia,
  onOpenDemandas,
  onOpenTema,
  onOpenDespacho,
}) => {
  const zoneIds = Object.keys(state.zonas);
  const [devFenom, setDevFenom] = useState<PhenomenonType>('sequia');
  const [devZona, setDevZona] = useState<ZoneId>(zoneIds[0] ?? 'centro');
  const [devPopInput, setDevPopInput] = useState<number>(state.config.poblacionInicial);
  const [devSeedInput, setDevSeedInput] = useState<number>(state.semilla);
  const [devImportFeedback, setDevImportFeedback] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(60);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDevPopInput(state.config.poblacionInicial);
  }, [state.config.poblacionInicial]);

  useEffect(() => {
    setDevSeedInput(state.semilla);
  }, [state.semilla]);

  useEffect(() => {
    if (!state.zonas[devZona] && zoneIds.length > 0) {
      setDevZona(zoneIds[0]);
    }
  }, [devZona, state.zonas, zoneIds]);

  useEffect(() => {
    if (!devMode || noRender || typeof requestAnimationFrame !== 'function') return;
    let rafId = 0;
    let frames = 0;
    let lastSample = performance.now();
    const measure = (now: number) => {
      frames += 1;
      const elapsed = now - lastSample;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        lastSample = now;
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, [devMode, noRender]);

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const plazo = preset.victoria.plazoDia ?? 365;
  const daysLeft = Math.max(0, plazo - state.reloj.dia);
  const victoryCumplida = Boolean(state.resultado.victoriaCumplida);
  const objetivoPerdido = state.eventos.some((e) => e.tipo === 'objetivo_perdido');

  const ticksPorDia = Math.max(1, state.reloj.ticksPorDia || 120);
  const tickInDay = ((state.reloj.tick % ticksPorDia) + ticksPorDia) % ticksPorDia;
  const totalMinutes = Math.floor((tickInDay / ticksPorDia) * 24 * 60);
  const hourStr = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const minStr = String(totalMinutes % 60).padStart(2, '0');

  const worldLevel: WorldComplexityLevel =
    state.config.nivelMundo ?? (state.config.economiaModulo === 'fiscal' ? 'M4' : 'M3');
  const govLevel: GovernorComplexityLevel = getGovernorLevel(state.config);
  const estadoAuto = Boolean(state.config.estadoAutomatico);
  const isG0 = isObserverMode(state.config);

  const basePop = Math.max(1, state.config.poblacionInicial || state.npcs.length);
  const vicIsPct =
    preset.victoria.metrica === 'apoyoPct' || preset.victoria.metrica === 'poblacionPct';
  const vicCurrent =
    preset.victoria.metrica === 'apoyoPct'
      ? derived.apoyoPct
      : preset.victoria.metrica === 'poblacionPct'
      ? derived.poblacionPct
      : derived.poblacion;
  const objectiveHealthy = vicCurrent >= preset.victoria.umbral;

  const defCurrent =
    preset.derrota.metrica === 'hambreCriticaPct'
      ? derived.hambreCriticaPct
      : preset.derrota.metrica === 'poblacionPct'
      ? derived.poblacionPct
      : derived.poblacion;
  const defInit =
    preset.derrota.metrica === 'hambreCriticaPct'
      ? 0
      : preset.derrota.metrica === 'poblacionPct'
      ? 100
      : basePop;
  const defLimit = preset.derrota.umbral;
  const defProgress =
    preset.derrota.op === '>'
      ? Math.max(0, (defCurrent - defInit) / Math.max(1, defLimit - defInit))
      : Math.max(0, (defInit - defCurrent) / Math.max(1, defInit - defLimit));
  const defeatDanger = defProgress >= ECON_CONSTANTS.umbralAlertaDerrota;

  const vicPrev =
    preset.victoria.metrica === 'apoyoPct'
      ? state.metricasPeriodoAnterior.apoyoPct
      : preset.victoria.metrica === 'poblacionPct'
      ? Number(((state.metricasPeriodoAnterior.poblacion / basePop) * 100).toFixed(1))
      : state.metricasPeriodoAnterior.poblacion;
  const vicDelta = Number((vicCurrent - vicPrev).toFixed(1));
  const vicTrendSymbol = vicDelta > 0.4 ? '↑' : vicDelta < -0.4 ? '↓' : '→';
  const vicTrendColor =
    vicDelta > 0.4 ? 'text-emerald-400' : vicDelta < -0.4 ? 'text-rose-400' : 'text-zinc-400';
  const goalStateLabel = victoryCumplida
    ? 'Cumplido'
    : objetivoPerdido
    ? 'Perdido'
    : `Faltan ${daysLeft}d`;

  const estDiario = state.ultimaSalidaEconomica.saldoDiarioEstimado;
  const fin = state.gobierno.finanzas;
  const lastGastos = sumPeriodExpenses(fin);
  const estBudget = estimatePeriodBudget(state, state.gobierno.palancasVigentes);
  const weeklySpend = Math.max(1, lastGastos > 0 ? lastGastos : estBudget.gastosEst);
  const reserveWeeks = state.gobierno.reserva / weeklySpend;

  const activeFen = getActivePhenomena(state)[0];
  const announcedFen = getAnnouncedPhenomena(state)[0];

  const aiLabel =
    aiStatus === 'activa' ? 'IA activa' : aiStatus === 'lenta' ? 'IA lenta' : 'IA plantilla';
  const aiTone =
    aiStatus === 'activa'
      ? 'text-emerald-400'
      : aiStatus === 'lenta'
      ? 'text-amber-300'
      : 'text-zinc-400';

  const lecturaOn = state.config.lecturaActiva !== false;
  const summaryIndicators = lecturaOn ? indicadores_resumen(state) : [];
  const visibleAlerts = lecturaOn ? alertas_visibles(state) : [];
  const totalInformes = state.lectura?.informes.length ?? 0;

  const daysToClose = Math.max(1, PERIOD_DAYS - state.reloj.diasEnPeriodo);
  const reserveColor =
    reserveWeeks < 1.5 || fin.impago
      ? 'text-rose-400'
      : reserveWeeks < 3 || estDiario < 0
      ? 'text-amber-300'
      : 'text-zinc-100';
  const foodColor =
    state.alimento.diasStock < 5
      ? 'text-rose-400'
      : state.alimento.diasStock < 10
      ? 'text-amber-300'
      : 'text-zinc-100';

  const triggerDownload = (filename: string, payload: string) => {
    if (typeof window === 'undefined' || typeof Blob === 'undefined') return;
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = onImportSaveJson(text);
      setDevImportFeedback(res.ok ? 'Partida cargada.' : res.error ?? 'Archivo inválido.');
    } catch {
      setDevImportFeedback('No se pudo leer el archivo JSON.');
    }
  };

  return (
    <header className="pointer-events-none fixed top-3 inset-x-4 z-30 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left HUD Capsule: Day · HH:MM, Speed, and (when not G0) Goal & Próximo */}
        <div className="pointer-events-auto flex items-center gap-2.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 rounded-2xl px-3.5 py-2 shadow-2xl">
          <UiTooltip
            text={`Día ${state.reloj.dia} · ${hourStr}:${minStr} · Año ${state.reloj.anio} · Cierre en ${daysToClose}d`}
          >
            <div className="font-mono text-sm font-bold text-zinc-100 tabular-nums whitespace-nowrap px-1">
              Día {state.reloj.dia} <span className="text-zinc-400 font-medium">· {hourStr}:{minStr}</span>
            </div>
          </UiTooltip>

          <div className="flex items-center gap-1 bg-zinc-800/90 border border-zinc-700/70 rounded-xl p-1">
            <UiTooltip text={paused ? 'Reanudar (Espacio)' : 'Pausar (Espacio)'}>
              <button
                type="button"
                onClick={onTogglePause}
                disabled={state.resultado.estado !== 'jugando'}
                aria-label={paused ? 'Reanudar' : 'Pausar'}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${
                  paused
                    ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {paused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
              </button>
            </UiTooltip>

            {SPEEDS.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSetSpeed(spd)}
                className={`px-2.5 h-8 text-xs font-mono font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  speed === spd && !paused
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-700/60'
                }`}
              >
                {spd}×
              </button>
            ))}

            <UiTooltip text="Avanzar 1 día">
              <button
                type="button"
                onClick={onStepDay}
                disabled={state.resultado.estado !== 'jugando'}
                aria-label="Avanzar 1 día"
                className="flex items-center gap-0.5 px-2.5 h-8 text-xs font-mono font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700/60 rounded-lg whitespace-nowrap shrink-0"
              >
                <StepForward className="w-3.5 h-3.5" />
                +1d
              </button>
            </UiTooltip>
          </div>

          {!isG0 && (
            <>
              <div className="h-5 w-px bg-zinc-700/70" aria-hidden="true" />

              <UiTooltip
                text={`${preset.victoria.descripcion} · Derrota: ${preset.derrota.descripcion} (${daysLeft}d restantes)`}
              >
                <button
                  type="button"
                  onClick={onOpenObjetivo}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors text-sm font-mono tabular-nums whitespace-nowrap shrink-0 ${
                    objetivoPerdido || defeatDanger
                      ? 'border-rose-500/50 bg-rose-950/35 hover:bg-rose-950/55'
                      : 'border-transparent hover:bg-zinc-800/90'
                  }`}
                >
                  {victoryCumplida || (!objetivoPerdido && objectiveHealthy && !defeatDanger) ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 ${
                        objetivoPerdido || defeatDanger ? 'text-rose-400' : 'text-amber-400'
                      }`}
                    />
                  )}
                  <span
                    className={
                      objetivoPerdido || defeatDanger
                        ? 'text-rose-400 font-bold'
                        : objectiveHealthy || victoryCumplida
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-300 font-bold'
                    }
                  >
                    {vicIsPct ? `${vicCurrent}%` : vicCurrent}
                  </span>
                  <span
                    className={`text-xs font-bold ${vicTrendColor}`}
                    aria-label={`Tendencia ${vicTrendSymbol}`}
                  >
                    {vicTrendSymbol}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    /{preset.victoria.umbral}
                    {vicIsPct ? '%' : ''}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span
                    className={`text-xs font-sans font-semibold ${
                      victoryCumplida
                        ? 'text-emerald-300'
                        : objetivoPerdido || defeatDanger
                        ? 'text-rose-300'
                        : 'text-zinc-300'
                    }`}
                  >
                    {goalStateLabel}
                  </span>
                </button>
              </UiTooltip>

              <div className="h-5 w-px bg-zinc-700/70 hidden lg:block" aria-hidden="true" />

              {/* Próximo countdown strip */}
              <div className="hidden lg:flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                <UiTooltip text={`Cierre semanal de caja, sueldos y alquileres en ${daysToClose}d`}>
                  <button
                    type="button"
                    onClick={onOpenEconomia}
                    className="px-2 py-1 rounded-lg bg-zinc-800/75 hover:bg-zinc-800 text-zinc-200 whitespace-nowrap shrink-0"
                  >
                    Pago {daysToClose}d
                  </button>
                </UiTooltip>
                {state.demandasActivas.length > 0 && (
                  <UiTooltip text="Demandas abiertas que requieren respuesta del gobernador">
                    <button
                      type="button"
                      onClick={onOpenDemandas}
                      className="px-2 py-1 rounded-lg bg-amber-950/70 border border-amber-500/40 text-amber-200 hover:bg-amber-900/60 whitespace-nowrap shrink-0"
                    >
                      Demanda {state.demandasActivas[0].diasRestantes}d
                    </button>
                  </UiTooltip>
                )}
              </div>
            </>
          )}

          {(activeFen || announcedFen) && (
            <>
              <div className="h-5 w-px bg-zinc-700/70 hidden sm:block" aria-hidden="true" />
              <UiTooltip
                text={
                  activeFen
                    ? `Fenómeno activo: ${activeFen.nombre}${activeFen.origen ? ` en ${activeFen.origen}` : ''} (${Math.round(activeFen.intensidad)}%)`
                    : `Aviso climático: ${announcedFen!.nombre} llega en ${Math.max(1, announcedFen!.inicioDia - state.reloj.dia)}d${announcedFen!.origen ? ` (${announcedFen!.origen})` : ''}`
                }
              >
                <button
                  type="button"
                  onClick={onOpenObjetivo}
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    activeFen?.tipo === 'plaga_zombie' || activeFen?.tipo === 'pandemia'
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-950/70 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {(activeFen?.tipo ?? announcedFen?.tipo) === 'plaga_zombie' ? (
                    <Skull className="w-4 h-4 shrink-0" />
                  ) : (
                    <CloudRain className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {activeFen
                      ? activeFen.nombre
                      : `${announcedFen!.nombre} ${Math.max(1, announcedFen!.inicioDia - state.reloj.dia)}d`}
                  </span>
                </button>
              </UiTooltip>
            </>
          )}
        </div>

        {/* Right HUD Capsule: Lectura Glance Indicators + Despacho + Governor Treasury */}
        <div className="pointer-events-auto hidden sm:flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 rounded-2xl px-3 py-1.5 shadow-2xl font-mono tabular-nums text-xs">
          {lecturaOn && summaryIndicators.length > 0 ? (
            <div className="flex items-center gap-1">
              {summaryIndicators.map((ind) => {
                const { short, Icon } = GLANCE_META[ind.id];
                const toneColor =
                  ind.estado === 'mal'
                    ? 'text-rose-400'
                    : ind.estado === 'atencion'
                    ? 'text-amber-300'
                    : 'text-emerald-400';
                const stroke =
                  ind.estado === 'mal'
                    ? '#fb7185'
                    : ind.estado === 'atencion'
                    ? '#fbbf24'
                    : '#10b981';
                const trendArrow =
                  ind.tendencia.dir > 0 ? '↑' : ind.tendencia.dir < 0 ? '↓' : '→';
                const trendColor =
                  ind.tendencia.dir > 0
                    ? 'text-emerald-400'
                    : ind.tendencia.dir < 0
                    ? 'text-rose-400'
                    : 'text-zinc-500';
                const isActive = activeTemaId === ind.id;
                const tooltipText = `${INDICATOR_LABELS[ind.id]}: ${ind.valor} (ref. ${ind.referencia}) · ${formatLecturaTexto(ind.texto)}`;
                return (
                  <UiTooltip key={ind.id} text={tooltipText}>
                    <button
                      type="button"
                      onClick={() => onOpenTema(ind.id)}
                      aria-label={`Abrir tema ${INDICATOR_LABELS[ind.id]}`}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-emerald-950/75 border-emerald-500/70 text-white'
                          : ind.estado === 'mal'
                          ? 'bg-rose-950/35 border-rose-500/40 hover:bg-rose-950/60'
                          : ind.estado === 'atencion'
                          ? 'bg-amber-950/30 border-amber-500/35 hover:bg-amber-950/55'
                          : 'bg-zinc-800/55 border-transparent hover:bg-zinc-800'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${toneColor}`} />
                      <span className="font-sans text-[11px] font-semibold text-zinc-200">
                        {short}
                      </span>
                      <span className={`font-bold ${trendColor}`}>{trendArrow}</span>
                      <SparklineSvg values={ind.serie} stroke={stroke} width={30} height={14} />
                      {devMode && (
                        <span className="text-[11px] font-bold text-zinc-100">{ind.valor}</span>
                      )}
                    </button>
                  </UiTooltip>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-1 text-zinc-300">
              <span>Pob {derived.poblacion.toLocaleString('es-AR')}</span>
              <span>Calle {derived.callePct}%</span>
            </div>
          )}

          <div className="h-4 w-px bg-zinc-700/70" aria-hidden="true" />

          <UiTooltip text="Despacho de lectura: resumen, historial, informe y personas clave">
            <button
              type="button"
              onClick={() => onOpenDespacho('resumen')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-800/85 hover:bg-emerald-600 text-zinc-100 font-sans text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>Despacho</span>
            </button>
          </UiTooltip>

          {lecturaOn && totalInformes > 0 && (
            <UiTooltip text="Abrir el último informe periódico">
              <button
                type="button"
                onClick={() => onOpenDespacho('informe')}
                className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-800/75 hover:bg-zinc-700 text-emerald-300 font-sans text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <FileBarChart2 className="w-3.5 h-3.5" />
                <span>Informe</span>
              </button>
            </UiTooltip>
          )}

          {!isG0 && (
            <>
              <div className="h-4 w-px bg-zinc-700/70" aria-hidden="true" />
              <UiTooltip
                text={`Caja: $${Math.round(state.gobierno.reserva)} (${reserveWeeks.toFixed(1)} sem.) · Flujo ${estDiario >= 0 ? '+' : ''}$${estDiario.toFixed(0)}/d${fin.impago ? ' (IMPAGO)' : ''}`}
              >
                <button
                  type="button"
                  onClick={onOpenEconomia}
                  className="flex items-center gap-1.5 hover:opacity-85 whitespace-nowrap shrink-0"
                >
                  <Coins className={`w-4 h-4 shrink-0 ${reserveColor}`} />
                  <span className={`font-bold ${reserveColor}`}>${Math.round(state.gobierno.reserva)}</span>
                </button>
              </UiTooltip>

              <UiTooltip
                text={`Alimento: ${Math.round(state.alimento.stock)} u. (${state.alimento.diasStock.toFixed(0)}d) · Precio $${state.alimento.precio.toFixed(2)}`}
              >
                <div className="flex items-center gap-1.5 cursor-default whitespace-nowrap">
                  <Wheat className={`w-4 h-4 shrink-0 ${foodColor}`} />
                  <span className={`font-bold ${foodColor}`}>{state.alimento.diasStock.toFixed(0)}d</span>
                </div>
              </UiTooltip>
            </>
          )}

          {state.config.economiaModulo === 'fiscal' && (
            <UiTooltip text={`Inflación acumulada: ${state.gobierno.inflacion.toFixed(1)}%`}>
              <div className="hidden md:flex items-center gap-1.5 cursor-default whitespace-nowrap">
                <TrendingUp
                  className={`w-4 h-4 shrink-0 ${
                    state.gobierno.inflacion > 25 ? 'text-amber-400' : 'text-zinc-300'
                  }`}
                />
                <span
                  className={`font-bold ${
                    state.gobierno.inflacion > 25 ? 'text-amber-300' : 'text-zinc-100'
                  }`}
                >
                  {state.gobierno.inflacion.toFixed(0)}%
                </span>
              </div>
            </UiTooltip>
          )}

          {state.config.usarIaGemini && (
            <UiTooltip
              text={
                aiBusy
                  ? 'IA generando en segundo plano'
                  : aiStatus === 'plantilla'
                  ? 'IA sin respuesta: usa plantillas'
                  : `Estado: ${aiLabel}`
              }
            >
              <span className={`font-sans text-xs font-semibold whitespace-nowrap ${aiTone}`}>
                {aiBusy ? 'IA…' : aiLabel}
              </span>
            </UiTooltip>
          )}

          {(!isG0 || devMode) && (
            <UiTooltip text={soundMuted ? 'Activar audio' : 'Silenciar audio'}>
              <button
                type="button"
                onClick={onToggleSoundMute}
                aria-label={soundMuted ? 'Activar audio' : 'Silenciar audio'}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
              >
                {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </UiTooltip>
          )}
        </div>
      </div>

      {/* Lectura Visible Alerts Strip (max 3) */}
      {lecturaOn && visibleAlerts.length > 0 && (
        <div className="pointer-events-auto self-end flex flex-wrap items-center justify-end gap-2">
          {visibleAlerts.map((al) => {
            const sevStyle =
              al.severidad >= 3
                ? 'bg-rose-950/85 border-rose-500/50 text-rose-200 hover:bg-rose-900/80'
                : al.severidad === 2
                ? 'bg-amber-950/85 border-amber-500/50 text-amber-200 hover:bg-amber-900/75'
                : 'bg-zinc-900/90 border-sky-500/40 text-sky-200 hover:bg-zinc-800';
            return (
              <button
                key={al.id}
                type="button"
                onClick={() => onOpenTema(al.indicador)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-medium shadow-lg backdrop-blur-md transition-colors ${sevStyle}`}
              >
                {al.severidad >= 3 ? (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{formatLecturaTexto(al.texto)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Non-pausing Weekly Payday Summary Strip (only in Governor mode) */}
      {paydaySummary && !isG0 && (
        <div className="pointer-events-auto self-end bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl px-4 py-2.5 flex items-center gap-4 text-xs shadow-xl">
          <span className="font-semibold text-zinc-200">
            Cierre P{paydaySummary.periodo} (D{paydaySummary.dia})
          </span>
          <span className="font-mono tabular-nums text-emerald-400">
            +${paydaySummary.ingresos.toFixed(0)}
          </span>
          <span className="font-mono tabular-nums text-zinc-300">
            -${paydaySummary.gastos.toFixed(0)}
          </span>
          <span
            className={`font-mono font-bold tabular-nums ${
              paydaySummary.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {paydaySummary.saldo >= 0 ? '+' : ''}${paydaySummary.saldo.toFixed(0)}
          </span>
          <button
            type="button"
            onClick={onDismissPayday}
            aria-label="Cerrar resumen semanal"
            className="text-zinc-400 hover:text-white p-0.5 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Optional Non-blocking 30-day Summary Card (only in Governor mode) */}
      {monthlySummary && !isG0 && (
        <div className="pointer-events-auto self-end w-[340px] max-w-[calc(100vw-32px)] bg-zinc-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white">Balance mensual · Día {monthlySummary.dia}</span>
            <button
              type="button"
              onClick={onDismissMonthly}
              aria-label="Cerrar balance mensual"
              className="text-zinc-400 hover:text-white p-0.5 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono tabular-nums bg-zinc-800/60 rounded-xl p-2">
            <div>
              <span className="font-sans text-[11px] text-zinc-400 block">Apoyo</span>
              <span className="font-bold text-emerald-400">{monthlySummary.apoyoPct}%</span>
            </div>
            <div>
              <span className="font-sans text-[11px] text-zinc-400 block">Población</span>
              <span className="font-bold text-white">{monthlySummary.poblacion}</span>
            </div>
            <div>
              <span className="font-sans text-[11px] text-zinc-400 block">Caja</span>
              <span className="font-bold text-zinc-200">${Math.round(monthlySummary.reserva)}</span>
            </div>
          </div>
          {monthlySummary.topPositivos.length > 0 && (
            <div className="text-emerald-300 space-y-0.5">
              {monthlySummary.topPositivos.map((p) => (
                <div key={p}>+ {p}</div>
              ))}
            </div>
          )}
          {monthlySummary.topNegativos.length > 0 && (
            <div className="text-amber-300 space-y-0.5">
              {monthlySummary.topNegativos.map((n) => (
                <div key={n}>- {n}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Opt-in Developer Mode Floating Bar */}
      {devMode && (
        <div className="pointer-events-auto self-start bg-zinc-950/92 backdrop-blur-md border border-amber-500/40 rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs shadow-2xl">
          <div className="flex items-center gap-3 font-mono tabular-nums text-zinc-300">
            <span className="text-amber-300 font-sans font-bold">Dev</span>
            <span>{noRender ? '—' : `${fps} FPS`}</span>
            <span>{simStepMs.toFixed(2)} ms</span>
            <span>S:{state.semilla}</span>
            <span>T{state.reloj.tick}</span>
          </div>

          <button
            type="button"
            onClick={() => onSetNoRender(!noRender)}
            className={`flex items-center gap-1.5 px-2.5 py-1 font-semibold rounded-lg border whitespace-nowrap shrink-0 transition-colors ${
              noRender
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            Sin dibujo
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Escala</span>
            {([100, 500, 5000] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => {
                  setDevPopInput(sc);
                  onSetDevPopulation(sc);
                }}
                className={`px-2 py-1 font-mono rounded-lg whitespace-nowrap shrink-0 ${
                  state.config.poblacionInicial === sc
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {sc}
              </button>
            ))}
            <input
              type="number"
              min={20}
              max={5000}
              step={20}
              value={devPopInput}
              onChange={(e) => setDevPopInput(Math.min(5000, Math.max(20, Number(e.target.value) || 20)))}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-right font-mono text-zinc-100"
            />
            <button
              type="button"
              onClick={() => onSetDevPopulation(devPopInput)}
              className="px-2.5 py-1 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              OK
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              aria-label="Nivel de mundo dev"
              value={worldLevel}
              onChange={(e) => onSetDevComplexity(e.target.value as WorldComplexityLevel, govLevel)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 font-mono"
            >
              <option value="M0">M0</option>
              <option value="M1">M1</option>
              <option value="M2">M2</option>
              <option value="M3">M3</option>
              <option value="M4">M4</option>
            </select>
            <select
              aria-label="Nivel de gobernador dev"
              value={govLevel}
              onChange={(e) => onSetDevComplexity(worldLevel, e.target.value as GovernorComplexityLevel)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 font-mono"
            >
              <option value="G0">G0</option>
              <option value="G1">G1</option>
              <option value="G2">G2</option>
              <option value="G3">G3</option>
            </select>
            <label className="flex items-center gap-1.5 cursor-pointer text-zinc-200 px-1.5 whitespace-nowrap">
              <input
                type="checkbox"
                checked={estadoAuto}
                onChange={(e) => onSetEstadoAutomatico(e.target.checked)}
                className="rounded border-zinc-600"
              />
              <span>Auto</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-zinc-200 px-1.5 whitespace-nowrap">
              <input
                type="checkbox"
                checked={lecturaOn}
                onChange={(e) => onSetLecturaActiva(e.target.checked)}
                className="rounded border-zinc-600"
              />
              <span>Lectura</span>
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Semilla</span>
            <input
              type="number"
              min={1}
              max={99999999}
              value={devSeedInput}
              onChange={(e) => setDevSeedInput(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              aria-label="Semilla dev"
              className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-right font-mono text-zinc-100"
            />
            <button
              type="button"
              onClick={() => onSetDevSeed(devSeedInput)}
              className="px-2.5 py-1 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              Regenerar
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={devFenom}
              disabled={worldLevel === 'M0'}
              onChange={(e) => setDevFenom(e.target.value as PhenomenonType)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 disabled:opacity-40"
            >
              <option value="sequia">Sequía</option>
              <option value="plaga">Plaga</option>
              <option value="pandemia">Pandemia</option>
              <option value="plaga_zombie">Zombie</option>
            </select>
            <select
              value={devZona}
              disabled={worldLevel === 'M0'}
              onChange={(e) => setDevZona(e.target.value as ZoneId)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 disabled:opacity-40"
            >
              {zoneIds.map((zId) => (
                <option key={zId} value={zId}>
                  {state.zonas[zId]?.nombre ?? zId}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={worldLevel === 'M0'}
              onClick={() => onForceClimate(devFenom, devZona)}
              className="px-2.5 py-1 font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Lanzar
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              Importar
            </button>
            <button
              type="button"
              onClick={() =>
                triggerDownload(`partida-valle-d${state.reloj.dia}.json`, onExportSaveJson())
              }
              className="flex items-center gap-1.5 px-2.5 py-1 font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Partida
            </button>
            <button
              type="button"
              onClick={() =>
                triggerDownload(`metricas-valle-d${state.reloj.dia}.json`, onExportMetricsJson())
              }
              className="flex items-center gap-1.5 px-2.5 py-1 font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Métricas
            </button>
            {devImportFeedback && (
              <span className="text-emerald-300 font-medium">{devImportFeedback}</span>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
