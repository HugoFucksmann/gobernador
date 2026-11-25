import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Coins,
  Pause,
  Play,
  Skull,
  StepForward,
  TrendingUp,
  Users,
  Wheat,
} from 'lucide-react';
import { ECON_CONSTANTS, PERIOD_DAYS, SCENARIO_PRESETS } from '../../data/catalogs';
import { sumPeriodExpenses } from '../../engine/policies';
import { getActivePhenomena, getAnnouncedPhenomena } from '../../engine/simulation';
import {
  CommunityDerived,
  GameState,
  GovernorComplexityLevel,
  PhenomenonType,
  WorldComplexityLevel,
  ZoneId,
} from '../../types/game';
import { AiStatus } from '../../types/ui';
import { UiTooltip } from './UiTooltip';

interface GameHudTopProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiBusy: boolean;
  aiStatus: AiStatus;
  devMode: boolean;
  simStepMs: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onStepDay: () => void;
  onSetDevPopulation: (pop: number) => void;
  onSetDevComplexity: (nivelMundo: WorldComplexityLevel, nivelGobernador: GovernorComplexityLevel) => void;
  onForceClimate: (tipo: PhenomenonType, zona: ZoneId) => void;
  onOpenObjetivo: () => void;
}

export const GameHudTop: React.FC<GameHudTopProps> = ({
  state,
  derived,
  paused,
  speed,
  aiBusy,
  aiStatus,
  devMode,
  simStepMs,
  onTogglePause,
  onSetSpeed,
  onStepDay,
  onSetDevPopulation,
  onSetDevComplexity,
  onForceClimate,
  onOpenObjetivo,
}) => {
  const [devFenom, setDevFenom] = useState<PhenomenonType>('sequia');
  const [devZona, setDevZona] = useState<ZoneId>('este');
  const [devPopInput, setDevPopInput] = useState<number>(state.config.poblacionInicial);
  const [fps, setFps] = useState<number>(60);

  useEffect(() => {
    setDevPopInput(state.config.poblacionInicial);
  }, [state.config.poblacionInicial]);

  useEffect(() => {
    if (!devMode || typeof requestAnimationFrame !== 'function') return;
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
  }, [devMode]);

  const preset = SCENARIO_PRESETS[state.config.escenarioId];
  const plazo = preset.victoria.plazoDia ?? 365;
  const daysLeft = Math.max(0, plazo - state.reloj.dia);
  const victoryCumplida = Boolean(state.resultado.victoriaCumplida);
  const objetivoPerdido = state.eventos.some((e) => e.tipo === 'objetivo_perdido');

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
  const defInit = state.metricasBaseObjetivo?.derrotaInicial ?? defCurrent;
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
    : `Pendiente · ${daysLeft}d`;

  const estDiario = state.ultimaSalidaEconomica.saldoDiarioEstimado;
  const fin = state.gobierno.finanzas;
  const lastGastos = sumPeriodExpenses(fin);
  const activeFen = getActivePhenomena(state)[0];
  const announcedFen = getAnnouncedPhenomena(state)[0];
  const normalSpeeds = devMode ? [1, 2, 4, 8] : [1, 2];
  const worldLevel: WorldComplexityLevel =
    state.config.nivelMundo ?? (state.config.economiaModulo === 'fiscal' ? 'M2' : 'M1');
  const govLevel: GovernorComplexityLevel =
    state.config.nivelGobernador ?? (state.config.economiaModulo === 'fiscal' ? 'G3' : 'G2');

  const aiLabel =
    aiStatus === 'activa' ? 'IA activa' : aiStatus === 'lenta' ? 'IA lenta' : 'IA sin respuesta';
  const aiTone =
    aiStatus === 'activa'
      ? 'text-emerald-400'
      : aiStatus === 'lenta'
      ? 'text-amber-300'
      : 'text-zinc-400';

  const daysToClose = Math.max(0, PERIOD_DAYS - state.reloj.diasEnPeriodo);
  const reserveColor =
    state.gobierno.reserva < 100 || fin.impago
      ? 'text-rose-400'
      : estDiario < 0
      ? 'text-amber-300'
      : 'text-zinc-100';
  const foodColor =
    state.alimento.diasStock < 5
      ? 'text-rose-400'
      : state.alimento.diasStock < 10
      ? 'text-amber-300'
      : 'text-zinc-100';
  const popColor =
    derived.poblacionPct < 75
      ? 'text-rose-400'
      : derived.hambreCriticaPct > 20 || derived.descontentosPct > 30
      ? 'text-amber-300'
      : 'text-zinc-100';

  return (
    <header className="pointer-events-none fixed top-3 inset-x-4 z-30 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left HUD Capsule: Day, Speed & Goal */}
        <div className="pointer-events-auto flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 rounded-2xl px-3.5 py-2 shadow-2xl">
          <UiTooltip
            text={`Día ${state.reloj.dia} de ${plazo} · Cierre fiscal en ${daysToClose}d (períodos de ${PERIOD_DAYS}d)`}
          >
            <div className="font-mono text-sm font-bold text-zinc-100 tabular-nums whitespace-nowrap px-1">
              Día {state.reloj.dia}
            </div>
          </UiTooltip>

          <div className="flex items-center gap-1 bg-zinc-800/90 border border-zinc-700/70 rounded-xl p-1">
            <UiTooltip text={paused ? 'Reanudar (Espacio)' : 'Pausar (Espacio)'}>
              <button
                type="button"
                onClick={onTogglePause}
                disabled={state.resultado.estado !== 'jugando'}
                aria-label={paused ? 'Reanudar' : 'Pausar'}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                  paused
                    ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {paused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
              </button>
            </UiTooltip>

            {normalSpeeds.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSetSpeed(spd)}
                className={`px-2.5 h-8 text-xs font-mono font-semibold rounded-lg transition-colors whitespace-nowrap ${
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
                className="flex items-center gap-0.5 px-2.5 h-8 text-xs font-mono font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700/60 rounded-lg whitespace-nowrap"
              >
                <StepForward className="w-3.5 h-3.5" />
                +1d
              </button>
            </UiTooltip>
          </div>

          <div className="h-5 w-px bg-zinc-700/70" aria-hidden="true" />

          <UiTooltip
            text={`${preset.victoria.descripcion} · Derrota: ${preset.derrota.descripcion} (${daysLeft}d restantes)`}
          >
            <button
              type="button"
              onClick={onOpenObjetivo}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors text-sm font-mono tabular-nums whitespace-nowrap ${
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
                    : objetivoPerdido
                    ? 'text-rose-300'
                    : defeatDanger
                    ? 'text-rose-300'
                    : 'text-zinc-300'
                }`}
              >
                {goalStateLabel}
              </span>
            </button>
          </UiTooltip>

          {(activeFen || announcedFen) && (
            <>
              <div className="h-5 w-px bg-zinc-700/70 hidden sm:block" aria-hidden="true" />
              <UiTooltip
                text={
                  activeFen
                    ? `Fenómeno activo: ${activeFen.nombre}${activeFen.origen ? ` en zona ${activeFen.origen}` : ''} (${Math.round(activeFen.intensidad)}%)`
                    : `Aviso climático: ${announcedFen!.nombre} llega en ${Math.max(1, announcedFen!.inicioDia - state.reloj.dia)}d${announcedFen!.origen ? ` (zona ${announcedFen!.origen})` : ''}`
                }
              >
                <button
                  type="button"
                  onClick={onOpenObjetivo}
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
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

        {/* Right HUD Capsule: Essential Resources Only */}
        <div className="pointer-events-auto hidden sm:flex items-center gap-5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 rounded-2xl px-4 py-2.5 shadow-2xl font-mono tabular-nums text-sm">
          <UiTooltip
            text={`Reserva: $${Math.round(state.gobierno.reserva)} · Flujo est.: ${estDiario >= 0 ? '+' : ''}$${estDiario.toFixed(0)}/d · Último cierre: +$${fin.ingresos.toFixed(0)} / -$${lastGastos.toFixed(0)}${fin.impago ? ' (IMPAGO ACTIVO)' : ''}`}
          >
            <div className="flex items-center gap-2 cursor-default whitespace-nowrap">
              <Coins className={`w-4 h-4 shrink-0 ${reserveColor}`} />
              <span className={`font-bold ${reserveColor}`}>${Math.round(state.gobierno.reserva)}</span>
              <span className={`text-xs ${estDiario < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {estDiario >= 0 ? '+' : ''}
                {estDiario.toFixed(0)}/d
              </span>
            </div>
          </UiTooltip>

          <UiTooltip
            text={`Alimento: ${Math.round(state.alimento.stock)} u. (${state.alimento.diasStock.toFixed(0)} días) · Cosecha +${state.alimento.produccionDiaria}/d · Consumo -${state.alimento.consumoDiario}/d · Precio $${state.alimento.precio.toFixed(2)}`}
          >
            <div className="flex items-center gap-2 cursor-default whitespace-nowrap">
              <Wheat className={`w-4 h-4 shrink-0 ${foodColor}`} />
              <span className={`font-bold ${foodColor}`}>{state.alimento.diasStock.toFixed(0)}d</span>
            </div>
          </UiTooltip>

          <UiTooltip
            text={`Población: ${derived.poblacion}/${basePop} (${derived.poblacionPct}%) · Ánimo ${derived.satisfaccionMedia}% · Apoyo ${derived.apoyoPct}% · Hambre crítica ${derived.hambreCriticaPct}%`}
          >
            <div className="flex items-center gap-2 cursor-default whitespace-nowrap">
              <Users className={`w-4 h-4 shrink-0 ${popColor}`} />
              <span className={`font-bold ${popColor}`}>{derived.poblacion}</span>
            </div>
          </UiTooltip>

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
        </div>
      </div>

      {/* Opt-in Developer Mode Floating Bar */}
      {devMode && (
        <div className="pointer-events-auto self-start bg-zinc-950/92 backdrop-blur-md border border-amber-500/40 rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-4 text-xs shadow-2xl">
          <div className="flex items-center gap-3 font-mono tabular-nums text-zinc-300">
            <span className="text-amber-300 font-sans font-bold">Dev</span>
            <span>{fps} FPS</span>
            <span>{simStepMs.toFixed(2)} ms</span>
            <span>T{state.reloj.tick}</span>
            <span>
              Hosp {derived.internados}/{derived.camasHospital}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400">NPCs</span>
            <input
              type="number"
              min={20}
              max={1000}
              step={10}
              value={devPopInput}
              onChange={(e) => setDevPopInput(Math.min(1000, Math.max(20, Number(e.target.value) || 20)))}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-right font-mono text-zinc-100"
            />
            <button
              type="button"
              onClick={() => onSetDevPopulation(devPopInput)}
              className="px-3 py-1 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
            >
              OK
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Nivel de mundo dev"
              value={worldLevel}
              onChange={(e) => onSetDevComplexity(e.target.value as WorldComplexityLevel, govLevel)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 font-mono"
            >
              <option value="M0">M0</option>
              <option value="M1">M1</option>
              <option value="M2">M2</option>
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
          </div>

          <div className="flex items-center gap-2">
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
              <option value="centro">centro</option>
              <option value="norte">norte</option>
              <option value="este">este</option>
              <option value="sur">sur</option>
              <option value="oeste">oeste</option>
            </select>
            <button
              type="button"
              disabled={worldLevel === 'M0'}
              onClick={() => onForceClimate(devFenom, devZona)}
              className="px-3 py-1 font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg disabled:opacity-40"
            >
              Lanzar
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
