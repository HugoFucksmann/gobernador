import { CityWorldCanvas } from './components/CityWorldCanvas';
import { CausalInspectModal } from './components/hud/CausalChainView';
import { CitizenCard } from './components/hud/CitizenCard';
import { CityWindow } from './components/hud/CityWindow';
import { EconomyWindow } from './components/hud/EconomyWindow';
import { GameHudTop } from './components/hud/GameHudTop';
import { GazetteWindow } from './components/hud/GazetteWindow';
import { LeversWindow } from './components/hud/LeversWindow';
import { RctStatusBar } from './components/hud/RctStatusBar';
import { OutcomeBanner } from './components/OutcomeBanner';
import { StartBriefingModal } from './components/StartBriefingModal';
import { WorldConfigModal } from './components/WorldConfigModal';
import { useGameSession } from './hooks/useGameSession';

export default function App() {
  const session = useGameSession();
  const zFor = (id: 'palancas' | 'economia' | 'ciudad' | 'gaceta') =>
    22 + Math.max(0, session.openWindows.indexOf(id));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#2d4726] text-slate-100">
      {/* 1. Full-Viewport Large Isometric City Stage */}
      <CityWorldCanvas
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        selectedNpcId={session.selectedNpc?.id ?? null}
        filter={session.mapFilter}
        roleFilter="todos"
        lens={session.mapLens}
        followSelected={session.followSelected}
        cameraTarget={session.cameraTarget}
        zoomRequest={session.zoomRequest}
        onSelectNpc={session.selectNpc}
        onOpenSection={session.openLandmarkWindow}
        onCancelFollow={session.cancelFollow}
        onHoverInfoChange={session.setHoverInfo}
      />

      {/* 2. Top Governance Bar */}
      <GameHudTop
        state={session.state}
        derived={session.derived}
        paused={session.paused}
        speed={session.speed}
        aiBusy={session.aiBusy}
        aiStatus={session.aiStatus}
        devMode={session.devMode}
        simStepMs={session.simStepMs}
        openWindows={session.openWindows}
        hasConditionAlert={session.hasConditionAlert}
        onTogglePause={session.togglePause}
        onSetSpeed={session.setSpeed}
        onStepDay={session.stepDay}
        onToggleDevMode={() => session.setDevMode(!session.devMode)}
        onSetDevPopulation={session.setDevPopulation}
        onForceClimate={session.forceClimatePhenomenon}
        onToggleWindow={session.toggleWindow}
        onOpenObjetivo={() => session.openCiudadTab('bitacora')}
        onOpenNewGame={() => session.setShowConfigModal(true)}
      />

      {/* 3. Right Citizen Inspector / Quick Pulse & News */}
      <CitizenCard
        state={session.state}
        derived={session.derived}
        selectedNpc={session.selectedNpc}
        followSelected={session.followSelected}
        onToggleFollow={() => session.setFollowSelected((f) => !f)}
        onClearSelection={session.clearSelectedNpc}
        onOpenCommunityDrawer={() => session.openCiudadTab('vecinos')}
        onOpenGazette={() => session.openWindow('gaceta')}
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
          onSelectRoleSample={session.selectRoleSample}
          onSelectNpc={session.selectNpc}
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
          onInspectCausal={(title, ref, fallbackText) =>
            session.openCausalInspect({ title, ref, fallbackText })
          }
        />
      )}

      {/* 5. Bottom Status & Map Controls Bar */}
      <RctStatusBar
        state={session.state}
        hoverInfo={session.hoverInfo}
        mapLens={session.mapLens}
        mapFilter={session.mapFilter}
        onChangeLens={session.setMapLens}
        onChangeFilter={session.setMapFilter}
        onJumpDistrict={session.jumpToDistrict}
        onZoom={session.requestZoom}
        onOpenPress={() => session.openWindow('gaceta')}
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
        />
      )}
    </div>
  );
}
