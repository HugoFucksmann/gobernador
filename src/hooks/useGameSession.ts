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

export type InspectorDirectoryTab = 'personas' | 'hogares' | 'firmas';

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
  const [selectedHogarId, setSelectedHogarId] = useState<string | null>(null);
  const [selectedParcelaId, setSelectedParcelaId] = useState<string | null>(null);
  const [selectedFirmaId, setSelectedFirmaId] = useState<string | null>(null);
  const [selectedTramoId, setSelectedTramoId] = useState<string | null>(null);
  const [selectedZonaId, setSelectedZonaId] = useState<ZoneId | null>(null);
  const [selectedMedioId, setSelectedMedioId] = useState<string | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkId | null>(null);
  const [inspectorSearchOpen, setInspectorSearchOpen] = useState<InspectorDirectoryTab | null>(null);
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

    const isG0 =
      (st.config.nivelGobernador ?? (st.config.economiaModulo === 'fiscal' ? 'G3' : 'G2')) === 'G0' ||
      Boolean(st.config.estadoAutomatico);

    if (st.reloj.dia !== prevDiaRef.current) {
      if (st.reloj.dia < prevDiaRef.current) {
        setPaydaySummary(null);
        setMonthlySummary(null);
      } else if (hasStarted && st.resultado.estado === 'jugando' && !isG0) {
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

    if (hasStarted && (!isG0 || st.devMode)) {
      if (!isG0 && st.demandasActivas.length > prevDemandsRef.current) {
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

  const clearSideSelectionIds = useCallback(() => {
    setSelectedNpcId(null);
    setSelectedHogarId(null);
    setSelectedParcelaId(null);
    setSelectedFirmaId(null);
    setSelectedTramoId(null);
    setSelectedZonaId(null);
    setSelectedMedioId(null);
    setSelectedLandmark(null);
    setInspectorSearchOpen(null);
    setSideBuildOpen(false);
    setFollowSelected(false);
  }, []);

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
        } else if (
          selectedNpcId ||
          selectedHogarId ||
          selectedParcelaId ||
          selectedFirmaId ||
          selectedTramoId ||
          selectedZonaId ||
          selectedMedioId ||
          selectedLandmark ||
          inspectorSearchOpen ||
          sideBuildOpen
        ) {
          clearSideSelectionIds();
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
    selectedHogarId,
    selectedParcelaId,
    selectedFirmaId,
    selectedTramoId,
    selectedZonaId,
    selectedMedioId,
    selectedLandmark,
    inspectorSearchOpen,
    sideBuildOpen,
    showConfigModal,
    causalInspect,
    controller,
    clearSideSelectionIds,
  ]);

  const selectedNpc = useMemo(
    () => snapshot.state.npcs.find((n) => n.id === selectedNpcId && n.vivo) || null,
    [snapshot.state.npcs, selectedNpcId]
  );

  const selectedHogar = useMemo(
    () => snapshot.state.hogares.find((h) => h.id === selectedHogarId) || null,
    [snapshot.state.hogares, selectedHogarId]
  );

  const selectedParcela = useMemo(
    () => snapshot.state.parcelas.find((p) => p.id === selectedParcelaId) || null,
    [snapshot.state.parcelas, selectedParcelaId]
  );

  const selectedFirma = useMemo(
    () => snapshot.state.firmas.find((f) => f.id === selectedFirmaId) || null,
    [snapshot.state.firmas, selectedFirmaId]
  );

  const selectedTramo = useMemo(
    () => snapshot.state.tramos.find((t) => t.id === selectedTramoId) || null,
    [snapshot.state.tramos, selectedTramoId]
  );

  const selectedZona = useMemo(
    () => (selectedZonaId ? snapshot.state.zonas[selectedZonaId] || null : null),
    [snapshot.state.zonas, selectedZonaId]
  );

  const selectedMedio = useMemo(
    () => snapshot.state.medios.find((m) => m.id === selectedMedioId) || null,
    [snapshot.state.medios, selectedMedioId]
  );

  const hasConditionAlert = useMemo(
    () => hasActiveCrisisAlert(snapshot.state, snapshot.derived),
    [snapshot.state, snapshot.derived]
  );

  const selectNpc = useCallback((npcId: string) => {
    clearSideSelectionIds();
    setSelectedNpcId(npcId);
  }, [clearSideSelectionIds]);

  const clearSelectedNpc = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
  }, []);

  const selectHogar = useCallback((hogarId: string) => {
    clearSideSelectionIds();
    setSelectedHogarId(hogarId);
  }, [clearSideSelectionIds]);

  const selectParcela = useCallback((parcelaId: string) => {
    clearSideSelectionIds();
    setSelectedParcelaId(parcelaId);
  }, [clearSideSelectionIds]);

  const clearSelectedParcela = useCallback(() => {
    setSelectedParcelaId(null);
  }, []);

  const selectFirma = useCallback((firmaId: string) => {
    clearSideSelectionIds();
    setSelectedFirmaId(firmaId);
  }, [clearSideSelectionIds]);

  const selectTramo = useCallback((tramoId: string) => {
    clearSideSelectionIds();
    setSelectedTramoId(tramoId);
  }, [clearSideSelectionIds]);

  const selectZona = useCallback((zonaId: ZoneId) => {
    clearSideSelectionIds();
    setSelectedZonaId(zonaId);
  }, [clearSideSelectionIds]);

  const selectMedio = useCallback((medioId: string) => {
    clearSideSelectionIds();
    setSelectedMedioId(medioId);
  }, [clearSideSelectionIds]);

  const openInspectorDirectory = useCallback((tab: InspectorDirectoryTab = 'personas') => {
    setInspectorSearchOpen((prev) => {
      if (prev === tab) return null;
      clearSideSelectionIds();
      return tab;
    });
  }, [clearSideSelectionIds]);

  const clearSidePanel = useCallback(() => {
    clearSideSelectionIds();
    setHoveredPreview(null);
  }, [clearSideSelectionIds]);

  const toggleBuildPanel = useCallback(() => {
    setSideBuildOpen((prev) => {
      const next = !prev;
      if (next) {
        setSelectedNpcId(null);
        setSelectedHogarId(null);
        setSelectedParcelaId(null);
        setSelectedFirmaId(null);
        setSelectedTramoId(null);
        setSelectedZonaId(null);
        setSelectedMedioId(null);
        setSelectedLandmark(null);
        setInspectorSearchOpen(null);
        setFollowSelected(false);
      }
      return next;
    });
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
  const setNoRender = useCallback((enabled: boolean) => controller.setNoRender(enabled), [controller]);
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
  const exportSaveJson = useCallback(() => controller.exportSaveJson(), [controller]);
  const exportMetricsJson = useCallback(() => controller.exportMetricsJson(), [controller]);

  const resetUiAfterLoad = useCallback(() => {
    setHasStarted(true);
    clearSideSelectionIds();
    setShowConfigModal(false);
    setMilestoneBannerDismissed(true);
    setCausalInspect(null);
    setPaydaySummary(null);
    setMonthlySummary(null);
  }, [clearSideSelectionIds]);

  const importSaveJson = useCallback(
    (raw: string) => {
      const res = controller.importSaveJson(raw);
      if (res.ok) resetUiAfterLoad();
      return res;
    },
    [controller, resetUiAfterLoad]
  );

  const loadManual = useCallback(() => {
    const ok = controller.loadManual();
    if (ok) resetUiAfterLoad();
    return ok;
  }, [controller, resetUiAfterLoad]);

  const loadAutoSave = useCallback(() => {
    const ok = controller.loadAutoSave();
    if (ok) resetUiAfterLoad();
    return ok;
  }, [controller, resetUiAfterLoad]);

  const canPlayDecisionSfx = useCallback(() => {
    const st = controller.getState();
    const g0 =
      (st.config.nivelGobernador ?? (st.config.economiaModulo === 'fiscal' ? 'G3' : 'G2')) === 'G0' ||
      Boolean(st.config.estadoAutomatico);
    return !g0 || Boolean(st.devMode);
  }, [controller]);

  const updateLevers = useCallback(
    (updater: (prev: GovernorLevers) => GovernorLevers) => {
      controller.updateLevers(updater);
      if (canPlayDecisionSfx()) playDecisionSfx();
    },
    [controller, canPlayDecisionSfx]
  );

  const setExtraLever = useCallback(
    (key: ExtraLeverKey, value: number) => {
      const res = controller.setExtraLever(key, value);
      if (res.ok && canPlayDecisionSfx()) playDecisionSfx();
      return res;
    },
    [controller, canPlayDecisionSfx]
  );

  const buildInParcela = useCallback(
    (parcelaId: string, tipo: BuildingType) => {
      const res = controller.buildInParcela(parcelaId, tipo);
      if (res.ok && canPlayDecisionSfx()) playDecisionSfx();
      return res;
    },
    [controller, canPlayDecisionSfx]
  );

  const buildVia = useCallback(
    (tramoId: string) => {
      const res = controller.buildVia(tramoId);
      if (res.ok && canPlayDecisionSfx()) playDecisionSfx();
      return res;
    },
    [controller, canPlayDecisionSfx]
  );

  const demolishParcela = useCallback(
    (parcelaId: string) => {
      const res = controller.demolishParcela(parcelaId);
      if (res.ok && canPlayDecisionSfx()) playDecisionSfx();
      return res;
    },
    [controller, canPlayDecisionSfx]
  );

  const respondDemand = useCallback(
    (demandId: string, accept: boolean) => {
      const res = controller.respondDemand(demandId, accept);
      if (res.ok && canPlayDecisionSfx()) playDecisionSfx();
      return res;
    },
    [controller, canPlayDecisionSfx]
  );

  const counterOffer = useCallback(
    (demandId: string) => {
      const res = controller.counterOffer(demandId);
      if (res.ok && canPlayDecisionSfx()) playDecisionSfx();
      return res;
    },
    [controller, canPlayDecisionSfx]
  );

  const triggerPressManual = useCallback(() => {
    void controller.triggerPressManual();
  }, [controller]);

  const beginQuickGame = useCallback(
    (
      escenarioId: 'elecciones' | 'zombies',
      options?: { mode?: 'observador' | 'gobernador'; poblacion?: number }
    ) => {
      const current = controller.getState().config;
      const mode = options?.mode ?? 'observador';
      const targetGov: GovernorComplexityLevel = mode === 'gobernador' ? 'G2' : 'G0';
      const targetAuto = mode === 'observador';
      const targetPop = options?.poblacion ?? current.poblacionInicial;

      const sameStartConfig =
        current.escenarioId === escenarioId &&
        (current.nivelGobernador ?? 'G0') === targetGov &&
        Boolean(current.estadoAutomatico) === targetAuto &&
        current.poblacionInicial === targetPop &&
        controller.getState().reloj.dia === 1;

      if (sameStartConfig) {
        setHasStarted(true);
        controller.setPaused(false);
        return;
      }
      clearSideSelectionIds();
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
        nivelGobernador: targetGov,
        estadoAutomatico: targetAuto,
        poblacionInicial: targetPop,
      });
    },
    [controller, clearSideSelectionIds]
  );

  const startNewGame = useCallback(
    (newConfig: WorldConfig) => {
      clearSideSelectionIds();
      setShowConfigModal(false);
      setOpenWindows([]);
      setMilestoneBannerDismissed(false);
      setCausalInspect(null);
      setPaydaySummary(null);
      setMonthlySummary(null);
      setHasStarted(true);
      controller.startNewGame(newConfig);
    },
    [controller, clearSideSelectionIds]
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

  const jumpToCoords = useCallback((wx: number, wy: number) => {
    setFollowSelected(false);
    uiSeqRef.current += 1;
    setCameraTarget({ wx, wy, seq: uiSeqRef.current });
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
      clearSideSelectionIds();
      setSelectedLandmark(lm);
    },
    [clearSideSelectionIds]
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
    selectedHogar,
    selectedParcela,
    selectedFirma,
    selectedTramo,
    selectedZona,
    selectedMedio,
    selectedLandmark,
    inspectorSearchOpen,
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
    openInspectorDirectory,
    setInspectorSearchOpen,
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
    selectHogar,
    selectParcela,
    clearSelectedParcela,
    selectFirma,
    selectTramo,
    selectZona,
    selectMedio,
    selectRoleSample,
    togglePause,
    setSpeed,
    stepDay,
    setDevMode,
    setNoRender,
    setDevPopulation,
    setEstadoAutomatico,
    setDevComplexity,
    forceClimatePhenomenon,
    saveManual,
    loadManual,
    loadAutoSave,
    exportSaveJson,
    importSaveJson,
    exportMetricsJson,
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
    jumpToCoords,
    requestZoom,
  };
}
