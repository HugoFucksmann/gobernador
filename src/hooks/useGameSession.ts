import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GameController } from '../engine/gameController';
import { hasActiveCrisisAlert } from '../engine/policies';
import { DistrictId, GovernorLevers, PhenomenonType, RoleId, WorldConfig, ZoneId } from '../types/game';
import { CameraTarget, CityTab, DockSection, MapFilter, MapLens } from '../types/ui';

export interface CausalInspectTarget {
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

  // Pure UI / viewport state
  const [activeSection, setActiveSection] = useState<DockSection | null>(null);
  const [ciudadTabRequest, setCiudadTabRequest] = useState<{ tab: CityTab; seq: number } | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [followSelected, setFollowSelected] = useState<boolean>(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>('todos');
  const [mapLens, setMapLens] = useState<MapLens>('roles');
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ delta: number; seq: number } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [milestoneBannerDismissed, setMilestoneBannerDismissed] = useState<boolean>(false);
  const [causalInspect, setCausalInspect] = useState<CausalInspectTarget | null>(null);

  // Start controller simulation + AI health check on mount
  useEffect(() => {
    controller.start();
    return () => {
      controller.destroy();
    };
  }, [controller]);

  // Global keyboard shortcuts (Escape closes UI panels, Space toggles pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (causalInspect) {
          setCausalInspect(null);
        } else if (showConfigModal) {
          setShowConfigModal(false);
        } else if (activeSection) {
          setActiveSection(null);
        } else if (selectedNpcId) {
          setSelectedNpcId(null);
          setFollowSelected(false);
        }
      } else if (
        e.key === ' ' &&
        !showConfigModal &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        controller.togglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSection, selectedNpcId, showConfigModal, causalInspect, controller]);

  const selectedNpc = useMemo(
    () => snapshot.state.npcs.find((n) => n.id === selectedNpcId && n.vivo) || null,
    [snapshot.state.npcs, selectedNpcId]
  );

  const hasConditionAlert = useMemo(
    () => hasActiveCrisisAlert(snapshot.state, snapshot.derived),
    [snapshot.state, snapshot.derived]
  );

  // Actions bridging UI events -> Headless Controller
  const selectNpc = useCallback((npcId: string) => {
    setSelectedNpcId(npcId);
  }, []);

  const clearSelectedNpc = useCallback(() => {
    setSelectedNpcId(null);
    setFollowSelected(false);
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

  const forceClimatePhenomenon = useCallback(
    (tipo: PhenomenonType, zona?: ZoneId) => controller.forceClimatePhenomenon(tipo, zona),
    [controller]
  );

  const saveManual = useCallback(() => controller.saveManual(), [controller]);

  const loadManual = useCallback(() => {
    const ok = controller.loadManual();
    if (ok) {
      setSelectedNpcId(null);
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
      setSelectedNpcId(null);
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

  const updateMediaIntervention = useCallback(
    (medioId: string, field: 'financiamiento' | 'regulacion', value: number) => {
      controller.updateMediaIntervention(medioId, field, value);
    },
    [controller]
  );

  const triggerPressManual = useCallback(() => {
    void controller.triggerPressManual();
  }, [controller]);

  const startNewGame = useCallback(
    (newConfig: WorldConfig) => {
      setSelectedNpcId(null);
      setFollowSelected(false);
      setShowConfigModal(false);
      setActiveSection(null);
      setMilestoneBannerDismissed(false);
      setCausalInspect(null);
      controller.startNewGame(newConfig);
    },
    [controller]
  );

  const jumpToDistrict = useCallback((district: DistrictId | 'all') => {
    setFollowSelected(false);
    setCameraTarget({ district, seq: Date.now() + Math.random() });
  }, []);

  const openCiudadTab = useCallback((tab: CityTab) => {
    setActiveSection('ciudad');
    setCiudadTabRequest({ tab, seq: Date.now() + Math.random() });
  }, []);

  const openAlertsDrawer = useCallback(() => {
    openCiudadTab('alertas');
  }, [openCiudadTab]);

  const openLandmarkSection = useCallback(
    (sec: DockSection, tabHint?: CityTab) => {
      setActiveSection(sec);
      if (sec === 'ciudad' && tabHint) {
        setCiudadTabRequest({ tab: tabHint, seq: Date.now() + Math.random() });
      }
    },
    []
  );

  const requestZoom = useCallback((delta: number) => {
    setZoomRequest({ delta, seq: Date.now() + Math.random() });
  }, []);

  const cancelFollow = useCallback(() => setFollowSelected(false), []);

  const toggleSection = useCallback((sec: DockSection) => {
    setActiveSection((prev) => (prev === sec ? null : sec));
  }, []);

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
    // Domain snapshot
    ...snapshot,
    selectedNpc,
    hasConditionAlert,

    // UI/Camera state
    activeSection,
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
    setActiveSection,
    toggleSection,
    openAlertsDrawer,
    openCiudadTab,
    openLandmarkSection,
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
    selectNpc,
    clearSelectedNpc,
    selectRoleSample,
    togglePause,
    setSpeed,
    stepDay,
    setDevMode,
    forceClimatePhenomenon,
    saveManual,
    loadManual,
    loadAutoSave,
    updateLevers,
    updateMediaIntervention,
    triggerPressManual,
    startNewGame,
    jumpToDistrict,
    requestZoom,
  };
}

