import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GameController } from '../engine/gameController';
import { hasActiveCrisisAlert } from '../engine/policies';
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
import { CameraTarget, CityTab, LandmarkId, MapFilter, MapLens, WindowId } from '../types/ui';

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
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkId | null>(null);
  const [sideBuildOpen, setSideBuildOpen] = useState<boolean>(false);
  const [followSelected, setFollowSelected] = useState<boolean>(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>('todos');
  const [mapLens, setMapLens] = useState<MapLens>('ninguna');
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ delta: number; seq: number } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [milestoneBannerDismissed, setMilestoneBannerDismissed] = useState<boolean>(false);
  const [causalInspect, setCausalInspect] = useState<CausalInspectTarget | null>(null);
  const uiSeqRef = useRef(0);

  // Start controller paused on Day 1 until player confirms scenario briefing
  useEffect(() => {
    controller.setPaused(true);
    controller.start();
    return () => {
      controller.destroy();
    };
  }, [controller]);

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

  const hasConditionAlert = useMemo(
    () => hasActiveCrisisAlert(snapshot.state, snapshot.derived),
    [snapshot.state, snapshot.derived]
  );

  const selectNpc = useCallback((npcId: string) => {
    setSelectedParcelaId(null);
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
    setSelectedLandmark(null);
    setSideBuildOpen(false);
    setSelectedParcelaId(parcelaId);
  }, []);

  const clearSelectedParcela = useCallback(() => {
    setSelectedParcelaId(null);
  }, []);

  const clearSidePanel = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
    setSelectedParcelaId(null);
    setSelectedLandmark(null);
    setSideBuildOpen(false);
  }, []);

  const toggleBuildPanel = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
    setSelectedParcelaId(null);
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
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setMilestoneBannerDismissed(true);
      setCausalInspect(null);
    }
    return ok;
  }, [controller]);

  const loadAutoSave = useCallback(() => {
    const ok = controller.loadAutoSave();
    if (ok) {
      setHasStarted(true);
      setSelectedNpcId(null);
      setSelectedParcelaId(null);
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setMilestoneBannerDismissed(true);
      setCausalInspect(null);
    }
    return ok;
  }, [controller]);

  const updateLevers = useCallback(
    (updater: (prev: GovernorLevers) => GovernorLevers) => {
      controller.updateLevers(updater);
    },
    [controller]
  );

  const buildInParcela = useCallback(
    (parcelaId: string, tipo: BuildingType) => controller.buildInParcela(parcelaId, tipo),
    [controller]
  );

  const demolishParcela = useCallback(
    (parcelaId: string) => controller.demolishParcela(parcelaId),
    [controller]
  );

  const respondDemand = useCallback(
    (demandId: string, accept: boolean) => controller.respondDemand(demandId, accept),
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
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setOpenWindows([]);
      setMilestoneBannerDismissed(false);
      setCausalInspect(null);
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
      setSelectedLandmark(null);
      setSideBuildOpen(false);
      setFollowSelected(false);
      setShowConfigModal(false);
      setOpenWindows([]);
      setMilestoneBannerDismissed(false);
      setCausalInspect(null);
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

  return {
    ...snapshot,
    selectedNpc,
    selectedParcela,
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
    showConfigModal,
    milestoneBannerDismissed,
    causalInspect,

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
    setShowConfigModal,
    dismissMilestoneBanner,
    openCausalInspect,
    closeCausalInspect,

    // Commands
    beginQuickGame,
    selectNpc,
    clearSelectedNpc,
    selectParcela,
    clearSelectedParcela,
    selectRoleSample,
    togglePause,
    setSpeed,
    stepDay,
    setDevMode,
    setDevPopulation,
    setDevComplexity,
    forceClimatePhenomenon,
    saveManual,
    loadManual,
    loadAutoSave,
    updateLevers,
    buildInParcela,
    demolishParcela,
    respondDemand,
    triggerPressManual,
    startNewGame,
    jumpToDistrict,
    requestZoom,
  };
}
