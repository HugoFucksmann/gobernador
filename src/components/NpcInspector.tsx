import React from 'react';
import { RefreshCw, X, MessageSquareQuote } from 'lucide-react';
import { ROLE_CATALOG } from '../data/catalogs';
import { getEffectiveTrait, getModifierDelta, getNpcProductivity, getStage } from '../engine/simulation';
import { CommunityDerived, GameState, Npc, PersonalityTrait, RoleId } from '../types/game';

interface NpcInspectorProps {
  state: GameState;
  derived: CommunityDerived;
  selectedNpc: Npc | null;
  onClearSelection: () => void;
  onSelectRoleSample: (role: RoleId) => void;
  onRefreshThought: (npcId: string) => void;
  thoughtLoading: boolean;
}

const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  valentia: 'Valentía',
  laboriosidad: 'Laboriosidad',
  codicia: 'Codicia',
  rebeldia: 'Rebeldía',
  resiliencia: 'Resiliencia',
};

const EDUC_LABELS = ['Sin estudios', 'Básico', 'Medio', 'Superior'];

export const NpcInspector: React.FC<NpcInspectorProps> = ({
  state,
  derived,
  selectedNpc,
  onClearSelection,
  onSelectRoleSample,
  onRefreshThought,
  thoughtLoading,
}) => {
  if (!selectedNpc) {
    return (
      <aside className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Comunidad (datos derivados)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            La comunidad no tiene estado propio: todas estas métricas se calculan desde los {derived.poblacion} habitantes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-3 border-y border-slate-100 text-xs">
          <div>
            <div className="text-slate-500">Satisfacción media</div>
            <div className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {derived.satisfaccionMedia}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">Apoyo electoral (lealtad ≥ 50)</div>
            <div className={`font-mono text-lg font-semibold tabular-nums ${derived.apoyoPct >= 50 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {derived.apoyoPct}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">Descontentos (sat. &lt; 30)</div>
            <div className={`font-mono text-lg font-semibold tabular-nums ${derived.descontentosPct > 30 ? 'text-rose-700' : 'text-slate-900'}`}>
              {derived.descontentosPct}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">Hambre crítica (&gt; 80)</div>
            <div className={`font-mono text-lg font-semibold tabular-nums ${derived.hambreCriticaPct > 20 ? 'text-rose-700' : 'text-slate-900'}`}>
              {derived.hambreCriticaPct}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">Sin poder pagar comida</div>
            <div className="font-mono text-base font-semibold text-slate-900 tabular-nums">
              {derived.sinDineroPct}%
            </div>
          </div>
          <div>
            <div className="text-slate-500">Productividad total</div>
            <div className="font-mono text-base font-semibold text-slate-900 tabular-nums">
              {derived.productividadTotal}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-700 mb-2">
            Distribución de roles (clic para inspeccionar un habitante)
          </h3>
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {(Object.keys(ROLE_CATALOG) as RoleId[]).map((roleId) => {
              const def = ROLE_CATALOG[roleId];
              const count = derived.roles[roleId];
              return (
                <button
                  key={roleId}
                  type="button"
                  disabled={count === 0}
                  onClick={() => onSelectRoleSample(roleId)}
                  className="w-full flex items-center justify-between py-2 px-1 text-left text-xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <span className="flex items-center gap-2 text-slate-800 font-medium">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: def.color }}
                    />
                    {def.nombre}
                  </span>
                  <span className="font-mono text-slate-600 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    );
  }

  const def = ROLE_CATALOG[selectedNpc.rol];
  const stage = getStage(selectedNpc.edad);
  const prod = Math.round(getNpcProductivity(selectedNpc, state) * 100);

  return (
    <aside className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: def.color }}
            />
            <h2 className="text-lg font-semibold text-slate-900">{selectedNpc.nombre}</h2>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {def.nombre} · {selectedNpc.edad} años ({stage}) · Educ. {EDUC_LABELS[selectedNpc.educacion.nivel]}
          </div>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          title="Volver al resumen de comunidad"
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thought generated asynchronously by Gemini / template */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <MessageSquareQuote className="w-3.5 h-3.5 text-teal-700" />
            Pensamiento actual
          </span>
          <button
            type="button"
            onClick={() => onRefreshThought(selectedNpc.id)}
            disabled={thoughtLoading}
            className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${thoughtLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
        <p className="text-xs text-slate-700 italic leading-relaxed">
          {thoughtLoading && !selectedNpc.pensamientoCache
            ? 'Consultando pensamiento del habitante...'
            : `“${selectedNpc.pensamientoCache?.texto || 'Pensando en el día de hoy...'}”`}
        </p>
        {selectedNpc.pensamientoCache && (
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            Día {selectedNpc.pensamientoCache.dia} · origen: {selectedNpc.pensamientoCache.fuente}
          </div>
        )}
      </div>

      {/* Active AI / Condition Action */}
      {selectedNpc.accionIa && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-xs">
          <div className="font-semibold text-amber-900">
            {selectedNpc.accionIa.nombre} ({selectedNpc.accionIa.diasRestantes}d restantes)
          </div>
          <p className="text-amber-800 mt-0.5">{selectedNpc.accionIa.texto}</p>
          <div className="text-[11px] text-amber-700 font-mono mt-1">
            {selectedNpc.accionIa.origen}
            {selectedNpc.accionIa.reemplazaTrabajo ? ' · No produce mientras dure' : ''}
          </div>
        </div>
      )}

      {/* Economy & Productivity */}
      <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-xs font-mono tabular-nums">
        <div>
          <div className="font-sans text-slate-500">Productividad</div>
          <div className="font-semibold text-slate-900">{prod}%</div>
        </div>
        <div>
          <div className="font-sans text-slate-500">Ingreso neto/d</div>
          <div className="font-semibold text-slate-900">${selectedNpc.economia.ultimoIngresoNeto.toFixed(1)}</div>
        </div>
        <div>
          <div className="font-sans text-slate-500">Ahorros</div>
          <div className="font-semibold text-slate-900">
            {state.config.economiaModulo === 'simple' ? '—' : `$${selectedNpc.economia.dinero.toFixed(1)}`}
          </div>
        </div>
      </div>

      {/* Variables */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-700">Variables vitales y sociales</h3>
        {(
          [
            { key: 'salud', label: 'Salud', val: selectedNpc.variables.salud, invert: false },
            { key: 'hambre', label: 'Hambre', val: selectedNpc.variables.hambre, invert: true },
            { key: 'miedo', label: 'Miedo', val: selectedNpc.variables.miedo, invert: true },
            { key: 'satisfaccion', label: 'Satisfacción', val: selectedNpc.variables.satisfaccion, invert: false },
            { key: 'lealtad', label: 'Lealtad', val: selectedNpc.variables.lealtad, invert: false },
          ] as const
        ).map((item) => {
          const v = Math.round(item.val);
          const bad = item.invert ? v > 70 : v < 30;
          const barColor = bad ? 'bg-rose-600' : item.invert ? 'bg-amber-500' : 'bg-teal-600';
          return (
            <div key={item.key} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className="text-slate-600">{item.label}</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">{v}/100</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Personality Base vs Effective */}
      <div className="space-y-1.5 pt-2 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-700">Personalidad (base → efectiva)</h3>
        <div className="grid grid-cols-1 gap-1.5 text-xs">
          {(Object.keys(TRAIT_LABELS) as PersonalityTrait[]).map((trait) => {
            const base = selectedNpc.personalidad[trait];
            const eff = Math.round(getEffectiveTrait(selectedNpc, trait));
            const delta = Math.round(getModifierDelta(selectedNpc, trait));
            return (
              <div key={trait} className="flex items-center justify-between">
                <span className="text-slate-600">{TRAIT_LABELS[trait]}</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {base}
                  {delta !== 0 && (
                    <span className={delta > 0 ? 'text-amber-700 ml-1' : 'text-teal-700 ml-1'}>
                      ({delta > 0 ? '+' : ''}
                      {delta} → {eff})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Modifiers */}
      <div className="pt-2 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-700 mb-1.5">
          Modificadores activos ({selectedNpc.modificadores.length})
        </h3>
        {selectedNpc.modificadores.length === 0 ? (
          <p className="text-xs text-slate-400">Sin modificadores temporales.</p>
        ) : (
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {selectedNpc.modificadores.map((mod) => (
              <div key={mod.id} className="text-xs border border-slate-100 rounded-md p-2 bg-slate-50">
                <div className="text-slate-800">{mod.texto}</div>
                <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                  {mod.origen} · {mod.diasRestantes}d restantes
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
