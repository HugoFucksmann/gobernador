import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Compass,
  Newspaper,
  Pause,
  Play,
  Settings2,
  Skull,
  SlidersHorizontal,
  StepForward,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { ECON_CONSTANTS, SCENARIO_PRESETS } from '../../data/catalogs';
import { getActivePhenomena } from '../../engine/simulation';
import { CommunityDerived, GameState, PhenomenonType, ZoneId } from '../../types/game';
import { AiStatus, WindowId } from '../../types/ui';

interface GameHudTopProps {
  state: GameState;
  derived: CommunityDerived;
  paused: boolean;
  speed: number;
  aiBusy: boolean;
  aiStatus: AiStatus;
  devMode: boolean;
  simStepMs: number;
  openWindows: WindowId[];
  hasConditionAlert?: boolean;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onStepDay: () => void;
  onToggleDevMode: () => void;
  onSetDevPopulation: (pop: number) => void;
  onForceClimate: (tipo: PhenomenonType, zona: ZoneId) => void;
  onToggleWindow: (win: WindowId) => void;
  onOpenObjetivo: () => void;
  onOpenNewGame: () => void;
}

const TOOL_BUTTONS: Array<{
  id: WindowId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { id: 'palancas', label: 'Palancas', icon: SlidersHorizontal, accent: 'text-teal-300' },
  { id: 'economia', label: 'Economía', icon: TrendingUp, accent: 'text-amber-300' },
  { id: 'ciudad', label: 'Ciudad', icon: Compass, accent: 'text-sky-300' },
  { id: 'gaceta', label: 'Gaceta', icon: Newspaper, accent: 'text-slate-300' },
];

function formatTrend(current: number, previous: number, higherIsBetter: boolean): {
  arrow: string;
  tone: string;
} {
  const diff = current - previous;
  if (Math.abs(diff) < 0.8) return { arrow: '→', tone: 'text-slate-400' };
  const up = diff > 0;
  const good = higherIsBetter ? up : !up;
  return {
    arrow: up ? '↑' : '↓',
    tone: good ? 'text-emerald-400' : 'text-rose-400',
  };
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
  openWindows,
  hasConditionAlert,
  onTogglePause,
  onSetSpeed,
  onStepDay,
  onToggleDevMode,
  onSetDevPopulation,
  onForceClimate,
  onToggleWindow,
  onOpenObjetivo,
  onOpenNewGame,
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
  const vicPrev =
    preset.victoria.metrica === 'apoyoPct'
      ? state.metricasPeriodoAnterior.apoyoPct
      : preset.victoria.metrica === 'poblacionPct'
      ? Number(((state.metricasPeriodoAnterior.poblacion / basePop) * 100).toFixed(1))
      : state.metricasPeriodoAnterior.poblacion;
  const vicTrend = formatTrend(vicCurrent, vicPrev, true);
  const objectiveHealthy = vicCurrent >= preset.victoria.umbral;

  const defIsPct =
    preset.derrota.metrica === 'hambreCriticaPct' || preset.derrota.metrica === 'poblacionPct';
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

  const estDiario = state.ultimaSalidaEconomica.saldoDiarioEstimado;
  const fin = state.gobierno.finanzas;
  const lastGastos =
    fin.nomina +
    fin.pensiones +
    fin.garantiaAlimentaria +
    fin.ayudaSocial +
    fin.operacion +
    fin.prensa;
  const activeFen = getActivePhenomena(state)[0];
  const normalSpeeds = devMode ? [1, 2, 10] : [1, 2];

  const aiLabel =
    aiStatus === 'activa' ? 'IA activa' : aiStatus === 'lenta' ? 'IA lenta' : 'IA plantillas';
  const aiTone =
    aiStatus === 'activa'
      ? 'text-teal-300'
      : aiStatus === 'lenta'
      ? 'text-amber-300'
      : 'text-slate-400';

  return (
    <header className="pointer-events-auto fixed top-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-700/80 shadow-lg">
      <div className="px-3 py-1.5 flex items-center justify-between gap-2.5">
        {/* Left: Brand + Goal + Playback */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700/80">
            <span className="font-display text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap hidden sm:inline">
              El Gobernador
            </span>
            <button
              type="button"
              onClick={onOpenObjetivo}
              title={`Meta (día ${plazo}): ${preset.victoria.descripcion} · Derrota: ${preset.derrota.descripcion}`}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono tabular-nums transition-colors whitespace-nowrap"
            >
              {victoryCumplida || (!objetivoPerdido && objectiveHealthy) ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    objetivoPerdido ? 'text-rose-400' : 'text-amber-400'
                  }`}
                />
              )}
              <span className="font-sans text-slate-400 hidden md:inline">Meta</span>
              <span
                className={
                  objetivoPerdido
                    ? 'text-rose-300 font-semibold'
                    : objectiveHealthy || victoryCumplida
                    ? 'text-emerald-400 font-semibold'
                    : 'text-amber-300 font-semibold'
                }
              >
                {vicIsPct ? `${vicCurrent}%` : vicCurrent}
              </span>
              <span className="text-slate-500">
                /{preset.victoria.umbral}
                {vicIsPct ? '%' : ''}
              </span>
              <span className={vicTrend.tone}>{vicTrend.arrow}</span>
              <span className="text-slate-600">·</span>
              {victoryCumplida ? (
                <span className="text-emerald-300 font-sans font-semibold">Cumplida</span>
              ) : objetivoPerdido ? (
                <span className="text-rose-300 font-sans font-semibold">Perdido</span>
              ) : (
                <span className="text-slate-300">{daysLeft}d</span>
              )}
              {defeatDanger && (
                <span className="text-rose-400 font-sans font-semibold ml-0.5">
                  · Riesgo {defIsPct ? `${defCurrent}%` : defCurrent}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-800/90 border border-slate-700/80 rounded p-0.5">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={state.resultado.estado !== 'jugando'}
              title={paused ? 'Reanudar (Espacio)' : 'Pausar (Espacio)'}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-sm transition-colors whitespace-nowrap ${
                paused
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span className="hidden lg:inline">{paused ? 'Pausa' : 'Activo'}</span>
            </button>
            {normalSpeeds.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSetSpeed(spd)}
                className={`px-1.5 py-1 text-[11px] font-mono font-semibold rounded-sm transition-colors whitespace-nowrap ${
                  speed === spd && !paused
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                }`}
              >
                {spd}×
              </button>
            ))}
            <button
              type="button"
              onClick={onStepDay}
              disabled={state.resultado.estado !== 'jugando'}
              title="Avanzar 1 día"
              className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-700/70 rounded-sm whitespace-nowrap"
            >
              <StepForward className="w-3 h-3" />
              +1d
            </button>
          </div>
        </div>

        {/* Center: 4 Clean Windows */}
        <nav aria-label="Ventanas principales" className="flex items-center gap-1.5 shrink-0">
          {TOOL_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const active = openWindows.includes(btn.id);
            const showAlertDot = btn.id === 'ciudad' && hasConditionAlert;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onToggleWindow(btn.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-teal-700 border-teal-400/60 text-white shadow-sm'
                    : showAlertDot
                    ? 'bg-rose-900/70 hover:bg-rose-800 border-rose-500/70 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : btn.accent}`} />
                <span>{btn.label}</span>
                {showAlertDot && <span className="text-[10px] font-mono text-rose-200">!</span>}
              </button>
            );
          })}
        </nav>

        {/* Right: Vital Readouts + Phenomenon Alert + Dev + Partida */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <div className="hidden sm:flex items-center gap-2.5 font-mono tabular-nums bg-slate-800/80 border border-slate-700/80 rounded px-2.5 py-1">
            <div
              title={`Reserva $${Math.round(state.gobierno.reserva)} · Flujo est. ${estDiario >= 0 ? '+' : ''}$${estDiario.toFixed(0)}/d · Último cierre: Ing $${fin.ingresos.toFixed(0)} / Gas $${lastGastos.toFixed(0)} / Saldo ${fin.saldo >= 0 ? '+' : ''}$${fin.saldo.toFixed(0)}`}
            >
              <span className="font-sans text-slate-400 mr-1">Caja</span>
              <span
                className={
                  state.gobierno.reserva < 100
                    ? 'text-rose-400 font-semibold'
                    : 'text-white font-semibold'
                }
              >
                ${Math.round(state.gobierno.reserva)}
              </span>
              <span className={`ml-1 text-[11px] ${estDiario < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ({estDiario >= 0 ? '+' : ''}
                {estDiario.toFixed(0)}/d)
              </span>
            </div>

            <div className="hidden 2xl:block text-[11px]" title="Ingresos y gastos del último cierre fiscal">
              <span className="text-emerald-400">+${fin.ingresos.toFixed(0)}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300">-${lastGastos.toFixed(0)}</span>
              {fin.saldo < 0 && (
                <span className="text-rose-400 font-semibold ml-1">Saldo -${Math.abs(fin.saldo).toFixed(0)}</span>
              )}
            </div>

            <div title="Días de alimento en almacén">
              <span className="font-sans text-slate-400 mr-1">Comida</span>
              <span
                className={
                  state.alimento.diasStock < 5
                    ? 'text-rose-400 font-semibold'
                    : 'text-white font-semibold'
                }
              >
                {state.alimento.diasStock.toFixed(0)}d
              </span>
            </div>

            <div className="hidden lg:block" title="Población viva">
              <span className="font-sans text-slate-400 mr-1">Hab.</span>
              <span className="text-white font-semibold">{derived.poblacion}</span>
            </div>

            <div className="hidden xl:block">
              <span className="font-sans text-slate-400 mr-1">Infl.</span>
              <span
                className={
                  state.gobierno.inflacion > 25
                    ? 'text-amber-400 font-semibold'
                    : 'text-white font-semibold'
                }
              >
                {state.gobierno.inflacion.toFixed(0)}%
              </span>
            </div>

            {activeFen && (
              <button
                type="button"
                onClick={() => onToggleWindow('ciudad')}
                title="Ver fenómeno activo y zonas"
                className="hidden xl:flex items-center gap-1 font-sans text-[11px] font-semibold text-rose-300 hover:text-white"
              >
                {activeFen.tipo === 'plaga_zombie' ? (
                  <Skull className="w-3 h-3 text-rose-400" />
                ) : (
                  <CloudRain className="w-3 h-3 text-amber-400" />
                )}
                <span>
                  {activeFen.nombre}
                  {activeFen.origen ? ` (${activeFen.origen})` : ''}
                </span>
              </button>
            )}

            {state.config.usarIaGemini && (
              <span
                title={
                  aiBusy
                    ? 'IA procesando consulta en segundo plano'
                    : aiStatus === 'plantilla'
                    ? 'IA sin respuesta: decide el motor y se usan plantillas'
                    : `Estado de IA opcional: ${aiLabel}`
                }
                className={`hidden 2xl:inline font-sans text-[11px] font-medium ${aiTone}`}
              >
                {aiBusy ? `${aiLabel}…` : aiLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleDevMode}
            title="Modo desarrollador"
            className={`p-1.5 rounded border transition-colors ${
              devMode
                ? 'bg-amber-700 border-amber-400 text-white'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onOpenNewGame}
            title="Partida, guardado y escenario"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded whitespace-nowrap shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5 text-teal-300" />
            <span className="hidden md:inline">Partida</span>
          </button>
        </div>
      </div>

      {/* Opt-in Developer Mode Strip */}
      {devMode && (
        <div className="px-3 py-1 bg-slate-950/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-3 font-mono tabular-nums text-slate-300">
            <span className="text-amber-300 font-sans font-semibold">Modo Desarrollador</span>
            <span>FPS: {fps}</span>
            <span>Sim step: {simStepMs.toFixed(2)} ms</span>
            <span>Tick: {state.reloj.tick}</span>
            <span>
              Hosp: {derived.hospitalOcupacionPct}% ({derived.internados}/{derived.camasHospital})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">NPCs:</span>
              <input
                type="number"
                min={20}
                max={1000}
                step={10}
                value={devPopInput}
                onChange={(e) => setDevPopInput(Math.min(1000, Math.max(20, Number(e.target.value) || 20)))}
                className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-100"
              />
              <button
                type="button"
                onClick={() => onSetDevPopulation(devPopInput)}
                className="px-2 py-0.5 font-semibold bg-teal-700 hover:bg-teal-600 text-white rounded"
              >
                Aplicar
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Forzar evento:</span>
              <select
                value={devFenom}
                onChange={(e) => setDevFenom(e.target.value as PhenomenonType)}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
              >
                <option value="sequia">Sequía</option>
                <option value="plaga">Plaga agrícola</option>
                <option value="pandemia">Pandemia</option>
                <option value="plaga_zombie">Plaga zombie</option>
              </select>
              <select
                value={devZona}
                onChange={(e) => setDevZona(e.target.value as ZoneId)}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
              >
                <option value="centro">centro</option>
                <option value="norte">norte</option>
                <option value="este">este</option>
                <option value="sur">sur</option>
                <option value="oeste">oeste</option>
              </select>
              <button
                type="button"
                onClick={() => onForceClimate(devFenom, devZona)}
                className="px-2 py-0.5 font-semibold bg-amber-700 hover:bg-amber-600 text-white rounded"
              >
                Lanzar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
