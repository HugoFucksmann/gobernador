import { CityWorldCanvas } from './components/CityWorldCanvas';
import { BottomDock } from './components/hud/BottomDock';
import { CausalInspectModal } from './components/hud/CausalChainView';
import { CityWindow } from './components/hud/CityWindow';
import { EconomyWindow } from './components/hud/EconomyWindow';
import { GameHudTop } from './components/hud/GameHudTop';
import { GazetteWindow } from './components/hud/GazetteWindow';
import { LeversWindow } from './components/hud/LeversWindow';
import { SideInspectorPanel } from './components/hud/SideInspectorPanel';
import { OutcomeBanner } from './components/OutcomeBanner';
import { StartBriefingModal } from './components/StartBriefingModal';
import { WorldConfigModal } from './components/WorldConfigModal';
import { useGameSession } from './hooks/useGameSession';

export default function App() {
  const session = useGameSession();
  const zFor = (id: 'palancas' | 'economia' | 'ciudad' | 'gaceta') =>
    22 + Math.max(0, session.openWindows.indexOf(id));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#2d4726] text-zinc-100">
      {/* 1. Full-Viewport Large Isometric City Stage */}
      <CityWorldCanvas
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        noRender={session.noRender}
        selectedNpcId={session.selectedNpc?.id ?? null}
        selectedParcelaId={session.selectedParcela?.id ?? null}
        selectedTramoId={session.selectedTramo?.id ?? null}
        selectedZonaId={session.selectedZona?.id ?? null}
        hoveredPreview={session.hoveredPreview}
        filter={session.mapFilter}
        lens={session.mapLens}
        followSelected={session.followSelected}
        cameraTarget={session.cameraTarget}
        zoomRequest={session.zoomRequest}
        onSelectNpc={session.selectNpc}
        onSelectParcela={session.selectParcela}
        onSelectTramo={session.selectTramo}
        onSelectZona={session.selectZona}
        onOpenSection={session.openLandmarkWindow}
        onCancelFollow={session.cancelFollow}
        onHoverInfoChange={session.setHoverInfo}
      />

      {/* 2. Floating Top Game HUD */}
      <GameHudTop
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        speed={session.speed}
        aiBusy={session.aiBusy}
        aiStatus={session.aiStatus}
        devMode={session.devMode}
        noRender={session.noRender}
        simStepMs={session.simStepMs}
        soundMuted={session.soundMuted}
        paydaySummary={session.paydaySummary}
        monthlySummary={session.monthlySummary}
        onTogglePause={session.togglePause}
        onSetSpeed={session.setSpeed}
        onStepDay={session.stepDay}
        onToggleSoundMute={session.toggleSoundMute}
        onDismissPayday={session.dismissPaydaySummary}
        onDismissMonthly={session.dismissMonthlySummary}
        onSetNoRender={session.setNoRender}
        onSetDevPopulation={session.setDevPopulation}
        onSetDevComplexity={session.setDevComplexity}
        onSetEstadoAutomatico={session.setEstadoAutomatico}
        onForceClimate={session.forceClimatePhenomenon}
        onExportSaveJson={session.exportSaveJson}
        onImportSaveJson={session.importSaveJson}
        onExportMetricsJson={session.exportMetricsJson}
        onOpenObjetivo={() => session.openCiudadTab('bitacora')}
        onOpenEconomia={() => session.openWindow('economia')}
        onOpenDemandas={() => session.openCiudadTab('alertas')}
      />

      {/* 3. Unified Lateral Panel (NPC, Hogar, Parcela, Firma, Vía, Zona, Medio, Landmark, Explorar, Construir) */}
      <SideInspectorPanel
        state={session.state}
        derived={session.derived}
        selectedNpc={session.selectedNpc}
        selectedHogar={session.selectedHogar}
        selectedParcela={session.selectedParcela}
        selectedFirma={session.selectedFirma}
        selectedTramo={session.selectedTramo}
        selectedZona={session.selectedZona}
        selectedMedio={session.selectedMedio}
        selectedLandmark={session.selectedLandmark}
        inspectorSearchOpen={session.inspectorSearchOpen}
        sideBuildOpen={session.sideBuildOpen}
        followSelected={session.followSelected}
        aiBusy={session.aiBusy}
        onToggleFollow={() => session.setFollowSelected((f) => !f)}
        onClosePanel={session.clearSidePanel}
        onSelectNpc={session.selectNpc}
        onSelectHogar={session.selectHogar}
        onSelectParcela={session.selectParcela}
        onSelectFirma={session.selectFirma}
        onSelectTramo={session.selectTramo}
        onSelectZona={session.selectZona}
        onSelectMedio={session.selectMedio}
        onOpenDirectory={session.openInspectorDirectory}
        onJumpDistrict={session.jumpToDistrict}
        onJumpZone={session.jumpToZone}
        onHoverPreview={session.setHoveredPreview}
        onBuildInParcela={session.buildInParcela}
        onBuildVia={session.buildVia}
        onDemolishParcela={session.demolishParcela}
        onRespondDemand={session.respondDemand}
        onCounterOffer={session.counterOffer}
        onOpenWindow={session.openWindow}
        onTriggerPress={session.triggerPressManual}
        onInspectCausal={(title, ref, fallbackText) =>
          session.openCausalInspect({ title, ref, fallbackText })
        }
      />

      {/* 4. Multi-Window Workspace */}
      {session.openWindows.includes('palancas') && (
        <LeversWindow
          state={session.state}
          derived={session.derived}
          zIndex={zFor('palancas')}
          onFocus={() => session.focusWindow('palancas')}
          onClose={() => session.closeWindow('palancas')}
          onUpdateLevers={session.updateLevers}
          onSetExtraLever={session.setExtraLever}
          onOpenBuildPanel={session.toggleBuildPanel}
        />
      )}

      {session.openWindows.includes('economia') && (
        <EconomyWindow
          state={session.state}
          derived={session.derived}
          zIndex={zFor('economia')}
          onFocus={() => session.focusWindow('economia')}
          onClose={() => session.closeWindow('economia')}
          onOpenPalancas={() => session.openWindow('palancas')}
          onJumpZone={session.jumpToZone}
          onSelectFirma={session.selectFirma}
          onInspectCausal={(title, ref, fallbackText) =>
            session.openCausalInspect({ title, ref, fallbackText })
          }
        />
      )}

      {session.openWindows.includes('ciudad') && (
        <CityWindow
          state={session.state}
          derived={session.derived}
          zIndex={zFor('ciudad')}
          ciudadTabRequest={session.ciudadTabRequest}
          onFocus={() => session.focusWindow('ciudad')}
          onClose={() => session.closeWindow('ciudad')}
          onJumpDistrict={session.jumpToDistrict}
          onJumpZone={session.jumpToZone}
          onSelectRoleSample={session.selectRoleSample}
          onSelectNpc={session.selectNpc}
          onSelectHogar={session.selectHogar}
          onSelectParcela={session.selectParcela}
          onSelectTramo={session.selectTramo}
          onBuildInParcela={session.buildInParcela}
          onBuildVia={session.buildVia}
          onDemolishParcela={session.demolishParcela}
          onRespondDemand={session.respondDemand}
          onCounterOffer={session.counterOffer}
          onHoverPreview={session.setHoveredPreview}
          onInspectCausal={(title, ref, fallbackText) =>
            session.openCausalInspect({ title, ref, fallbackText })
          }
        />
      )}

      {session.openWindows.includes('gaceta') && (
        <GazetteWindow
          state={session.state}
          aiBusy={session.aiBusy}
          zIndex={zFor('gaceta')}
          onFocus={() => session.focusWindow('gaceta')}
          onClose={() => session.closeWindow('gaceta')}
          onTriggerPress={session.triggerPressManual}
          onOpenPalancas={() => session.openWindow('palancas')}
          onSelectMedio={session.selectMedio}
          onInspectCausal={(title, ref, fallbackText) =>
            session.openCausalInspect({ title, ref, fallbackText })
          }
        />
      )}

      {/* 5. Centralized Bottom Dock */}
      <BottomDock
        state={session.state}
        sideBuildOpen={session.sideBuildOpen}
        directoryOpen={session.inspectorSearchOpen}
        openWindows={session.openWindows}
        mapLens={session.mapLens}
        mapFilter={session.mapFilter}
        devMode={session.devMode}
        hasConditionAlert={session.hasConditionAlert}
        onToggleBuild={session.toggleBuildPanel}
        onOpenDirectory={session.openInspectorDirectory}
        onToggleWindow={session.toggleWindow}
        onChangeLens={session.setMapLens}
        onChangeFilter={session.setMapFilter}
        onJumpZone={session.jumpToZone}
        onZoom={session.requestZoom}
        onOpenNewGame={() => session.setShowConfigModal(true)}
        onToggleDevMode={() => session.setDevMode(!session.devMode)}
      />

      {/* Initial Scenario Briefing before Day 1 starts */}
      {!session.hasStarted && !session.showConfigModal && (
        <StartBriefingModal
          initialScenario={session.state.config.escenarioId}
          manualSaveMeta={session.manualSaveMeta}
          autoSaveMeta={session.autoSaveMeta}
          onStartScenario={session.beginQuickGame}
          onOpenAdvancedConfig={() => session.setShowConfigModal(true)}
          onLoadManual={session.loadManual}
          onLoadAutoSave={session.loadAutoSave}
        />
      )}

      {session.showConfigModal && (
        <WorldConfigModal
          initialConfig={session.state.config}
          aiAvailable={session.aiAvailable}
          currentDay={session.state.reloj.dia}
          manualSaveMeta={session.manualSaveMeta}
          autoSaveMeta={session.autoSaveMeta}
          onSaveManual={session.saveManual}
          onLoadManual={session.loadManual}
          onLoadAutoSave={session.loadAutoSave}
          onStartNewGame={session.startNewGame}
          onClose={() => session.setShowConfigModal(false)}
        />
      )}

      <OutcomeBanner
        state={session.state}
        derived={session.derived}
        milestoneBannerDismissed={session.milestoneBannerDismissed}
        onDismissMilestone={session.dismissMilestoneBanner}
        onOpenNewGame={() => session.setShowConfigModal(true)}
      />

      {session.causalInspect && (
        <CausalInspectModal
          state={session.state}
          title={session.causalInspect.title}
          startRef={session.causalInspect.ref}
          fallbackText={session.causalInspect.fallbackText}
          onClose={session.closeCausalInspect}
          onSelectNpc={session.selectNpc}
          onJumpDistrict={session.jumpToDistrict}
          onJumpZone={session.jumpToZone}
        />
      )}
    </div>
  );
}
