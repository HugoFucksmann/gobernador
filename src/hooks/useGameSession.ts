import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ExtraLeverKey, GameController } from '../engine/gameController';
import { hasActiveCrisisAlert, sumPeriodExpenses } from '../engine/policies';
import { getActivePhenomena } from '../engine/simulation';
import {
  BuildingType,
  DistrictId,
  GovernorComplexityLevel,
  GovernorLevers,
  PhenomenonType,
  RoleId,
  WorldComplexityLevel,
  WorldConfig,
  ZoneId,
} from '../types/game';
import {
  CameraTarget,
  CityTab,
  LandmarkId,
  MapFilter,
  MapHoverPreview,
  MapLens,
  MonthlySummary,
  PaydaySummary,
  WindowId,
} from '../types/ui';
import {
  isSoundMuted,
  playAlertSfx,
  playDecisionSfx,
  playDemandSfx,
  playInaugurationSfx,
  setSoundMuted,
} from '../utils/soundFx';

interface CausalInspectTarget {
  title: string;
  ref?: string;
  fallbackText?: string;
}

export function useGameSession() {
  const controllerRef = useRef<GameController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new GameController();
  }
  const controller = controllerRef.current;

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  // Start flow & multi-window HUD state
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [openWindows, setOpenWindows] = useState<WindowId[]>([]);
  const [ciudadTabRequest, setCiudadTabRequest] = useState<{ tab: CityTab; seq: number } | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [selectedParcelaId, setSelectedParcelaId] = useState<string | null>(null);
  const [selectedTramoId, setSelectedTramoId] = useState<string | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkId | null>(null);
  const [sideBuildOpen, setSideBuildOpen] = useState<boolean>(false);
  const [followSelected, setFollowSelected] = useState<boolean>(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>('todos');
  const [mapLens, setMapLens] = useState<MapLens>('ninguna');
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ delta: number; seq: number } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);
  const [hoveredPreview, setHoveredPreview] = useState<MapHoverPreview | null>(null);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [milestoneBannerDismissed, setMilestoneBannerDismissed] = useState<boolean>(false);
  const [causalInspect, setCausalInspect] = useState<CausalInspectTarget | null>(null);
  const [paydaySummary, setPaydaySummary] = useState<PaydaySummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [soundMutedState, setSoundMutedState] = useState<boolean>(() => isSoundMuted());
  const uiSeqRef = useRef(0);

  const prevPeriodoRef = useRef(snapshot.state.reloj.periodo);
  const prevDiaRef = useRef(snapshot.state.reloj.dia);
  const prevDemandsRef = useRef(snapshot.state.demandasActivas.length);
  const prevActiveFenRef = useRef(getActivePhenomena(snapshot.state).length);
  const prevBuiltCountRef = useRef(
    snapshot.state.parcelas.filter((p) => p.estado === 'ocupada' && p.edificio).length +
      snapshot.state.tramos.filter((t) => t.construida).length
  );

  // Start controller paused on Day 1 until player confirms scenario briefing
  useEffect(() => {
    controller.setPaused(true);
    controller.start();
    return () => {
      controller.destroy();
    };
  }, [controller]);

  // Period close (payday) + 30-day evaluation + subtle audio cues
  useEffect(() => {
    const st = snapshot.state;
    const derived = snapshot.derived;
    const builtCount =
      st.parcelas.filter((p) => p.estado === 'ocupada' && p.edificio).length +
      st.tramos.filter((t) => t.construida).length;

    if (st.reloj.dia !== prevDiaRef.current) {
      if (st.reloj.dia < prevDiaRef.current) {
        // New game or loaded save: reset trackers cleanly
        setPaydaySummary(null);
        setMonthlySummary(null);
      } else if (hasStarted && st.resultado.estado === 'jugando') {
        if (st.reloj.periodo > prevPeriodoRef.current) {
          const gastos = sumPeriodExpenses(st.gobierno.finanzas);
          setPaydaySummary({
            periodo: prevPeriodoRef.current,
            dia: st.reloj.dia,
            ingresos: st.gobierno.finanzas.ingresos,
            gastos,
            saldo: st.gobierno.finanzas.saldo,
            reserva: st.gobierno.reserva,
          });
        }
        if (st.reloj.dia >= 30 && st.reloj.dia % 30 === 0) {
          const positives: string[] = [];
          const negatives: string[] = [];
          if (derived.hambreCriticaPct < 5) positives.push('Abasto de alimentos estable');
          else negatives.push(`Hambre crítica en ${derived.hambreCriticaPct}%`);
          if (derived.callePct <= 5) positives.push('Cobertura habitacional sólida');
          else negatives.push(`${derived.callePct}% de hogares sin techo`);
          if (st.gobierno.finanzas.impago) negatives.push('Atraso de pagos del Tesoro');
          else if (st.gobierno.finanzas.saldo >= 0) positives.push('Cuentas públicas equilibradas');
          else negatives.push('Déficit en el último período');
          if (derived.satisfaccionMedia >= 60) positives.push(`Ánimo ciudadano en ${derived.satisfaccionMedia}%`);
          else if (derived.satisfaccionMedia < 45) negatives.push(`Ánimo bajo (${derived.satisfaccionMedia}%)`);
          if (derived.desempleoPct > 18) negatives.push(`Desempleo elevado (${derived.desempleoPct}%)`);
          else if (derived.desempleoPct <= 8) positives.push('Empleo activo en las firmas');
          const brokenTramos = st.tramos.filter((t) => t.construida && t.estado <= 0).length;
          if (brokenTramos > 0) negatives.push(`${brokenTramos} vía(s) cortada(s)`);

          setMonthlySummary({
            dia: st.reloj.dia,
            apoyoPct: derived.apoyoPct,
            poblacion: derived.poblacion,
            reserva: st.gobierno.reserva,
            topPositivos: positives.slice(0, 3),
            topNegativos: negatives.slice(0, 3),
          });
        }
      }
      prevDiaRef.current = st.reloj.dia;
    }

    if (hasStarted) {
      if (st.demandasActivas.length > prevDemandsRef.current) {
        playDemandSfx();
      }
      const activeFenCount = getActivePhenomena(st).length;
      if (activeFenCount > prevActiveFenRef.current || (st.gobierno.finanzas.impago && st.reloj.periodo > prevPeriodoRef.current)) {
        playAlertSfx();
      } else if (builtCount > prevBuiltCountRef.current) {
        playInaugurationSfx();
      }
    }

    prevPeriodoRef.current = st.reloj.periodo;
    prevDemandsRef.current = st.demandasActivas.length;
    prevActiveFenRef.current = getActivePhenomena(st).length;
    prevBuiltCountRef.current = builtCount;
  }, [snapshot.state, snapshot.derived, hasStarted]);

  // Global keyboard shortcuts (Escape closes topmost overlay/window, Space toggles pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (causalInspect) {
          setCausalInspect(null);
        } else if (showConfigModal) {
          setShowConfigModal(false);
        } else if (openWindows.length > 0) {
          setOpenWindows((prev) => prev.slice(0, -1));
        } else if (selectedNpcId) {
          setSelectedNpcId(null);
          setFollowSelected(false);
        } else if (selectedParcelaId) {
          setSelectedParcelaId(null);
        } else if (selectedTramoId) {
          setSelectedTramoId(null);
        } else if (selectedLandmark) {
          setSelectedLandmark(null);
        } else if (sideBuildOpen) {
          setSideBuildOpen(false);
        }
      } else if (e.key === ' ' && hasStarted && !showConfigModal && !causalInspect) {
        const activeEl = document.activeElement as HTMLElement | null;
        const tag = activeEl?.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && !activeEl?.isContentEditable) {
          e.preventDefault();
          controller.togglePause();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hasStarted,
    openWindows.length,
    selectedNpcId,
    selectedParcelaId,
    selectedTramoId,
    selectedLandmark,
    sideBuildOpen,
    showConfigModal,
    causalInspect,
    controller,
  ]);

  const selectedNpc = useMemo(
    () => snapshot.state.npcs.find((n) => n.id === selectedNpcId && n.vivo) || null,
    [snapshot.state.npcs, selectedNpcId]
  );

  const selectedParcela = useMemo(
    () => snapshot.state.parcelas.find((p) => p.id === selectedParcelaId) || null,
    [snapshot.state.parcelas, selectedParcelaId]
  );

  const selectedTramo = useMemo(
    () => snapshot.state.tramos.find((t) => t.id === selectedTramoId) || null,
    [snapshot.state.tramos, selectedTramoId]
  );

  const hasConditionAlert = useMemo(
    () => hasActiveCrisisAlert(snapshot.state, snapshot.derived),
    [snapshot.state, snapshot.derived]
  );

  const selectNpc = useCallback((npcId: string) => {
    setSelectedParcelaId(null);
    setSelectedTramoId(null);
    setSelectedLandmark(null);
    setSideBuildOpen(false);
    setSelectedNpcId(npcId);
  }, []);

  const clearSelectedNpc = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
  }, []);

  const selectParcela = useCallback((parcelaId: string) => {
    setSelectedNpcId(null);
    setFollowSelected(false);
    setSelectedTramoId(null);
    setSelectedLandmark(null);
    setSideBuildOpen(false);
    setSelectedParcelaId(parcelaId);
  }, []);

  const clearSelectedParcela = useCallback(() => {
    setSelectedParcelaId(null);
  }, []);

  const selectTramo = useCallback((tramoId: string) => {
    setSelectedNpcId(null);
    setFollowSelected(false);
    setSelectedParcelaId(null);
    setSelectedLandmark(null);
    setSideBuildOpen(false);
    setSelectedTramoId(tramoId);
  }, []);

  const clearSidePanel = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
    setSelectedParcelaId(null);
    setSelectedTramoId(null);
    setSelectedLandmark(null);
    setSideBuildOpen(false);
    setHoveredPreview(null);
  }, []);

  const toggleBuildPanel = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
    setSelectedParcelaId(null);
    setSelectedTramoId(null);
    setSelectedLandmark(null);
    setSideBuildOpen((prev) => !prev);
  }, []);

  const selectRoleSample = useCallback(
    (role: RoleId) => {
      const candidate = controller.getState().npcs.find((n) => n.vivo && n.rol === role);
      if (candidate) {
        selectNpc(candidate.id);
        setFollowSelected(true);
      }
    },
    [controller, selectNpc]
  );

  const togglePause = useCallback(() => controller.togglePause(), [controller]);
  const setSpeed = useCallback((spd: number) => controller.setSpeed(spd), [controller]);
  const stepDay = useCallback(() => controller.stepDay(), [controller]);
  const setDevMode = useCallback((enabled: boolean) => controller.setDevMode(enabled), [controller]);
  const setDevPopulation = useCallback((pop: number) => controller.setDevPopulation(pop), [controller]);
  const setEstadoAutomatico = useCallback(
    (enabled: boolean) => controller.setEstadoAutomatico(enabled),
    [controller]
  );
  const setDevComplexity = useCallback(
    (nivelMundo: WorldComplexityLevel, nivelGobernador: GovernorComplexityLevel) =>
      controller.setDevComplexity(nivelMundo, nivelGobernador),
    [controller]
  );

  const forceClimatePhenomenon = useCallback(
    (tipo: PhenomenonType, zona?: ZoneId) => controller.forceClimatePhenomenon(tipo, zona),
    [controller]
  );

  const saveManual = useCallback(() => controller.saveManual(), [controller]);

  const loadManual = useCallback(() => {
    const ok = controller.loadManual();
    if (ok) {
      setHasStarted(true);
      setSelectedNpcId(null);
      setSelectedParcelaId(null);
      setSelectedTramoId(null);
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setMilestoneBannerDismissed(true);
      setCausalInspect(null);
      setPaydaySummary(null);
      setMonthlySummary(null);
    }
    return ok;
  }, [controller]);

  const loadAutoSave = useCallback(() => {
    const ok = controller.loadAutoSave();
    if (ok) {
      setHasStarted(true);
      setSelectedNpcId(null);
      setSelectedParcelaId(null);
      setSelectedTramoId(null);
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setMilestoneBannerDismissed(true);
      setCausalInspect(null);
      setPaydaySummary(null);
      setMonthlySummary(null);
    }
    return ok;
  }, [controller]);

  const updateLevers = useCallback(
    (updater: (prev: GovernorLevers) => GovernorLevers) => {
      controller.updateLevers(updater);
      playDecisionSfx();
    },
    [controller]
  );

  const setExtraLever = useCallback(
    (key: ExtraLeverKey, value: number) => {
      const res = controller.setExtraLever(key, value);
      if (res.ok) playDecisionSfx();
      return res;
    },
    [controller]
  );

  const buildInParcela = useCallback(
    (parcelaId: string, tipo: BuildingType) => {
      const res = controller.buildInParcela(parcelaId, tipo);
      if (res.ok) playDecisionSfx();
      return res;
    },
    [controller]
  );

  const buildVia = useCallback(
    (tramoId: string) => {
      const res = controller.buildVia(tramoId);
      if (res.ok) playDecisionSfx();
      return res;
    },
    [controller]
  );

  const demolishParcela = useCallback(
    (parcelaId: string) => {
      const res = controller.demolishParcela(parcelaId);
      if (res.ok) playDecisionSfx();
      return res;
    },
    [controller]
  );

  const respondDemand = useCallback(
    (demandId: string, accept: boolean) => {
      const res = controller.respondDemand(demandId, accept);
      if (res.ok) playDecisionSfx();
      return res;
    },
    [controller]
  );

  const counterOffer = useCallback(
    (demandId: string) => {
      const res = controller.counterOffer(demandId);
      if (res.ok) playDecisionSfx();
      return res;
    },
    [controller]
  );

  const triggerPressManual = useCallback(() => {
    void controller.triggerPressManual();
  }, [controller]);

  const beginQuickGame = useCallback(
    (escenarioId: 'elecciones' | 'zombies') => {
      const current = controller.getState().config;
      if (current.escenarioId === escenarioId && controller.getState().reloj.dia === 1) {
        setHasStarted(true);
        controller.setPaused(false);
        return;
      }
      setSelectedNpcId(null);
      setSelectedParcelaId(null);
      setSelectedTramoId(null);
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setOpenWindows([]);
      setMilestoneBannerDismissed(false);
      setCausalInspect(null);
      setPaydaySummary(null);
      setMonthlySummary(null);
      setHasStarted(true);
      controller.startNewGame({
        ...current,
        escenarioId,
      });
    },
    [controller]
  );

  const startNewGame = useCallback(
    (newConfig: WorldConfig) => {
      setSelectedNpcId(null);
      setSelectedParcelaId(null);
      setSelectedTramoId(null);
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setOpenWindows([]);
      setMilestoneBannerDismissed(false);
      setCausalInspect(null);
      setPaydaySummary(null);
      setMonthlySummary(null);
      setHasStarted(true);
      controller.startNewGame(newConfig);
    },
    [controller]
  );

  const jumpToDistrict = useCallback((district: DistrictId | 'all') => {
    setFollowSelected(false);
    uiSeqRef.current += 1;
    setCameraTarget({ district, seq: uiSeqRef.current });
  }, []);

  const jumpToZone = useCallback((zone: ZoneId | 'all') => {
    setFollowSelected(false);
    uiSeqRef.current += 1;
    setCameraTarget({ zone, seq: uiSeqRef.current });
  }, []);

  const focusWindow = useCallback((winId: WindowId) => {
    setOpenWindows((prev) => {
      if (!prev.includes(winId)) return [...prev, winId];
      if (prev[prev.length - 1] === winId) return prev;
      return [...prev.filter((w) => w !== winId), winId];
    });
  }, []);

  const openWindow = useCallback((winId: WindowId) => {
    setOpenWindows((prev) => [...prev.filter((w) => w !== winId), winId]);
  }, []);

  const closeWindow = useCallback((winId: WindowId) => {
    setOpenWindows((prev) => prev.filter((w) => w !== winId));
  }, []);

  const toggleWindow = useCallback((winId: WindowId) => {
    setOpenWindows((prev) =>
      prev.includes(winId) ? prev.filter((w) => w !== winId) : [...prev, winId]
    );
  }, []);

  const openCiudadTab = useCallback(
    (tab: CityTab) => {
      openWindow('ciudad');
      uiSeqRef.current += 1;
      setCiudadTabRequest({ tab, seq: uiSeqRef.current });
    },
    [openWindow]
  );

  const openLandmarkWindow = useCallback(
    (winId: WindowId, _tabHint?: CityTab) => {
      const lm: LandmarkId =
        winId === 'gaceta' ? 'prensa' : winId === 'economia' ? 'mercado' : 'palacio';
      setSelectedNpcId(null);
      setFollowSelected(false);
      setSelectedParcelaId(null);
      setSelectedTramoId(null);
      setSideBuildOpen(false);
      setSelectedLandmark(lm);
    },
    []
  );

  const requestZoom = useCallback((delta: number) => {
    uiSeqRef.current += 1;
    setZoomRequest({ delta, seq: uiSeqRef.current });
  }, []);

  const cancelFollow = useCallback(() => setFollowSelected(false), []);

  const openCausalInspect = useCallback((target: CausalInspectTarget) => {
    setCausalInspect(target);
  }, []);

  const closeCausalInspect = useCallback(() => {
    setCausalInspect(null);
  }, []);

  const dismissMilestoneBanner = useCallback(() => {
    setMilestoneBannerDismissed(true);
  }, []);

  const dismissPaydaySummary = useCallback(() => setPaydaySummary(null), []);
  const dismissMonthlySummary = useCallback(() => setMonthlySummary(null), []);
  const toggleSoundMute = useCallback(() => {
    setSoundMutedState((prev) => {
      const next = !prev;
      setSoundMuted(next);
      return next;
    });
  }, []);

  return {
    ...snapshot,
    selectedNpc,
    selectedParcela,
    selectedTramo,
    selectedLandmark,
    sideBuildOpen,
    hasConditionAlert,

    // UI/Camera state
    hasStarted,
    openWindows,
    ciudadTabRequest,
    followSelected,
    mapFilter,
    mapLens,
    cameraTarget,
    zoomRequest,
    hoverInfo,
    hoveredPreview,
    showConfigModal,
    milestoneBannerDismissed,
    causalInspect,
    paydaySummary,
    monthlySummary,
    soundMuted: soundMutedState,

    // UI setters
    openWindow,
    closeWindow,
    toggleWindow,
    focusWindow,
    openCiudadTab,
    openLandmarkWindow,
    toggleBuildPanel,
    clearSidePanel,
    setFollowSelected,
    cancelFollow,
    setMapFilter,
    setMapLens,
    setHoverInfo,
    setHoveredPreview,
    setShowConfigModal,
    dismissMilestoneBanner,
    dismissPaydaySummary,
    dismissMonthlySummary,
    toggleSoundMute,
    openCausalInspect,
    closeCausalInspect,

    // Commands
    beginQuickGame,
    selectNpc,
    clearSelectedNpc,
    selectParcela,
    clearSelectedParcela,
    selectTramo,
    selectRoleSample,
    togglePause,
    setSpeed,
    stepDay,
    setDevMode,
    setDevPopulation,
    setEstadoAutomatico,
    setDevComplexity,
    forceClimatePhenomenon,
    saveManual,
    loadManual,
    loadAutoSave,
    updateLevers,
    setExtraLever,
    buildInParcela,
    buildVia,
    demolishParcela,
    respondDemand,
    counterOffer,
    triggerPressManual,
    startNewGame,
    jumpToDistrict,
    jumpToZone,
    requestZoom,
  };
}
